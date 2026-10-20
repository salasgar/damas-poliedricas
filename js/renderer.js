/* Damas poliédricas · Copyright © 2026 Juan Luis Salas García */

'use strict';

/* Render 3D del poliedro sobre un canvas 2D.

   No usamos WebGL: el tablero tiene como mucho unas decenas de caras, así que
   basta con proyectar en perspectiva y pintar de atrás hacia delante
   (algoritmo del pintor). Como las caras son semitransparentes, ese orden es
   justo el que hace falta para que la profundidad se aprecie bien. */

const PLAYER_COLORS = [
  { base: '#4fc3f7', light: '#b3e9ff', dark: '#0d5b7d', name: 'cian' },
  { base: '#ff8a65', light: '#ffd0bd', dark: '#8a3212', name: 'naranja' },
  { base: '#a5d66b', light: '#ddf5b8', dark: '#41651c', name: 'verde' },
  { base: '#c79bf0', light: '#ecd9ff', dark: '#513072', name: 'violeta' },
];

class Renderer {
  constructor(canvas, polyhedron) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.setPolyhedron(polyhedron);

    this.orientation = Q.identity();
    this.camDist = 3.8;
    this.zoom = 1;
    /* Radio mínimo de acierto al señalar un vértice. Con puntero grueso (dedo)
       se amplía hasta el objetivo táctil recomendado. */
    this.touchSlop = window.matchMedia('(pointer: coarse)').matches ? 22 : 10;
    /* Al orientar una cara hacia la cámara la dejamos inclinada: de frente
       exacto el poliedro se ve como un polígono plano y se pierde el volumen. */
    this.tilt = 0.42;

    // Animación de reorientación automática.
    this.animFrom = null;
    this.animTo = null;
    this.animT = 1;

    this.resize();
  }

  setPolyhedron(poly) {
    this.poly = poly;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.focal = Math.min(this.width, this.height) * 1.05;
  }

  /* --- Cámara ------------------------------------------------------- */

  rotateByDrag(dx, dy) {
    const k = 0.008;
    // Los ejes de giro son los de la pantalla, para que arrastrar "empuje"
    // el sólido en la dirección del gesto.
    const qx = Q.fromAxisAngle([0, 1, 0], dx * k);
    const qy = Q.fromAxisAngle([1, 0, 0], dy * k);
    this.orientation = Q.normalize(Q.mul(Q.mul(qy, qx), this.orientation));
    this.cancelAnimation();
  }

  zoomBy(factor) {
    this.zoom = Math.min(2.2, Math.max(0.55, this.zoom * factor));
  }

  cancelAnimation() {
    this.animT = 1;
    this.animFrom = this.animTo = null;
  }

  /* Orientación que deja la dirección `dir` mirando a la cámara, inclinada
     hacia abajo para que se siga viendo el volumen del tablero. */
  orientationFacing(dir) {
    const current = Q.rotate(this.orientation, dir);
    const align = Q.fromTo(current, [0, 0, 1]);
    const tilt = Q.fromAxisAngle([1, 0, 0], this.tilt);
    return Q.normalize(Q.mul(tilt, Q.mul(align, this.orientation)));
  }

  /* Tableros con eje propio (toros, coronas): en vez de mirar de frente a la
     dirección del ejército —que los dejaría de canto— se mantiene el eje
     apuntando hacia arriba y se gira el tablero sobre sí mismo hasta poner al
     jugador en primer plano. */
  orientationOnAxis(dir) {
    const spin = Q.fromAxisAngle([0, 0, 1], -Math.PI / 2 - Math.atan2(dir[1], dir[0]));
    // Poco escorzo: de canto no se vería el agujero del toro ni las dos coronas.
    const tilt = Q.fromAxisAngle([1, 0, 0], -0.55);
    return Q.normalize(Q.mul(tilt, spin));
  }

  /* Gira suavemente hasta poner `dir` mirando a la cámara. */
  faceCamera(dir, instant) {
    if (!dir || V.len(dir) < 1e-6) return;
    const target = this.poly.axisView
      ? this.orientationOnAxis(dir)
      : this.orientationFacing(dir);
    if (instant) {
      this.orientation = target;
      this.cancelAnimation();
      return;
    }
    this.animFrom = this.orientation;
    this.animTo = target;
    this.animT = 0;
  }

  /* Anima una ficha desplazándose de un vértice a otro, y la desaparición de
     la que se come. Sin esto las fichas se teletransportan y con el ordenador
     jugando es muy difícil seguir la partida. */
  animateMove(move, mover, eaten) {
    this.moveAnim = {
      from: move.from,
      to: move.to,
      over: move.capture ? move.over : null,
      mover,          // color de la ficha que se mueve
      eaten,          // color de la que se come, para desvanecerla
      t: 0,
    };
  }

  /* Posición interpolada de la ficha en movimiento, o null. */
  movingPiece() {
    const a = this.moveAnim;
    if (!a || a.t >= 1) return null;
    // Suavizado en los extremos para que arranque y frene.
    const t = a.t < 0.5 ? 2 * a.t * a.t : 1 - ((-2 * a.t + 2) ** 2) / 2;
    const p = V.lerp(this.poly.vertices[a.from], this.poly.vertices[a.to], t);
    // Un poco de arco hacia fuera: se lee mejor sobre las caras del sólido.
    return V.scale(p, 1 + 0.10 * Math.sin(Math.PI * t));
  }

  /* Devuelve true si sigue animando (y hay que pedir otro frame). */
  step(dt) {
    let busy = false;
    if (this.moveAnim && this.moveAnim.t < 1) {
      this.moveAnim.t = Math.min(1, this.moveAnim.t + dt / 260);
      busy = true;
    }
    if (this.animT >= 1 || !this.animTo) return busy;
    this.animT = Math.min(1, this.animT + dt / 550);
    const t = this.animT;
    const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    this.orientation = Q.slerp(this.animFrom, this.animTo, eased);
    if (this.animT >= 1) this.cancelAnimation();
    return true;
  }

  /* --- Proyección --------------------------------------------------- */

  project(p) {
    const r = Q.rotate(this.orientation, p);
    const depth = this.camDist - r[2];         // mayor = más lejos
    // Los tableros achatados (toros, coronas) piden algo más de aumento.
    const s = (this.focal * this.zoom * (this.poly.viewZoom || 1)) / Math.max(0.35, depth);
    return {
      x: this.cx + r[0] * s,
      y: this.cy - r[1] * s,
      depth,
      scale: s,
      z: r[2],
    };
  }

  projectAll() {
    return this.poly.vertices.map((v) => this.project(v));
  }

  /* Vértice más cercano al punto (x, y) de pantalla, o null.
     Con empates gana el que esté más cerca de la cámara.

     `touchSlop` es el margen de acierto alrededor de la ficha. Con el dedo hace
     falta mucho más que con el ratón: en los tableros de 60 vértices una ficha
     mide unos 12 px en pantalla y sería imposible acertarle. Aquí sí conviene
     pasarse: como gana el candidato más cercano a la cámara, ampliar el margen
     no hace ambiguo el resultado, solo más tolerante. */
  pickVertex(x, y, projected) {
    const pts = projected || this.projectAll();
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const radius = Math.max(this.pieceRadius(p) + 8, this.touchSlop);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > radius) continue;
      // Empatan por cercanía al puntero si ambos están dentro del margen;
      // desempata la profundidad, y a igual profundidad el más pegado al dedo.
      const score = p.depth + d / 400;
      if (!best || score < best.score) best = { index: i, score };
    }
    return best ? best.index : null;
  }

  pieceRadius(p) {
    return Math.max(6, p.scale * 0.115);
  }

  /* --- Dibujo -------------------------------------------------------- */

  render(game, view) {
    const ctx = this.ctx;
    const pts = this.projectAll();

    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackdrop(ctx);

    /* Recogemos todo lo que hay que pintar con su profundidad y lo ordenamos
       de lejos a cerca; así la transparencia se compone correctamente. */
    const items = [];

    this.poly.faces.forEach((face, i) => {
      const fp = face.vertices.map((v) => pts[v]);
      const depth = fp.reduce((a, p) => a + p.depth, 0) / fp.length;
      const normal = Q.rotate(this.orientation, face.normal);
      items.push({
        depth,
        draw: () => this.drawFace(ctx, fp, normal[2], i, game, view),
      });
    });

    this.poly.edges.forEach(([a, b]) => {
      const depth = (pts[a].depth + pts[b].depth) / 2;
      items.push({ depth, draw: () => this.drawEdge(ctx, pts[a], pts[b], a, b, view) });
    });

    for (let i = 0; i < pts.length; i++) {
      items.push({ depth: pts[i].depth, draw: () => this.drawVertex(ctx, pts[i], i, game, view) });
    }

    // La ficha que se está moviendo va aparte: no está en ningún vértice.
    const moving = this.movingPiece();
    if (moving) {
      const mp = this.project(moving);
      items.push({
        depth: mp.depth,
        draw: () => this.drawPiece(ctx, mp, this.moveAnim.mover, 1),
      });
    }

    items.sort((a, b) => b.depth - a.depth);
    for (const item of items) item.draw();

    return pts;
  }

  drawBackdrop(ctx) {
    const g = ctx.createRadialGradient(
      this.cx, this.cy * 0.85, 10,
      this.cx, this.cy, Math.max(this.width, this.height) * 0.75
    );
    g.addColorStop(0, '#16203a');
    g.addColorStop(1, '#080b14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawFace(ctx, fp, facingZ, faceIndex, game, view) {
    ctx.beginPath();
    ctx.moveTo(fp[0].x, fp[0].y);
    for (let i = 1; i < fp.length; i++) ctx.lineTo(fp[i].x, fp[i].y);
    ctx.closePath();

    // Las caras que miran a la cámara se ven algo más claras.
    const facing = (facingZ + 1) / 2;
    let alpha = 0.05 + facing * 0.07;
    let color = `255, 255, 255`;

    // Las caras de salida llevan el color de su dueño.
    const home = game.homeFaceSets.findIndex((set) => set.includes(faceIndex));
    const invasion = game.options.victory === 'invasion';
    if (home >= 0) {
      const c = PLAYER_COLORS[home];
      color = hexToRgb(c.base);
      // Jugando a invadir, el territorio es el objetivo: se tiñe más fuerte.
      alpha = invasion ? 0.12 + facing * 0.2 : 0.07 + facing * 0.13;
    }

    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.fill();

    // Y lleva un emblema en el centro, para reconocerlo de un vistazo.
    if (home >= 0 && invasion && facingZ > 0.05) {
      this.drawHomeEmblem(ctx, fp, PLAYER_COLORS[home], facingZ);
    }
  }

  /* Diana en el centro de una cara de salida: es lo que hay que invadir. */
  drawHomeEmblem(ctx, fp, color, facingZ) {
    const cx = fp.reduce((a, p) => a + p.x, 0) / fp.length;
    const cy = fp.reduce((a, p) => a + p.y, 0) / fp.length;
    // Menos de un tercio del radio de la cara: no debe competir con las fichas.
    const r = Math.min(...fp.map((p) => Math.hypot(p.x - cx, p.y - cy))) * 0.3;
    if (r < 3) return;

    /* La opacidad sigue a lo de frente que esté la cara, no a la profundidad:
       en una cara vista casi de canto el emblema sale deformado y muy pequeño,
       así que ahí conviene que casi no se vea. */
    const alpha = 0.12 + facingZ * 0.5;
    ctx.strokeStyle = `rgba(${hexToRgb(color.light)}, ${alpha})`;
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${hexToRgb(color.light)}, ${alpha})`;
    ctx.fill();
  }

  /* 1 en el punto más cercano a la cámara, 0 en el más lejano. */
  nearness(depth) {
    return Math.max(0, Math.min(1, 1 - (depth - (this.camDist - 1)) / 2.2));
  }

  drawEdge(ctx, a, b, ia, ib, view) {
    const facing = this.nearness((a.depth + b.depth) / 2);
    const isPath =
      view.moveEdges &&
      view.moveEdges.some(
        ([x, y]) => (x === ia && y === ib) || (x === ib && y === ia)
      );

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    if (isPath) {
      ctx.strokeStyle = `rgba(255, 236, 170, ${0.5 + facing * 0.45})`;
      ctx.lineWidth = 2.6;
    } else {
      ctx.strokeStyle = `rgba(190, 214, 255, ${0.16 + facing * 0.5})`;
      ctx.lineWidth = 1 + facing * 1.1;
    }
    ctx.stroke();
  }

  drawVertex(ctx, p, index, game, view) {
    let owner = game.pieces[index];
    const r = this.pieceRadius(p);
    // Cuanto más lejos, más apagado: es lo que da sensación de profundidad.
    const fade = 0.4 + this.nearness(p.depth) * 0.6;

    /* Territorio: al jugar a invadir, cada vértice de un campo de salida lleva
       un anillo del color de su dueño. Es la única marca que sirve en todos los
       tableros, porque los que son solo un grafo no tienen caras que teñir. El
       anillo se cierra y se enciende cuando lo ocupa un invasor. Se pinta antes
       que nada: el territorio no se mueve, así que también está bajo la ficha
       que en ese momento va por el aire. */
    if (game.options.victory === 'invasion') {
      const territory = game.homeOwner[index];
      if (territory !== EMPTY) {
        const invaded = owner !== EMPTY && owner !== territory;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.32, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${hexToRgb(PLAYER_COLORS[territory].light)}, ${
          (invaded ? 0.95 : 0.4) * fade
        })`;
        ctx.lineWidth = invaded ? 2.4 : 1.4;
        if (!invaded) ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    /* Mientras dura la animación la ficha ya está en el destino según las
       reglas, pero en pantalla todavía va por el aire: aquí no se pinta. */
    const anim = this.moveAnim;
    if (anim && anim.t < 1) {
      if (index === anim.to) return;
      if (index === anim.over && anim.eaten !== undefined) {
        this.drawPiece(ctx, p, anim.eaten, 1 - anim.t);
        return;
      }
    }

    // Marcas de destino y selección, por debajo de la ficha.
    const target = view.targets && view.targets.get(index);
    if (target) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.55, 0, Math.PI * 2);
      ctx.fillStyle = target.capture
        ? `rgba(255, 138, 101, ${0.18 * fade + 0.12})`
        : `rgba(140, 245, 190, ${0.16 * fade + 0.1})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = target.capture
        ? `rgba(255, 170, 130, ${fade})`
        : `rgba(150, 250, 200, ${fade})`;
      ctx.stroke();
    }

    if (view.selected === index) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.75, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 236, 170, ${fade})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (view.threatened && view.threatened.has(index)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.45, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 90, 90, ${fade})`;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (owner === EMPTY) {
      // Vértice libre: un punto discreto.
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.6, r * 0.2), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 220, 255, ${0.25 * fade + 0.12})`;
      ctx.fill();
      if (view.hover === index) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.75, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(200, 220, 255, ${0.35 * fade})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      return;
    }

    this.drawPiece(ctx, p, owner, 1, view.hover === index);
  }

  /* Ficha: esfera falsa con un degradado desplazado hacia la luz. */
  drawPiece(ctx, p, owner, opacity, highlight) {
    const r = this.pieceRadius(p);
    const fade = (0.4 + this.nearness(p.depth) * 0.6) * opacity;
    const c = PLAYER_COLORS[owner % PLAYER_COLORS.length];
    const g = ctx.createRadialGradient(
      p.x - r * 0.35, p.y - r * 0.4, r * 0.12,
      p.x, p.y, r
    );
    g.addColorStop(0, c.light);
    g.addColorStop(0.55, c.base);
    g.addColorStop(1, c.dark);

    ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = highlight ? 2 : 1;
    ctx.strokeStyle = highlight
      ? 'rgba(255, 255, 255, 0.85)'
      : 'rgba(0, 0, 0, 0.35)';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
