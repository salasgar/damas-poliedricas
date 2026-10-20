/* Damas poliédricas · Copyright © 2026 Juan Luis Salas García */

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
/* Peso del reloj (jugadas sin comer) y de la distancia al rival cuando el
   límite decide la partida por fichas comidas. Juntos valen menos que una
   ficha: comer tiene que seguir compensando aunque ponga el contador a cero. */
const W_CLOCK = 40;
const W_CHASE = 25;
/* Antes de esto el contador no dice nada: en la apertura los ejércitos están
   pegados y se come constantemente. */
const CHASE_AFTER = 10;

/* Regla de invasión: cuánto vale un punto y cuánto acercarse al campo rival.
   Sin lo segundo la búsqueda no ve nada hasta tener el territorio a tiro y los
   ejércitos se quedan quietos.

   Un punto vale lo mismo que una ficha, que es menos de lo que parece: son las
   fichas las que consiguen los puntos, así que pagarlas por ellos sale caro. La
   cifra está medida enfrentando evaluaciones idénticas salvo en este peso, 48
   partidas por emparejamiento alternando colores sobre cuatro tableros: 100
   gana 34-14 a valorar el punto por la mitad, 32-16 a valorarlo a 160 y 38-10 a
   valorarlo a 240. El peso del avance se midió igual y es plano entre 30 y 90,
   pero 250 ya pierde 14-34: correr hacia el campo rival descuidando las fichas
   no llega a ninguna parte. */
const W_POINT = 100;
const W_ADVANCE = 90;

/* Cercanía media al campo enemigo, entre 0 (todas las fichas dentro) y 1
   (todas lo más lejos posible). La tabla de distancias la precalcula la
   partida al repartir, así que esto es una suma y poco más. */
function averageHomeDistance(game, player) {
  const dist = game.distanceToEnemyHome[player];
  let sum = 0;
  let count = 0;
  let far = 1;
  for (let v = 0; v < game.pieces.length; v++) {
    if (dist[v] < Infinity && dist[v] > far) far = dist[v];
    if (game.pieces[v] !== player) continue;
    if (dist[v] === Infinity) continue;
    sum += dist[v];
    count++;
  }
  return count ? sum / count / far : 0;
}

/* Distancia media, entre 0 y 1, de cada ficha de `player` a la ficha de
   `rival` más cercana. Los tableros vienen normalizados a radio 1, así que el
   diámetro es 2. Es una aproximación geométrica a la distancia por aristas,
   mucho más barata que un BFS en cada hoja del árbol. */
function averageContactDistance(game, player, rival) {
  const pos = game.poly.vertices;
  const mine = [];
  const theirs = [];
  for (let v = 0; v < game.pieces.length; v++) {
    if (game.pieces[v] === player) mine.push(v);
    else if (game.pieces[v] === rival) theirs.push(v);
  }
  if (!mine.length || !theirs.length) return 0;

  let sum = 0;
  for (const a of mine) {
    const p = pos[a];
    let best = Infinity;
    for (const b of theirs) {
      const q = pos[b];
      const dx = p[0] - q[0];
      const dy = p[1] - q[1];
      const dz = p[2] - q[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / mine.length / 2;
}

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

  let score =
    W_MATERIAL * (material[me] - material[rival]) +
    W_MOBILITY * (mobility[me] - mobility[rival]) -
    W_HANGING * (hanging[me] - hanging[rival]);

  /* Cuando el límite sin capturas se resuelve por fichas comidas, el reloj es
     parte de la posición: al que va por delante le basta con esperar. La
     búsqueda llega a seis semimovimientos y el límite está a decenas de
     jugadas, así que sin esto ninguno de los dos lo ve venir y los finales se
     quedan en esquivarse hasta agotar el contador. */
  if (game.options.victory === 'points') {
    /* Mismo criterio que decide la partida: fichas comidas, fichas
       conservadas y, en última instancia, quién comió el último. Ese tercer
       desempate es el que da signo a las posiciones simétricas, que son justo
       las que se atascaban. */
    let lead = Math.sign(game.captured[me] - game.captured[rival]);
    if (lead === 0) lead = Math.sign(material[me] - material[rival]);
    if (lead === 0 && game.lastCapturer !== null) {
      lead = game.lastCapturer === me ? 1 : -1;
    }

    if (lead !== 0) {
      const progress = Math.min(1, game.pliesWithoutCapture / game.options.drawPlies);
      score += W_CLOCK * progress * lead;

      /* Y acercarse deja de ser neutro: el que gana el reloj huye y el que lo
         pierde persigue. Ese desequilibrio es justo lo que rompe el bloqueo,
         porque el bando de detrás ya no puede permitirse esperar. */
      if (game.pliesWithoutCapture >= CHASE_AFTER) {
        score += W_CHASE * progress * lead * averageContactDistance(game, me, rival);
      }
    }
  }

  /* Con la regla de invasión el material sigue contando —sin fichas no se
     invade nada—, pero por encima está el marcador y, mientras no haya
     marcador, avanzar hacia el campo contrario. */
  if (game.options.victory === 'invasion') {
    score += W_POINT * (game.points[me] - game.points[rival]);
    score +=
      W_ADVANCE *
      (averageHomeDistance(game, rival) - averageHomeDistance(game, me));
  }

  return score;
}

/* Las victorias rápidas valen más que las lentas, para que la IA remate. */
function terminalScore(game, ply, me) {
  const { winner } = game.result;
  if (winner === null) return 0;
  const score = WIN_SCORE - ply;
  return winner === me ? score : -score;
}

/* Lo más decisivo primero: mejora mucho la poda. Jugar en el campo contrario va
   por delante de comer cuando eso es lo que gana la partida. */
function orderMoves(game, moves) {
  const invasion = game.options.victory === 'invasion';
  const rank = (m) => {
    if (m.pass) return 0;
    let r = m.capture ? 1 : 0;
    if (invasion && game.isEnemyHome(m.to, game.turn)) r += 2;
    return r;
  };
  return moves.slice().sort((a, b) => rank(b) - rank(a));
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
  const moves = orderMoves(game, game.legalTurnOptions());
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
  const moves = orderMoves(game, game.legalTurnOptions());
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
