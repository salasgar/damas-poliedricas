'use strict';

/* Jugador automático: minimax con poda alfa-beta.

   El árbol se recorre por semimovimientos, no por turnos. Eso resuelve solo el
   problema de las capturas encadenadas: cuando una ficha sigue comiendo el
   turno no cambia, así que el mismo bando vuelve a maximizar en el nodo hijo.
   Plantarse en medio de una cadena entra en la búsqueda como un movimiento más.

   No depende del navegador: se puede ejecutar en Node para analizar partidas. */

const AI_LEVELS = {
  facil: { depth: 2, noise: 45 },
  normal: { depth: 4, noise: 8 },
  dificil: { depth: 6, noise: 0 },
};

const WIN_SCORE = 100000;

/* Pesos de la evaluación, en centésimas de ficha. */
const W_MATERIAL = 100;
const W_MOBILITY = 2;
const W_HANGING = 7;

/* Puntuación de la posición desde el punto de vista de `me`. Positivo, mejor
   para `me`. Con más de dos jugadores se compara contra el rival que mejor
   está, que es a quien de verdad hay que ganar. */
function evaluate(game, me) {
  const pieces = game.pieces;
  const neighbors = game.poly.neighbors;
  const n = game.playerCount;
  const material = new Array(n).fill(0);
  const mobility = new Array(n).fill(0);
  const hanging = new Array(n).fill(0);

  for (let v = 0; v < pieces.length; v++) {
    const owner = pieces[v];
    if (owner === EMPTY) continue;
    material[owner]++;

    let empties = 0;
    let enemies = 0;
    for (const nb of neighbors[v]) {
      if (pieces[nb] === EMPTY) {
        empties++;
        mobility[owner]++;
      } else if (pieces[nb] !== owner) {
        enemies++;
      }
    }
    /* Una ficha es comible si tiene un vecino rival (que salte) y un hueco
       libre al lado (donde aterrizar). Agruparse tapa esos huecos. */
    if (enemies > 0 && empties > 0) hanging[owner]++;
  }

  // El mejor de los demás: con dos jugadores es simplemente el otro.
  let rival = -1;
  for (let p = 0; p < n; p++) {
    if (p !== me && (rival < 0 || material[p] > material[rival])) rival = p;
  }

  return (
    W_MATERIAL * (material[me] - material[rival]) +
    W_MOBILITY * (mobility[me] - mobility[rival]) -
    W_HANGING * (hanging[me] - hanging[rival])
  );
}

/* Las victorias rápidas valen más que las lentas, para que la IA remate. */
function terminalScore(game, ply, me) {
  const { winner } = game.result;
  if (winner === null) return 0;
  const score = WIN_SCORE - ply;
  return winner === me ? score : -score;
}

/* Capturas primero: mejora mucho la poda. */
function orderMoves(moves) {
  return moves.slice().sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));
}

/* Búsqueda "paranoid": el jugador `me` maximiza y TODOS los demás minimizan su
   puntuación, como si estuvieran aliados contra él. Con dos jugadores es
   exactamente el minimax de siempre; con más, es la forma habitual de conservar
   la poda alfa-beta, que max^n no permite. Es pesimista —los rivales también
   se pelean entre ellos— pero no se deja comer por descuido. */
function search(game, depth, alpha, beta, ply, counter, me) {
  if (game.result) return terminalScore(game, ply, me);
  if (depth <= 0) return evaluate(game, me);
  counter.nodes++;

  const turnBefore = game.turn;
  const maximizing = turnBefore === me;
  const moves = orderMoves(game.legalTurnOptions());
  if (!moves.length) return evaluate(game, me);

  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const state = game.snapshot();
    if (move.pass) game.endTurn();
    else game.play(move);

    /* Seguir una cadena es parte del mismo turno: no consume profundidad,
       porque si no la búsqueda se cortaría en mitad de una captura múltiple
       y valoraría posiciones imposibles. */
    const sameTurn = game.turn === turnBefore && !move.pass;
    const score = search(
      game,
      sameTurn ? depth : depth - 1,
      alpha,
      beta,
      ply + 1,
      counter,
      me
    );
    game.restore(state);

    if (maximizing) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

/* Elige la jugada del jugador al que le toca.
   `random` es una función que devuelve [0, 1); pásala para desempatar de forma
   reproducible. Devuelve null si no hay nada que jugar. */
function chooseMove(game, levelName, random = Math.random) {
  const level = AI_LEVELS[levelName] || AI_LEVELS.normal;
  const moves = orderMoves(game.legalTurnOptions());
  if (!moves.length) return null;

  /* Siempre buscamos desde el punto de vista del que mueve, así que en la raíz
     siempre se maximiza. */
  const me = game.turn;
  const counter = { nodes: 0 };
  let best = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const state = game.snapshot();
    if (move.pass) game.endTurn();
    else game.play(move);

    const sameTurn = game.turn === me && !move.pass;
    let score = search(
      game,
      sameTurn ? level.depth : level.depth - 1,
      -Infinity,
      Infinity,
      1,
      counter,
      me
    );
    game.restore(state);

    // Ruido para que no repita siempre la misma partida.
    if (level.noise) score += (random() - 0.5) * 2 * level.noise;

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

/* Juega un turno completo (incluidas las capturas encadenadas) y devuelve la
   lista de movimientos aplicados. Útil para simular partidas enteras. */
function playAITurn(game, levelName, random) {
  const played = [];
  const player = game.turn;
  let guard = 0;
  while (!game.result && game.turn === player && guard++ < 60) {
    const move = chooseMove(game, levelName, random);
    if (!move) break;
    if (move.pass) game.endTurn();
    else game.applyMove(move);
    played.push(move);
  }
  return played;
}

if (typeof module !== 'undefined') {
  module.exports = { AI_LEVELS, evaluate, chooseMove, playAITurn };
}
