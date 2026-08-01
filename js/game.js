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
const PLAYERS = [0, 1];

const DEFAULT_OPTIONS = {
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
    const home = this.poly.homes[this.options.homeSize] || this.poly.homes[1];

    this.homeFaceSets = home.faces;   // caras que se tiñen del color de cada bando
    this.homeDirections = home.dirs;  // hacia dónde mira la cámara en cada turno

    for (const v of home.sets[0]) this.pieces[v] = 0;
    for (const v of home.sets[1]) this.pieces[v] = 1;

    this.turn = 0;
    this.chain = null;          // vértice obligado a seguir comiendo, o null
    this.captured = [0, 0];     // fichas comidas por cada jugador
    this.pliesWithoutCapture = 0;
    this.moveNumber = 1;
    this.history = [];          // para deshacer
    this.log = [];              // jugadas en notación legible
    this.result = null;         // {winner, reason} cuando la partida acaba
  }

  get opponent() {
    return 1 - this.turn;
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

    const rival = this.opponent;
    const jumps = [];
    for (const over of this.poly.neighbors[from]) {
      if (this.pieces[over] !== rival) continue;
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
    const rival = this.opponent;
    const jumps = [];
    for (const over of this.poly.neighbors[v]) {
      if (this.pieces[over] !== rival) continue;
      for (const to of this.poly.neighbors[over]) {
        if (this.pieces[to] === EMPTY) jumps.push({ from: v, to, over, capture: true });
      }
    }
    return jumps;
  }

  endTurn() {
    if (this.result) return;
    this.chain = null;
    if (this.turn === 1) this.moveNumber++;
    this.turn = this.opponent;
    this.checkEnd();
  }

  /* Se pierde al quedarse sin fichas o sin movimientos legales. */
  checkEnd() {
    if (this.piecesOf(this.turn).length === 0) {
      this.result = { winner: this.opponent, reason: 'sin-fichas' };
      return;
    }
    if (this.legalMoves().length === 0) {
      this.result = { winner: this.opponent, reason: 'bloqueado' };
      return;
    }
    if (this.pliesWithoutCapture >= this.options.drawPlies) {
      this.result = { winner: null, reason: 'tablas' };
    }
  }

  undo() {
    const s = this.history.pop();
    if (!s) return false;
    this.restore(s);
    return true;
  }
}
