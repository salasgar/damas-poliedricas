/* Damas poliédricas · Copyright © 2026 Juan Luis Salas García */

'use strict';

/* Tableros que no salen de un poliedro.

   Un tablero solo necesita ser un grafo con una posición 3D para cada vértice.
   Los sólidos son un caso particular cómodo (las caras dan volumen al dibujo),
   pero hay familias de grafos muy jugables que no son el esqueleto de ningún
   poliedro. Aquí se construyen dando vértices y aristas explícitas; el reparto
   inicial se calcula por distancias dentro del grafo, no por caras.

   Cada constructor devuelve { vertices, edges }. */

/* Producto cartesiano de grafos A □ B: los vértices son los pares (a, b), y
   (a1,b1) se une a (a2,b2) cuando a1 = a2 y b1b2 es arista, o al revés.
   El vértice (a, b) recibe el índice a * |B| + b. */
function cartesianProduct(edgesA, sizeA, edgesB, sizeB) {
  const edges = [];
  for (let a = 0; a < sizeA; a++) {
    for (const [b1, b2] of edgesB) edges.push([a * sizeB + b1, a * sizeB + b2]);
  }
  for (const [a1, a2] of edgesA) {
    for (let b = 0; b < sizeB; b++) edges.push([a1 * sizeB + b, a2 * sizeB + b]);
  }
  return edges;
}

/* Ciclo de n vértices. */
function cycleEdges(n) {
  const edges = [];
  for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
  return edges;
}

/* --- Producto cartesiano G □ K2 ------------------------------------------

   Dos copias de G, una dentro de otra, con cada vértice unido a su gemelo.
   Es la forma más directa de "engordar" un grafo: duplica los vértices y sube
   el grado en uno. Visualmente, un sólido dentro de otro. */
function graphPrism(base, innerScale = 0.52) {
  const n = base.vertices.length;
  const vertices = [
    ...base.vertices.map((v) => v.slice()),
    ...base.vertices.map((v) => V.scale(v, innerScale)),
  ];
  const edges = cartesianProduct(base.edges, n, [[0, 1]], 2)
    // cartesianProduct numera (a,b) como a*2+b; aquí preferimos copia|copia.
    .map(([x, y]) => [
      (x % 2) * n + Math.floor(x / 2),
      (y % 2) * n + Math.floor(y / 2),
    ]);

  /* Solo la copia exterior conserva las caras: con las dos pintadas el interior
     se emborrona y deja de leerse como un sólido dentro de otro. */
  const faces = base.faces
    ? base.faces.map((f) => ({ vertices: f.vertices.slice(), normal: f.normal }))
    : null;

  return faces ? { vertices, edges, faces } : { vertices, edges };
}

/* --- Petersen generalizado GP(n, k) ---------------------------------------

   Un anillo exterior de n vértices, un anillo interior donde cada vértice se
   une al que está k pasos más allá, y un radio entre cada par. GP(5,2) es el
   grafo de Petersen; GP(10,3), el de Desargues; GP(8,3), el de Möbius-Kantor.
   Se dibujan como dos coronas a distinta altura, que es fácil de leer. */
function generalizedPetersen(n, k, opts = {}) {
  const outerR = opts.outerR || 1;
  const innerR = opts.innerR || 0.52;
  const z = opts.z || 0.42;
  const vertices = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    vertices.push([outerR * Math.cos(a), outerR * Math.sin(a), z]);
  }
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    vertices.push([innerR * Math.cos(a), innerR * Math.sin(a), -z]);
  }
  const edges = [];
  for (let i = 0; i < n; i++) {
    edges.push([i, (i + 1) % n]);                 // corona exterior
    edges.push([i, i + n]);                       // radio
    edges.push([n + i, n + ((i + k) % n)]);       // estrella interior
  }
  return { vertices, edges };
}

/* --- Rejilla sobre un toro: Cm □ Cn ---------------------------------------

   El producto de dos ciclos. Es un tablero de damas cuadriculado pero sin
   bordes: por arriba se sale por abajo y por la derecha se entra por la
   izquierda. Todos los vértices son de grado 4 y todos equivalentes. */
function torusGrid(m, n, opts = {}) {
  const R = opts.R || 1;        // radio mayor
  const r = opts.r || 0.42;     // radio menor
  const vertices = [];
  const idx = (i, j) => i * n + j;
  for (let i = 0; i < m; i++) {
    const u = (2 * Math.PI * i) / m;
    for (let j = 0; j < n; j++) {
      const v = (2 * Math.PI * j) / n;
      vertices.push([
        (R + r * Math.cos(v)) * Math.cos(u),
        (R + r * Math.cos(v)) * Math.sin(u),
        r * Math.sin(v),
      ]);
    }
  }
  const edges = cartesianProduct(cycleEdges(m), m, cycleEdges(n), n);

  // Cada celda de la rejilla es una cara: así el toro se ve como una superficie
  // y no como una malla de alambre.
  const faces = [];
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const u = (2 * Math.PI * (i + 0.5)) / m;
      const v = (2 * Math.PI * (j + 0.5)) / n;
      faces.push({
        vertices: [
          idx(i, j),
          idx((i + 1) % m, j),
          idx((i + 1) % m, (j + 1) % n),
          idx(i, (j + 1) % n),
        ],
        // Normal de la superficie del toro en el centro de la celda.
        normal: [
          Math.cos(v) * Math.cos(u),
          Math.cos(v) * Math.sin(u),
          Math.sin(v),
        ],
      });
    }
  }
  return { vertices, edges, faces };
}

/* --- Hipercubo Q_d --------------------------------------------------------

   Los vértices son las cadenas de d bits y hay arista entre las que difieren
   en un bit. Q4 es el teseracto, que se dibuja como un cubo dentro de otro. */
function hypercube(d) {
  const n = 1 << d;
  const vertices = [];
  for (let v = 0; v < n; v++) {
    // Los tres primeros bits dan el cubo; los siguientes lo encogen y desplazan.
    let x = (v & 1 ? 1 : -1);
    let y = (v & 2 ? 1 : -1);
    let z = (v & 4 ? 1 : -1);
    let scale = 1;
    for (let b = 3; b < d; b++) {
      if (v & (1 << b)) scale *= 0.45;
    }
    vertices.push([x * scale, y * scale, z * scale]);
  }
  const edges = [];
  for (let v = 0; v < n; v++) {
    for (let b = 0; b < d; b++) {
      const w = v ^ (1 << b);
      if (w > v) edges.push([v, w]);
    }
  }
  return { vertices, edges };
}

/* Grafo de Petersen suelto, para usarlo como base de productos. */
function petersenGraph() {
  return generalizedPetersen(5, 2);
}
