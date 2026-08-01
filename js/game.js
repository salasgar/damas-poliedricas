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

const DEFAULT_OPTIONS = {
  /* Número de bandos. Con más de dos, el reparto se hace por zonas alrededor
     de polos dispersos y el turno rota entre los que siguen en juego. */
  playerCount: 2,
  /* Cómo se decide el ganador con más de dos jugadores:
     'elimination' – gana el último que queda con fichas
     'points'      – gana quien más fichas haya comido al acabar la partida,
                     también si le eliminaron por el camino */
  victory: 'elimination',
  /* Si hay capturas disponibles, ¿obliga a hacerlas? */
  mandatoryCapture: false,
  /* Encadenar capturas con la misma ficha:
     'off'      – una captura por turno
     'optional' – se puede seguir comiendo o plantarse
     'forced'   – si se puede seguir comiendo, hay que hacerlo */
  chainCaptures: 'optional',
  /* Semimovimientos sin comer tras los que se declaran tablas. */
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

    home.sets.forEach((set, player) => {
      for (const v of set) this.pieces[v] = player;
    });

    this.turn = 0;
    this.chain = null;          // vértice obligado a seguir comiendo, o null
    this.captured = new Array(this.playerCount).fill(0);
    this.eliminated = new Array(this.playerCount).fill(false);
    this.pliesWithoutCapture = 0;
    this.moveNumber = 1;
    this.history = [];          // para deshacer
    this.log = [];              // jugadas en notación legible
    this.result = null;         // {winner, reason} cuando la partida acaba
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
      this.pliesWithoutCapture = 0;
    } else {
      this.pliesWithoutCapture++;
    }

    this.log.push({
      player,
      moveNumber: this.moveNumber,
      text: legal.capture
        ? `${legal.from}×${legal.over}→${legal.to}`
        : `${legal.from}→${legal.to}`,
    });

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
      if (this.pliesWithoutCapture >= this.options.drawPlies) {
        this.result = { winner: null, reason: 'tablas' };
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
     marcador sigue contando, así que no te da igual a quién ayudas. */
  applyVictoryRule() {
    if (this.options.victory !== 'points' || !this.result) return;
    let best = [];
    let top = -1;
    for (let p = 0; p < this.playerCount; p++) {
      const score = this.captured[p];
      if (score > top) {
        top = score;
        best = [p];
      } else if (score === top) {
        best.push(p);
      }
    }
    // Desempata quien conserve más fichas en el tablero.
    if (best.length > 1) {
      best.sort((a, b) => this.piecesOf(b).length - this.piecesOf(a).length);
      const survivors = this.piecesOf(best[0]).length;
      if (this.piecesOf(best[1]).length === survivors) {
        this.result = { winner: null, reason: 'empate-a-puntos' };
        return;
      }
    }
    this.result = { winner: best[0], reason: 'puntos' };
  }

  undo() {
    const s = this.history.pop();
    if (!s) return false;
    this.restore(s);
    return true;
  }
}
