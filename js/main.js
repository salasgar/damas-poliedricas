'use strict';

/* Interacción: ratón/táctil sobre el canvas, panel lateral y bucle de dibujo. */

(function () {
  const canvas = document.getElementById('canvas');
  const $ = (id) => document.getElementById(id);

  const settings = {
    polyId: 'dodecahedron',
    /* 'human' u 'ai' para cada bando: las cuatro combinaciones son válidas. */
    players: ['human', 'ai'],
    level: 'normal',
    /* Saltos múltiples: encadenar varias capturas con la misma ficha en un
       mismo turno. Si están apagados, el turno pasa en cuanto se come. */
    /* Caras de salida por jugador: 1 o 2. Con 2, los ejércitos son mayores. */
    homeSize: 1,
    multiJump: true,
    forcedChain: false,
    mandatoryCapture: false,
    autoRotate: true,
    showThreats: false,
  };

  /* Cada tablero arranca con las reglas que lo hacen jugable, según el análisis
     de partidas del ordenador contra sí mismo (ver BOARD_PRESETS y el README).
     El usuario puede cambiarlas después: son un punto de partida, no un
     candado. */
  function applyBoardPreset(polyId) {
    const preset = BOARD_PRESETS[polyId] || DEFAULT_PRESET;
    settings.homeSize = preset.homeSize;
    settings.multiJump = preset.multiJump;
    settings.forcedChain = preset.forcedChain;
    settings.mandatoryCapture = preset.mandatoryCapture;
    syncSettingControls();
    $('preset-note').textContent = preset.reason || '';
  }

  /* Vuelca `settings` en los controles del panel. */
  function syncSettingControls() {
    /* En algunos tableros (los prismas cortos) el reparto grande no dejaría ni
       un hueco libre, así que ahí la opción no existe. */
    const poly = POLYHEDRA[settings.polyId];
    const canDouble = !!poly.startFaces;
    if (!canDouble) settings.homeSize = 1;
    $('sel-home').options[1].disabled = !canDouble;
    $('sel-home').value = String(settings.homeSize);
    $('chk-multijump').checked = settings.multiJump;
    $('chk-forced').checked = settings.forcedChain;
    $('chk-mandatory').checked = settings.mandatoryCapture;
    syncChainControls();
    updatePolyDescription();
  }

  /* La nota describe el preajuste del tablero; si el usuario cambia una regla
     a mano deja de ser cierta. */
  function clearPresetNote() {
    $('preset-note').textContent = '';
  }

  function chainRule() {
    if (!settings.multiJump) return 'off';
    return settings.forcedChain ? 'forced' : 'optional';
  }

  let game, renderer;

  /* Estado de la interfaz (no del juego): qué hay seleccionado o resaltado. */
  const view = {
    selected: null,
    hover: null,
    targets: new Map(),   // vértice destino -> movimiento
    moveEdges: [],        // aristas a resaltar
    threatened: new Set(),
  };

  let projected = [];
  let needsRender = true;
  let lastTime = performance.now();

  /* Turno del ordenador: temporizador pendiente, pausa manual y aviso de que
     está calculando (la búsqueda bloquea, así que conviene decirlo antes). */
  let aiTimer = null;
  let paused = false;
  let aiThinking = false;

  const isAI = (player) => settings.players[player] === 'ai';
  const bothAI = () => isAI(0) && isAI(1);
  const waitingForAI = () => !game.result && isAI(game.turn) && !paused;

  /* ---------- Arranque ---------- */

  function newGame(keepView) {
    cancelAI();
    paused = false;
    const poly = POLYHEDRA[settings.polyId];
    game = new Game(poly, {
      chainCaptures: chainRule(),
      mandatoryCapture: settings.mandatoryCapture,
      homeSize: settings.homeSize,
    });

    if (!renderer) {
      renderer = new Renderer(canvas, poly);
    } else {
      renderer.setPolyhedron(poly);
      if (!keepView) {
        renderer.orientation = Q.identity();
        renderer.zoom = 1;
      }
    }

    clearSelection();
    view.threatened.clear();
    $('result-overlay').classList.add('hidden');
    // Sin animación al empezar: la partida ya arranca bien encarada.
    renderer.faceCamera(game.homeDirections[game.turn], !keepView);
    syncPanel();
    needsRender = true;
    scheduleAI();
  }

  function clearSelection() {
    view.selected = null;
    view.targets.clear();
    view.moveEdges = [];
  }

  /* ---------- Selección y jugadas ---------- */

  function selectVertex(v) {
    const moves = game.movesFrom(v);
    const legal = game.legalMoves();
    // Un movimiento solo vale si además pasa el filtro global (captura
    // obligatoria, cadena en curso...).
    const allowed = moves.filter((m) =>
      legal.some((l) => l.from === m.from && l.to === m.to && l.over === m.over)
    );
    if (!allowed.length) {
      clearSelection();
      needsRender = true;
      return false;
    }

    view.selected = v;
    view.targets.clear();
    view.moveEdges = [];
    for (const m of allowed) {
      // Si dos movimientos comparten destino nos quedamos con la captura.
      const prev = view.targets.get(m.to);
      if (!prev || (m.capture && !prev.capture)) view.targets.set(m.to, m);
      if (m.capture) {
        view.moveEdges.push([m.from, m.over], [m.over, m.to]);
      } else {
        view.moveEdges.push([m.from, m.to]);
      }
    }
    needsRender = true;
    return true;
  }

  function tryMoveTo(v) {
    const move = view.targets.get(v);
    if (!move) return false;
    game.applyMove(move);

    if (game.chain !== null) {
      // Sigue la cadena: dejamos seleccionada la ficha que acaba de comer.
      selectVertex(game.chain);
    } else {
      clearSelection();
      if (settings.autoRotate && !game.result) {
        renderer.faceCamera(game.homeDirections[game.turn]);
      }
    }
    syncPanel();
    needsRender = true;
    scheduleAI();
    return true;
  }

  function onVertexClick(v) {
    if (game.result || isAI(game.turn)) return;

    // Clic sobre un destino válido: se mueve.
    if (view.selected !== null && view.targets.has(v)) {
      tryMoveTo(v);
      return;
    }
    // Clic sobre una ficha propia: se selecciona.
    if (game.pieces[v] === game.turn) {
      if (view.selected === v) {
        clearSelection();
        needsRender = true;
      } else {
        selectVertex(v);
      }
      return;
    }
    clearSelection();
    needsRender = true;
  }

  /* ---------- Turno del ordenador ---------- */

  function cancelAI() {
    if (aiTimer !== null) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
    aiThinking = false;
  }

  /* Programa la jugada del ordenador si le toca. El retardo dentro de una
     cadena es más corto, para que se lea como una sola jugada encadenada. */
  function scheduleAI() {
    cancelAI();
    if (!waitingForAI()) return;
    const delay = game.chain !== null ? 260 : 420;
    /* Marcamos "pensando" antes del temporizador: así el aviso llega a pintarse
       durante la espera, porque la búsqueda en sí bloquea el hilo. */
    aiThinking = true;
    updateBanner();
    aiTimer = setTimeout(runAIMove, delay);
  }

  function runAIMove() {
    aiTimer = null;
    if (!waitingForAI()) return;

    const move = chooseMove(game, settings.level);
    aiThinking = false;
    if (!move) return;

    clearSelection();
    if (move.pass) {
      game.endTurn();
    } else {
      // Dejamos marcada la jugada un instante para que se vea qué ha hecho.
      view.moveEdges = move.capture
        ? [[move.from, move.over], [move.over, move.to]]
        : [[move.from, move.to]];
      game.applyMove(move);
      view.selected = move.to;
    }

    if (settings.autoRotate && !game.result && game.chain === null) {
      renderer.faceCamera(game.homeDirections[game.turn]);
    }
    syncPanel();
    needsRender = true;
    scheduleAI();
  }

  /* ---------- Fichas en peligro ---------- */

  function computeThreats() {
    view.threatened.clear();
    if (!settings.showThreats || game.result) return;

    // Simulamos el turno del rival para ver a qué fichas nuestras llega.
    const me = game.turn;
    const rival = 1 - me;
    for (let over = 0; over < game.pieces.length; over++) {
      if (game.pieces[over] !== me) continue;
      const nb = game.poly.neighbors[over];
      const attacker = nb.some((a) => game.pieces[a] === rival);
      const landing = nb.some((t) => game.pieces[t] === EMPTY);
      if (attacker && landing) view.threatened.add(over);
    }
  }

  /* ---------- Panel ---------- */

  const PLAYER_NAMES = ['jugador 1', 'jugador 2'];

  function updateBanner() {
    const banner = $('turn-banner');
    const color = PLAYER_COLORS[game.turn].base;
    banner.querySelector('.dot').style.background = color;
    banner.querySelector('.dot').style.color = color;

    const ai = isAI(game.turn);
    const who = ai ? `${PLAYER_NAMES[game.turn]} (ordenador)` : PLAYER_NAMES[game.turn];
    let text;
    if (game.result) text = 'Partida terminada';
    else if (paused && ai) text = `En pausa · turno del ${who}`;
    else if (aiThinking) text = `Pensando… · ${who}`;
    else if (game.chain !== null) text = `El ${who} puede seguir comiendo`;
    else text = `Turno del ${who}`;
    banner.querySelector('.text').textContent = text;
    banner.classList.toggle('thinking', aiThinking && !game.result);
  }

  function syncPanel() {
    const names = PLAYER_NAMES;
    const alive = [game.piecesOf(0).length, game.piecesOf(1).length];

    document.querySelectorAll('.player').forEach((el) => {
      const p = Number(el.dataset.player);
      el.classList.toggle('active', !game.result && game.turn === p);
      el.classList.toggle('out', alive[p] === 0);
      el.querySelector('.alive').textContent = alive[p];
      el.querySelector('.eaten').textContent = game.captured[p];
    });

    updateBanner();

    // «Terminar turno» es cosa del humano: la IA decide sola si se planta.
    const canStop = game.canEndTurn() && !isAI(game.turn);
    const endBtn = $('btn-end-turn');
    endBtn.disabled = !canStop;
    endBtn.classList.toggle('pulse', canStop);

    const pauseBtn = $('btn-pause');
    pauseBtn.classList.toggle('hidden', !bothAI() || !!game.result);
    pauseBtn.textContent = paused ? 'Reanudar' : 'Pausar';

    $('btn-undo').disabled = game.history.length === 0;

    renderMoveList();
    computeThreats();

    if (game.result) showResult();
  }

  function renderMoveList() {
    const ol = $('movelist');
    ol.innerHTML = '';
    if (!game.log.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="empty">Aún no se ha jugado nada.</span>';
      ol.appendChild(li);
      return;
    }
    for (const entry of game.log) {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = `${entry.moveNumber}.`;
      const mv = document.createElement('span');
      mv.className = 'mv';
      mv.dataset.player = entry.player;
      mv.textContent = entry.text;
      li.append(num, mv);
      ol.appendChild(li);
    }
    ol.scrollTop = ol.scrollHeight;
  }

  function showResult() {
    const { winner, reason } = game.result;
    const overlay = $('result-overlay');
    if (winner === null) {
      $('result-title').textContent = 'Tablas';
      $('result-detail').textContent =
        `${game.options.drawPlies} jugadas sin comer ninguna ficha.`;
    } else {
      $('result-title').textContent = `¡Gana el jugador ${winner + 1}!`;
      $('result-detail').textContent = reason === 'sin-fichas'
        ? 'El rival se ha quedado sin fichas.'
        : 'El rival no tiene ningún movimiento legal.';
    }
    overlay.classList.remove('hidden');
  }

  /* ---------- Entrada del puntero ---------- */

  const pointers = new Map();
  let dragged = 0;
  let pinchDist = 0;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) dragged = 0;
    if (pointers.size === 2) pinchDist = currentPinchDistance();
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);

    if (!prev) {
      // Solo hover.
      const v = pickAt(e);
      if (v !== view.hover) {
        view.hover = v;
        canvas.classList.toggle('pointing', v !== null && isInteractive(v));
        needsRender = true;
      }
      return;
    }

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      const d = currentPinchDistance();
      if (pinchDist > 0 && d > 0) renderer.zoomBy(d / pinchDist);
      pinchDist = d;
      dragged = 999;
      needsRender = true;
      return;
    }

    dragged += Math.abs(dx) + Math.abs(dy);
    if (dragged > 4) {
      canvas.classList.add('dragging');
      renderer.rotateByDrag(dx, dy);
      needsRender = true;
    }
  });

  function endPointer(e) {
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (pointers.size < 2) pinchDist = 0;
    // Un arrastre corto cuenta como clic.
    if (had && dragged <= 4 && pointers.size === 0) {
      const v = pickAt(e);
      if (v !== null) onVertexClick(v);
      else {
        clearSelection();
        needsRender = true;
      }
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('pointerleave', () => {
    if (view.hover !== null) {
      view.hover = null;
      canvas.classList.remove('pointing');
      needsRender = true;
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    renderer.zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    needsRender = true;
  }, { passive: false });

  function currentPinchDistance() {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function pickAt(e) {
    const rect = canvas.getBoundingClientRect();
    return renderer.pickVertex(e.clientX - rect.left, e.clientY - rect.top, projected);
  }

  function isInteractive(v) {
    if (game.result || isAI(game.turn)) return false;
    return game.pieces[v] === game.turn || view.targets.has(v);
  }

  /* ---------- Botones y ajustes ---------- */

  $('btn-new').addEventListener('click', () => newGame(true));
  $('result-new').addEventListener('click', () => newGame(true));

  $('btn-end-turn').addEventListener('click', () => {
    if (!game.canEndTurn()) return;
    game.endTurn();
    clearSelection();
    if (settings.autoRotate && !game.result) {
      renderer.faceCamera(game.homeDirections[game.turn]);
    }
    syncPanel();
    needsRender = true;
    scheduleAI();
  });

  $('btn-pause').addEventListener('click', () => {
    paused = !paused;
    if (paused) cancelAI();
    else scheduleAI();
    syncPanel();
    needsRender = true;
  });

  /* Deshacer retrocede hasta que vuelva a tocarle a un humano; si no, la IA
     rehace su jugada al instante y parece que el botón no hace nada. */
  $('btn-undo').addEventListener('click', () => {
    cancelAI();
    if (!game.undo()) return;
    if (bothAI()) {
      paused = true;
    } else {
      let guard = 0;
      while (isAI(game.turn) && game.history.length && guard++ < 200) game.undo();
    }
    clearSelection();
    $('result-overlay').classList.add('hidden');
    syncPanel();
    needsRender = true;
    scheduleAI();
  });

  $('btn-center').addEventListener('click', () => {
    renderer.zoom = 1;
    renderer.faceCamera(game.homeDirections[game.turn]);
    needsRender = true;
  });

  for (const p of [0, 1]) {
    const sel = $(`sel-p${p}`);
    sel.value = settings.players[p];
    sel.addEventListener('change', () => {
      settings.players[p] = sel.value;
      paused = false;
      clearSelection();
      syncPanel();
      needsRender = true;
      scheduleAI();
    });
  }

  $('sel-level').value = settings.level;
  $('sel-level').addEventListener('change', (e) => {
    settings.level = e.target.value;
  });

  /* El poliedro se puede fijar en la URL: index.html#icosahedron */
  function polyFromHash() {
    const id = location.hash.replace('#', '');
    return POLYHEDRA[id] ? id : null;
  }

  const selPoly = $('sel-poly');
  const ordered = [
    ...BOARD_ORDER.filter((id) => POLYHEDRA[id]),
    ...Object.keys(POLYHEDRA).filter((id) => !BOARD_ORDER.includes(id)),
  ];
  for (const id of ordered) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = POLYHEDRA[id].name;
    selPoly.appendChild(opt);
  }
  settings.polyId = polyFromHash() || settings.polyId;
  selPoly.value = settings.polyId;

  function updatePolyDescription() {
    const poly = POLYHEDRA[settings.polyId];
    const big = settings.homeSize === 2 && poly.piecesPerPlayerBig;
    const fichas = big ? poly.piecesPerPlayerBig : poly.piecesPerPlayer;
    const libres = poly.vertices.length - 2 * fichas;
    $('poly-desc').textContent =
      `${poly.description} ${fichas} fichas por jugador y ${libres} vértices libres.`;
  }

  const selHome = $('sel-home');
  selHome.value = String(settings.homeSize);
  selHome.addEventListener('change', () => {
    settings.homeSize = Number(selHome.value);
    clearPresetNote();
    updatePolyDescription();
    newGame(true);
  });

  selPoly.addEventListener('change', () => {
    settings.polyId = selPoly.value;
    location.hash = settings.polyId;
    applyBoardPreset(settings.polyId);
    newGame(false);
  });

  window.addEventListener('hashchange', () => {
    const id = polyFromHash();
    if (!id || id === settings.polyId) return;
    settings.polyId = id;
    selPoly.value = id;
    applyBoardPreset(id);
    newGame(false);
  });

  /* «Seguir saltando es obligatorio» solo tiene sentido si hay saltos
     múltiples, así que se apaga con ellos. */
  function syncChainControls() {
    const on = settings.multiJump;
    $('chk-forced').disabled = !on;
    $('lbl-forced').classList.toggle('disabled', !on);
  }

  $('chk-multijump').addEventListener('change', (e) => {
    settings.multiJump = e.target.checked;
    clearPresetNote();
    syncChainControls();
    newGame(true);
  });

  $('chk-forced').addEventListener('change', (e) => {
    settings.forcedChain = e.target.checked;
    clearPresetNote();
    newGame(true);
  });

  $('chk-mandatory').addEventListener('change', (e) => {
    settings.mandatoryCapture = e.target.checked;
    clearPresetNote();
    newGame(true);
  });

  $('chk-autorotate').addEventListener('change', (e) => {
    settings.autoRotate = e.target.checked;
    if (settings.autoRotate) renderer.faceCamera(game.homeDirections[game.turn]);
    needsRender = true;
  });

  $('chk-threats').addEventListener('change', (e) => {
    settings.showThreats = e.target.checked;
    computeThreats();
    needsRender = true;
  });

  /* Pestañas del panel: en pantallas anchas el CSS las oculta y se ve todo
     seguido, así que esto solo tiene efecto en móvil. */
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      for (const t of document.querySelectorAll('.tab')) {
        t.classList.toggle('active', t === tab);
      }
      for (const pane of document.querySelectorAll('.pane')) {
        pane.classList.toggle('active', pane.dataset.pane === name);
      }
    });
  }

  window.addEventListener('resize', () => {
    renderer.resize();
    needsRender = true;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearSelection();
      needsRender = true;
    } else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      $('btn-undo').click();
    }
  });

  /* ---------- Bucle ---------- */

  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    if (renderer.step(dt)) needsRender = true;
    if (needsRender) {
      projected = renderer.render(game, view);
      needsRender = false;
    }
    requestAnimationFrame(loop);
  }

  applyBoardPreset(settings.polyId);
  newGame(false);
  requestAnimationFrame(loop);

  /* Ganchos para inspeccionar o guionizar la partida desde la consola. */
  window.damas = {
    get game() { return game; },
    get renderer() { return renderer; },
    view,
    settings,
    refresh() { syncPanel(); needsRender = true; },
    newGame,
  };
})();
