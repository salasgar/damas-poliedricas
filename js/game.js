/* Damas poliédricas · Copyright © 2026 Juan Luis Salas García */

'use strict';

/* Reglas de las damas poliédricas.

   El tablero es el grafo de vértices y aristas de un poliedro. En su turno,
   un jugador puede:
     - mover una ficha a un vértice adyacente vacío, o
     - comer: si un vértice adyacente tiene una ficha rival y esa ficha tiene
       a su vez algún vértice adyacente vacío, se salta sobre ella y se aterriza
       en ese vértice. A diferencia de las damas planas el salto no es
       rectilíneo: vale cualquier hueco vecino de la pieza comida.

   Los ejércitos empiezan en dos caras opuestas del poliedro. */

const EMPTY = -1;

/* Distancias en aristas desde el conjunto `sources` a todo el grafo, de una
   sola pasada (BFS con varios orígenes a la vez). */
function multiSourceDistances(neighbors, sources) {
  const dist = new Array(neighbors.length).fill(Infinity);
  const queue = [];
  for (const s of sources) {
    dist[s] = 0;
    queue.push(s);
  }
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (const nb of neighbors[v]) {
      if (dist[nb] === Infinity) {
        dist[nb] = dist[v] + 1;
        queue.push(nb);
      }
    }
  }
  return dist;
}

const DEFAULT_OPTIONS = {
  /* Número de bandos. Con más de dos, el reparto se hace por zonas alrededor
     de polos dispersos y el turno rota entre los que siguen en juego. */
  playerCount: 2,
  /* Cómo se decide el ganador:
     'elimination' – gana el último que queda con fichas; si se agota el límite
                     de jugadas sin comer, tablas
     'points'      – gana quien más fichas haya comido, también si le eliminaron
                     por el camino, y también cuando se agota ese límite
     'invasion'    – gana quien invada el campo contrario: cada jugada que
                     termina en un vértice del territorio de un rival vale un
                     punto, y se gana al llegar a tantos puntos como vértices
                     tiene ese territorio. Comer deja de ser el objetivo y pasa
                     a ser el medio de abrirse paso hasta el campo enemigo. */
  victory: 'elimination',
  /* Si hay capturas disponibles, ¿obliga a hacerlas? */
  mandatoryCapture: false,
  /* Encadenar capturas con la misma ficha:
     'off'      – una captura por turno
     'optional' – se puede seguir comiendo o plantarse
     'forced'   – si se puede seguir comiendo, hay que hacerlo */
  chainCaptures: 'optional',
  /* Semimovimientos sin comer tras los que se cierra la partida: con la regla
     por puntos gana el que va por delante, con la de invasión el que más campo
     contrario haya pisado, y sin ninguna de las dos son tablas. Con la regla de
     invasión el contador también se pone a cero al conseguir un punto: pisar el
     campo rival es progreso aunque no se coma nada. */
  drawPlies: 60,
  /* Caras de salida por jugador: 1 (ejércitos pequeños) o 2 (grandes). */
  homeSize: 1,
};

class Game {
  constructor(polyhedron, options = {}) {
    this.poly = polyhedron;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.reset();
  }

  reset() {
    const n = this.poly.vertices.length;
    this.pieces = new Array(n).fill(EMPTY);

    /* Con `homeSize: 2` cada ejército es mayor: en los sólidos sale de dos
       caras que comparten arista en vez de una, y en los tableros que son solo
       un grafo, de una bola más grande alrededor de su polo. Es la variante que
       hace viables los tableros pequeños, donde una sola cadena de saltos
       barría un ejército entero. */
    const wanted = this.options.playerCount;
    const home =
      boardHomes(this.poly, wanted, this.options.homeSize) ||
      boardHomes(this.poly, wanted, 1) ||
      boardHomes(this.poly, 2, this.options.homeSize);
    this.playerCount = home.sets.length;

    this.homeFaceSets = home.faces;   // caras que se tiñen del color de cada bando
    this.homeDirections = home.dirs;  // hacia dónde mira la cámara en cada turno
    this.homeSets = home.sets.map((set) => set.slice());

    /* El territorio de cada bando son los vértices de los que sale: no se
       mueve en toda la partida aunque las fichas lo abandonen. Con la regla de
       invasión es el objetivo, así que hace falta poder preguntar por un
       vértice de quién es el campo. */
    this.homeOwner = new Array(n).fill(EMPTY);
    home.sets.forEach((set, player) => {
      for (const v of set) {
        this.pieces[v] = player;
        this.homeOwner[v] = player;
      }
    });

    /* Puntos que hay que conseguir: tantos como vértices tiene el campo
       contrario. Con tres o cuatro bandos todos los territorios son del mismo
       tamaño y vale invadir el de cualquiera, así que la meta es la misma. */
    this.pointTarget = [];
    for (let p = 0; p < this.playerCount; p++) {
      let target = 0;
      for (let q = 0; q < this.playerCount; q++) {
        if (q !== p) target = Math.max(target, this.homeSets[q].length);
      }
      this.pointTarget.push(target);
    }

    /* Distancia en aristas de cada vértice al territorio enemigo más próximo,
       una tabla por jugador. No cambia durante la partida y la IA la consulta
       en cada hoja del árbol, así que se calcula una sola vez aquí. */
    this.distanceToEnemyHome = [];
    for (let p = 0; p < this.playerCount; p++) {
      const sources = [];
      for (let v = 0; v < n; v++) {
        if (this.homeOwner[v] !== EMPTY && this.homeOwner[v] !== p) sources.push(v);
      }
      this.distanceToEnemyHome.push(multiSourceDistances(this.poly.neighbors, sources));
    }

    this.turn = 0;
    this.chain = null;          // vértice obligado a seguir comiendo, o null
    /* Quién comió por última vez. Es el desempate final del límite sin
       capturas, y no es un detalle: dos ordenadores del mismo nivel sobre un
       tablero simétrico se copian el uno al otro y llegan al límite con el
       mismo marcador y las mismas fichas, así que sin esto la partida seguía
       siendo tablas. Con esto, en todo momento hay exactamente un bando que
       está perdiendo el reloj y tiene que buscar el contacto. */
    this.lastCapturer = null;
    this.captured = new Array(this.playerCount).fill(0);
    this.points = new Array(this.playerCount).fill(0);   // puntos de invasión
    this.eliminated = new Array(this.playerCount).fill(false);
    this.pliesWithoutCapture = 0;
    this.moveNumber = 1;
    this.history = [];          // para deshacer
    this.log = [];              // jugadas en notación legible
    this.result = null;         // {winner, reason} cuando la partida acaba
  }

  /* ¿Es `v` un vértice del campo de un rival de `player`? */
  isEnemyHome(v, player) {
    const owner = this.homeOwner[v];
    return owner !== EMPTY && owner !== player;
  }

  /* Con dos jugadores, "el rival". Con más, se usa `isEnemy`. */
  get opponent() {
    return (this.turn + 1) % this.playerCount;
  }

  /* ¿Hay en `v` una ficha que yo pueda comer? Cualquier bando distinto del mío
     cuenta: con más de dos jugadores todos son rivales de todos. */
  isEnemy(v) {
    const owner = this.pieces[v];
    return owner !== EMPTY && owner !== this.turn;
  }

  activePlayers() {
    const out = [];
    for (let p = 0; p < this.playerCount; p++) {
      if (!this.eliminated[p]) out.push(p);
    }
    return out;
  }

  piecesOf(player) {
    const out = [];
    for (let i = 0; i < this.pieces.length; i++) {
      if (this.pieces[i] === player) out.push(i);
    }
    return out;
  }

  /* Movimientos de la ficha situada en `from`, sin aplicar la regla de
     captura obligatoria (de eso se encarga legalMoves). */
  movesFrom(from) {
    if (this.result) return [];
    if (this.pieces[from] !== this.turn) return [];
    if (this.chain !== null && this.chain !== from) return [];

    const jumps = [];
    for (const over of this.poly.neighbors[from]) {
      if (!this.isEnemy(over)) continue;
      for (const to of this.poly.neighbors[over]) {
        if (to !== from && this.pieces[to] === EMPTY) {
          jumps.push({ from, to, over, capture: true });
        }
      }
    }

    // Durante una cadena la ficha ya solo puede seguir comiendo.
    if (this.chain !== null) return jumps;

    const steps = [];
    for (const to of this.poly.neighbors[from]) {
      if (this.pieces[to] === EMPTY) {
        steps.push({ from, to, over: null, capture: false });
      }
    }
    return [...jumps, ...steps];
  }

  /* Todos los movimientos legales del jugador al que le toca. */
  legalMoves() {
    if (this.result) return [];
    const sources = this.chain !== null ? [this.chain] : this.piecesOf(this.turn);
    let moves = [];
    for (const v of sources) moves = moves.concat(this.movesFrom(v));

    if (this.options.mandatoryCapture) {
      const captures = moves.filter((m) => m.capture);
      if (captures.length) return captures;
    }
    return moves;
  }

  /* En una cadena opcional, el jugador puede plantarse en vez de seguir. */
  canEndTurn() {
    return this.chain !== null && this.options.chainCaptures === 'optional';
  }

  snapshot() {
    return {
      pieces: this.pieces.slice(),
      turn: this.turn,
      chain: this.chain,
      captured: this.captured.slice(),
      lastCapturer: this.lastCapturer,
      points: this.points.slice(),
      eliminated: this.eliminated.slice(),
      pliesWithoutCapture: this.pliesWithoutCapture,
      moveNumber: this.moveNumber,
      logLength: this.log.length,
      result: this.result,
    };
  }

  restore(s) {
    this.pieces = s.pieces.slice();
    this.turn = s.turn;
    this.chain = s.chain;
    this.captured = s.captured.slice();
    this.lastCapturer = s.lastCapturer;
    this.points = s.points.slice();
    this.eliminated = s.eliminated.slice();
    this.pliesWithoutCapture = s.pliesWithoutCapture;
    this.moveNumber = s.moveNumber;
    this.log.length = s.logLength;
    this.result = s.result;
  }

  /* Comprueba que `move` está entre los legales y lo aplica, dejando el
     estado anterior en el historial de deshacer. */
  applyMove(move) {
    const legal = this.legalMoves().find(
      (m) => m.from === move.from && m.to === move.to && m.over === move.over
    );
    if (!legal) return false;
    this.history.push(this.snapshot());
    this.play(legal);
    return true;
  }

  /* Aplica un movimiento ya validado, sin tocar el historial. Es lo que usa
     la búsqueda de la IA, que gestiona su propio hacer/deshacer. */
  play(legal) {
    const player = this.turn;
    this.pieces[legal.to] = player;
    this.pieces[legal.from] = EMPTY;

    if (legal.capture) {
      this.pieces[legal.over] = EMPTY;
      this.captured[player]++;
      this.lastCapturer = player;
      this.pliesWithoutCapture = 0;
    } else {
      this.pliesWithoutCapture++;
    }

    /* Invasión: pisar el campo de un rival vale un punto, tanto si se ha
       llegado andando como saltando, y también en cada salto intermedio de una
       cadena. Cuenta como progreso, igual que comer, para el límite de jugadas
       muertas. */
    let scored = false;
    if (this.options.victory === 'invasion' && this.isEnemyHome(legal.to, player)) {
      this.points[player]++;
      this.pliesWithoutCapture = 0;
      scored = true;
    }

    this.log.push({
      player,
      moveNumber: this.moveNumber,
      text:
        (legal.capture
          ? `${legal.from}×${legal.over}→${legal.to}`
          : `${legal.from}→${legal.to}`) + (scored ? '★' : ''),
    });

    /* La partida se acaba en el momento de conseguir el punto que falta,
       aunque la ficha pudiera seguir comiendo. */
    if (scored && this.points[player] >= this.pointTarget[player]) {
      this.chain = null;
      this.result = { winner: player, reason: 'invasion' };
      return true;
    }

    const canChain =
      legal.capture &&
      this.options.chainCaptures !== 'off' &&
      this.movesFromAfterCapture(legal.to).length > 0;

    if (canChain) {
      this.chain = legal.to;
    } else {
      this.endTurn();
    }
    return true;
  }

  /* Movimientos legales incluyendo, si toca, la opción de plantarse en medio
     de una cadena. La IA necesita verla como una alternativa más. */
  legalTurnOptions() {
    const moves = this.legalMoves();
    return this.canEndTurn() ? [...moves, { pass: true }] : moves;
  }

  /* Saltos disponibles desde `v` una vez la ficha ya ha aterrizado ahí. */
  movesFromAfterCapture(v) {
    const jumps = [];
    for (const over of this.poly.neighbors[v]) {
      if (!this.isEnemy(over)) continue;
      for (const to of this.poly.neighbors[over]) {
        if (this.pieces[to] === EMPTY) jumps.push({ from: v, to, over, capture: true });
      }
    }
    return jumps;
  }

  /* Fichas de `player` que algún rival vivo podría comer si le tocase ahora
     mismo. Usa las mismas reglas de salto que el motor (movesFrom y
     movesFromAfterCapture) y respeta la opción de cadenas: con cadenas
     activas también cuentan las fichas alcanzables en el segundo salto y los
     siguientes. Simula en el propio tablero y lo deja como estaba. */
  threatenedPieces(player) {
    const threatened = new Set();
    if (this.result) return threatened;

    const savedTurn = this.turn;
    const savedChain = this.chain;
    const chains = this.options.chainCaptures !== 'off';

    /* Sigue la cadena desde `v`, donde acaba de aterrizar una ficha rival. */
    const follow = (v) => {
      for (const jump of this.movesFromAfterCapture(v)) {
        if (this.pieces[jump.over] === player) threatened.add(jump.over);
        const eaten = this.pieces[jump.over];
        this.pieces[jump.to] = this.turn;
        this.pieces[v] = EMPTY;
        this.pieces[jump.over] = EMPTY;
        follow(jump.to);
        this.pieces[jump.over] = eaten;
        this.pieces[v] = this.turn;
        this.pieces[jump.to] = EMPTY;
      }
    };

    try {
      this.chain = null;
      for (let rival = 0; rival < this.playerCount; rival++) {
        if (rival === player || this.eliminated[rival]) continue;
        this.turn = rival;
        for (const from of this.piecesOf(rival)) {
          for (const m of this.movesFrom(from)) {
            if (!m.capture) continue;
            if (this.pieces[m.over] === player) threatened.add(m.over);
            if (!chains) continue;
            const eaten = this.pieces[m.over];
            this.pieces[m.to] = rival;
            this.pieces[from] = EMPTY;
            this.pieces[m.over] = EMPTY;
            follow(m.to);
            this.pieces[m.over] = eaten;
            this.pieces[from] = rival;
            this.pieces[m.to] = EMPTY;
          }
        }
      }
    } finally {
      this.turn = savedTurn;
      this.chain = savedChain;
    }
    return threatened;
  }

  endTurn() {
    if (this.result) return;
    this.chain = null;
    if (this.turn === this.playerCount - 1) this.moveNumber++;
    this.turn = (this.turn + 1) % this.playerCount;
    this.checkEnd();
  }

  /* Quien se queda sin fichas queda eliminado.

     Quedarse sin movimientos es distinto según cuántos jueguen. Con dos, es
     derrota inmediata, como en las damas de siempre. Con más de dos no puede
     serlo: el bloqueo suele ser temporal, porque en cuanto otro mueva sus
     fichas puede abrirse hueco otra vez, así que ese jugador simplemente pasa
     el turno. */
  checkEnd() {
    if (this.result) return;

    for (let p = 0; p < this.playerCount; p++) {
      if (!this.eliminated[p] && this.piecesOf(p).length === 0) {
        this.eliminated[p] = true;
      }
    }

    if (this.playerCount === 2) {
      const rival = 1 - this.turn;
      if (this.eliminated[this.turn]) {
        this.result = { winner: rival, reason: 'sin-fichas' };
        return;
      }
      if (this.legalMoves().length === 0) {
        this.result = { winner: rival, reason: 'bloqueado' };
        return;
      }
      /* Al agotarse el límite sin capturas la partida se cierra, pero no
         necesariamente en tablas: con la regla por puntos la decide el
         marcador. Es lo que evita el bloqueo pasivo de los finales, donde
         acercarse cuesta una ficha —el que da el paso ofrece el primer salto—
         y a los dos les compensa esperar. Si el reloj corona al que va por
         delante, el que va por detrás está obligado a buscar el contacto.

         Solo se aplica aquí: quedarse sin fichas o sin movimientos sigue
         siendo derrota aunque el bloqueado haya comido más. */
      if (this.pliesWithoutCapture >= this.options.drawPlies) {
        this.result = { winner: null, reason: 'tablas' };
        this.applyVictoryRule();
      }
      return;
    }

    const active = this.activePlayers();
    if (active.length <= 1) {
      this.result = { winner: active[0] ?? null, reason: 'sin-fichas' };
      this.applyVictoryRule();
      return;
    }
    if (this.pliesWithoutCapture >= this.options.drawPlies) {
      this.result = { winner: null, reason: 'tablas' };
      this.applyVictoryRule();
      return;
    }

    // Pasa turno quien no tenga jugada; si nadie puede mover, tablas.
    let guard = 0;
    while (
      (this.eliminated[this.turn] || this.legalMoves().length === 0) &&
      guard++ < this.playerCount
    ) {
      if (this.turn === this.playerCount - 1) this.moveNumber++;
      this.turn = (this.turn + 1) % this.playerCount;
    }
    if (guard >= this.playerCount) {
      this.result = { winner: null, reason: 'bloqueo-general' };
      this.applyVictoryRule();
    }
  }

  /* Con la regla por puntos, el ganador es quien más ha comido, aunque le
     hubieran eliminado. Sirve contra el "kingmaking": si te eliminan pronto tu
     marcador sigue contando, así que no te da igual a quién ayudas. A dos
     jugadores es lo que decide la partida al agotarse el límite sin capturas.

     Solo hay tablas si además empatan en fichas sobre el tablero. */
  applyVictoryRule() {
    const rule = this.options.victory;
    if (!this.result || (rule !== 'points' && rule !== 'invasion')) return;

    /* Criterios en orden de importancia. Con la regla por puntos manda lo
       comido; con la de invasión mandan los puntos de invasión y comer solo
       desempata, que es lo que lo convierte en un medio y no en un fin. En
       ambos casos, a igualdad, decide quién conserva más fichas. */
    const keys = (p) => {
      const base =
        rule === 'invasion'
          ? [this.points[p], this.captured[p], this.piecesOf(p).length]
          : [this.captured[p], this.piecesOf(p).length];
      /* Último desempate: quien dio el último bocado. Dos ordenadores del
         mismo nivel sobre un tablero simétrico se copian y llegan al límite
         empatados en todo, así que sin esta clave la partida acababa igual en
         tablas. Con ella siempre hay uno que está perdiendo el reloj y tiene
         que buscar el contacto. */
      base.push(this.lastCapturer === p ? 1 : 0);
      return base;
    };

    const table = [];
    for (let p = 0; p < this.playerCount; p++) table.push({ player: p, keys: keys(p) });
    const compare = (a, b) => {
      for (let i = 0; i < a.keys.length; i++) {
        if (a.keys[i] !== b.keys[i]) return b.keys[i] - a.keys[i];
      }
      return 0;
    };
    table.sort(compare);

    if (table.length > 1 && compare(table[0], table[1]) === 0) {
      this.result = { winner: null, reason: 'empate-a-puntos' };
      return;
    }
    /* Si lo único que los separa es la última clave, la partida la decide el
       último bocado y el resultado tiene que decirlo así. */
    const last = table[0].keys.length - 1;
    const byLastCapture =
      table.length > 1 &&
      table[0].keys.every((k, i) => i === last || k === table[1].keys[i]);

    this.result = {
      winner: table[0].player,
      reason: byLastCapture
        ? 'ultimo-bocado'
        : rule === 'invasion'
          ? 'invasion-puntos'
          : 'puntos',
    };
  }

  undo() {
    const s = this.history.pop();
    if (!s) return false;
    this.restore(s);
    return true;
  }
}
