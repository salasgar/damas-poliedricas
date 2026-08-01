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

/* Puntuación de la posición desde el punto de vista del jugador 0.
   Positivo favorece al jugador 0. */
function evaluate(game) {
  const pieces = game.pieces;
  const neighbors = game.poly.neighbors;
  const material = [0, 0];
  const mobility = [0, 0];
  const hanging = [0, 0];

  for (let v = 0; v < pieces.length; v++) {
    const owner = pieces[v];
    if (owner === EMPTY) continue;
    material[owner]++;

    let empties = 0;
    let enemies = 0;
    for (const n of neighbors[v]) {
      if (pieces[n] === EMPTY) {
        empties++;
        mobility[owner]++;
      } else if (pieces[n] !== owner) {
        enemies++;
      }
    }
    /* Una ficha es comible si tiene un vecino rival (que salte) y un hueco
       libre al lado (donde aterrizar). Agruparse tapa esos huecos. */
    if (enemies > 0 && empties > 0) hanging[owner]++;
  }

  return (
    W_MATERIAL * (material[0] - material[1]) +
    W_MOBILITY * (mobility[0] - mobility[1]) -
    W_HANGING * (hanging[0] - hanging[1])
  );
}

/* Las victorias rápidas valen más que las lentas, para que la IA remate. */
function terminalScore(game, ply) {
  const { winner } = game.result;
  if (winner === null) return 0;
  const score = WIN_SCORE - ply;
  return winner === 0 ? score : -score;
}

/* Capturas primero: mejora mucho la poda. */
function orderMoves(moves) {
  return moves.slice().sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));
}

function search(game, depth, alpha, beta, ply, counter) {
  if (game.result) return terminalScore(game, ply);
  if (depth <= 0) return evaluate(game);
  counter.nodes++;

  const maximizing = game.turn === 0;
  const moves = orderMoves(game.legalTurnOptions());
  if (!moves.length) return evaluate(game);

  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const state = game.snapshot();
    if (move.pass) game.endTurn();
    else game.play(move);

    /* Seguir una cadena es parte del mismo turno: no consume profundidad,
       porque si no la búsqueda se cortaría en mitad de una captura múltiple
       y valoraría posiciones imposibles. */
    const sameTurn = game.turn === (maximizing ? 0 : 1) && !move.pass;
    const score = search(
      game,
      sameTurn ? depth : depth - 1,
      alpha,
      beta,
      ply + 1,
      counter
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

  const maximizing = game.turn === 0;
  const counter = { nodes: 0 };
  let best = null;
  let bestScore = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const state = game.snapshot();
    if (move.pass) game.endTurn();
    else game.play(move);

    const sameTurn = game.turn === (maximizing ? 0 : 1) && !move.pass;
    let score = search(
      game,
      sameTurn ? level.depth : level.depth - 1,
      -Infinity,
      Infinity,
      1,
      counter
    );
    game.restore(state);

    // Ruido para que no repita siempre la misma partida.
    if (level.noise) score += (random() - 0.5) * 2 * level.noise;

    if (maximizing ? score > bestScore : score < bestScore) {
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
