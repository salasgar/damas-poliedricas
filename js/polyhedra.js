'use strict';

/* Construcción de los poliedros que sirven de tablero.

   Cada poliedro se define solo por sus vértices. De ahí se derivan:
     - aristas: pares de vértices a la distancia mínima (los sólidos que usamos
       son de arista uniforme, así que esto es exacto);
     - caras: se buscan planos de soporte, es decir, planos que pasan por tres
       vértices vecinos y dejan a todos los demás del mismo lado. Vale para
       cualquier poliedro convexo centrado en el origen, sin tener que dar
       las normales a mano;
     - adyacencia: lista de vecinos por vértice, que es el grafo del juego.

   Para añadir un tablero nuevo basta con dar la lista de vértices. */

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

/* Genera las tres permutaciones cíclicas de (x, y, z) con todos los signos
   de las componentes no nulas, sin repetir puntos. */
function cyclicWithSigns(x, y, z) {
  const out = [];
  const seen = new Set();
  const push = (p) => {
    const key = p.map((c) => c.toFixed(6)).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  };
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        const p = [sx * x, sy * y, sz * z];
        push([p[0], p[1], p[2]]);
        push([p[1], p[2], p[0]]);
        push([p[2], p[0], p[1]]);
      }
    }
  }
  return out;
}

/* Prisma uniforme de n lados: dos n-gonos regulares unidos por cuadrados.
   Grafo en forma de escalera cerrada, muy distinto de los sólidos redondos. */
function prism(n) {
  const R = 1 / (2 * Math.sin(Math.PI / n));
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    for (const z of [0.5, -0.5]) out.push([R * Math.cos(a), R * Math.sin(a), z]);
  }
  return out;
}

/* Antiprisma uniforme de n lados: dos n-gonos girados medio paso, unidos por
   triángulos equiláteros. Solo tiene centro de simetría si n es impar. */
function antiprism(n) {
  const R = 1 / (2 * Math.sin(Math.PI / n));
  // Altura para que los triángulos laterales salgan equiláteros.
  const h = Math.sqrt(1 - 1 / (2 * (1 + Math.cos(Math.PI / n))));
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    const b = a + Math.PI / n;
    out.push([R * Math.cos(a), R * Math.sin(a), h / 2]);
    out.push([R * Math.cos(b), R * Math.sin(b), -h / 2]);
  }
  return out;
}

/* Las seis permutaciones de (x, y, z) con todos los signos, sin repetir. */
function allPermsWithSigns(x, y, z) {
  const out = [];
  const seen = new Set();
  const perms = [
    [x, y, z], [x, z, y], [y, x, z],
    [y, z, x], [z, x, y], [z, y, x],
  ];
  for (const p of perms) {
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        for (const sz of [1, -1]) {
          const q = [p[0] * sx, p[1] * sy, p[2] * sz];
          const key = q.map((c) => c.toFixed(6)).join(',');
          if (!seen.has(key)) {
            seen.add(key);
            out.push(q);
          }
        }
      }
    }
  }
  return out;
}

function allSigns(x, y, z) {
  const out = [];
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) out.push([sx * x, sy * y, sz * z]);
    }
  }
  return out;
}

/* Ordena los vértices de una cara en sentido antihorario vistos desde fuera,
   proyectándolos sobre el plano perpendicular a la normal. */
function sortFace(indices, vertices, normal) {
  const n = V.norm(normal);
  const center = indices
    .reduce((acc, i) => V.add(acc, vertices[i]), [0, 0, 0]);
  const c = V.scale(center, 1 / indices.length);

  let u = V.cross(n, [0, 0, 1]);
  if (V.len(u) < 1e-6) u = V.cross(n, [0, 1, 0]);
  u = V.norm(u);
  const w = V.cross(n, u);

  return indices.slice().sort((a, b) => {
    const da = V.sub(vertices[a], c);
    const db = V.sub(vertices[b], c);
    const angA = Math.atan2(V.dot(da, w), V.dot(da, u));
    const angB = Math.atan2(V.dot(db, w), V.dot(db, u));
    return angA - angB;
  });
}

/* Distancias dentro del grafo desde `start`, en número de aristas. */
function bfsDistances(neighbors, start) {
  const dist = new Array(neighbors.length).fill(Infinity);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (const n of neighbors[v]) {
      if (dist[n] === Infinity) {
        dist[n] = dist[v] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/* Reparto para tableros sin caras: se buscan dos vértices lo más lejanos
   posible dentro del grafo y cada jugador ocupa los que le quedan más cerca.
   Es el equivalente general de "salir de dos caras opuestas". */
function homesByDistance(vertices, neighbors, fraction) {
  // Doble barrido: da un par de vértices a distancia (casi) máxima.
  const first = bfsDistances(neighbors, 0);
  let poleA = first.indexOf(Math.max(...first.filter((d) => d < Infinity)));
  const fromA = bfsDistances(neighbors, poleA);
  const poleB = fromA.indexOf(Math.max(...fromA.filter((d) => d < Infinity)));
  const fromB = bfsDistances(neighbors, poleB);

  const n = vertices.length;
  const k = Math.max(2, Math.min(Math.round(n * fraction), Math.floor((n - 2) / 2)));

  // Ordenamos por "de quién está más cerca"; los k de cada extremo son los
  // ejércitos, y como 2k <= n-2 nunca se solapan y siempre sobra sitio.
  const order = vertices
    .map((_, i) => i)
    .sort((x, y) => {
      const dx = fromA[x] - fromB[x];
      const dy = fromA[y] - fromB[y];
      return dx !== dy ? dx - dy : x - y;
    });

  const sets = [order.slice(0, k), order.slice(n - k).reverse()];
  const dirs = sets.map((set) =>
    V.norm(set.reduce((acc, i) => V.add(acc, vertices[i]), [0, 0, 0]))
  );
  return { sets, faces: [[], []], dirs };
}

/* Reparto para más de dos jugadores.

   Se eligen `playerCount` polos por dispersión voraz: el primero es el extremo
   de un diámetro y cada siguiente es el vértice que maximiza la distancia
   mínima a los ya elegidos. Después cada vértice se asigna al polo que tenga
   más cerca, y de cada zona se toman los más próximos a su polo, recortando
   todos los ejércitos al mismo tamaño para que nadie salga con ventaja.

   `occupancy` es la fracción del tablero ocupada entre todos. */
function homesByPoles(vertices, neighbors, playerCount, occupancy) {
  const n = vertices.length;

  // Primer polo: un extremo del diámetro, como en el reparto de dos.
  const first = bfsDistances(neighbors, 0);
  const poles = [first.indexOf(Math.max(...first.filter((d) => d < Infinity)))];
  const dists = [bfsDistances(neighbors, poles[0])];

  while (poles.length < playerCount) {
    let best = -1;
    let bestDist = -1;
    for (let v = 0; v < n; v++) {
      const d = Math.min(...dists.map((dd) => dd[v]));
      if (d > bestDist) {
        bestDist = d;
        best = v;
      }
    }
    poles.push(best);
    dists.push(bfsDistances(neighbors, best));
  }

  // Cada vértice va al polo más cercano; empata el de menor índice.
  const zones = poles.map(() => []);
  for (let v = 0; v < n; v++) {
    let owner = 0;
    for (let i = 1; i < playerCount; i++) {
      if (dists[i][v] < dists[owner][v]) owner = i;
    }
    zones[owner].push(v);
  }
  zones.forEach((z, i) => z.sort((a, b) => dists[i][a] - dists[i][b] || a - b));

  /* Todos los ejércitos del mismo tamaño: lo limita la zona más pequeña, la
     ocupación pedida y la necesidad de dejar huecos libres donde moverse. */
  const k = Math.min(
    Math.floor((n * occupancy) / playerCount),
    Math.floor((n - 2) / playerCount),
    ...zones.map((z) => z.length)
  );
  if (k < 2) return null; // el tablero no da para tantos jugadores

  const sets = zones.map((z) => z.slice(0, k));
  const dirs = sets.map((set) =>
    V.norm(set.reduce((acc, i) => V.add(acc, vertices[i]), [0, 0, 0]))
  );
  return { sets, faces: sets.map(() => []), dirs };
}

function buildPolyhedron(def) {
  // Normalizamos el tamaño para que todos los tableros se vean igual de grandes.
  const radius = Math.max(...def.vertices.map(V.len));
  const vertices = def.vertices.map((v) => V.scale(v, 1 / radius));

  /* Un tablero puede venir con sus aristas ya dadas (grafos) o deducirlas de la
     geometría (sólidos de arista uniforme: son las parejas más cercanas). */
  const neighbors = vertices.map(() => []);
  let edges;
  let minDist = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      minDist = Math.min(minDist, V.dist(vertices[i], vertices[j]));
    }
  }
  if (def.edges) {
    edges = def.edges.map(([a, b]) => [a, b]);
  } else {
    const tol = minDist * 0.02;
    edges = [];
    for (let i = 0; i < vertices.length; i++) {
      for (let j = i + 1; j < vertices.length; j++) {
        if (Math.abs(V.dist(vertices[i], vertices[j]) - minDist) < tol) {
          edges.push([i, j]);
        }
      }
    }
  }
  for (const [i, j] of edges) {
    neighbors[i].push(j);
    neighbors[j].push(i);
  }

  /* --- Caras ---
     Solo las tienen los sólidos convexos. Los grafos pueden traerlas dadas
     (el toro, por ejemplo, aporta sus celdas) o no tener ninguna, en cuyo caso
     el tablero se dibuja como una estructura de alambre. */
  const EPS = 1e-6;
  const faces = [];
  if (def.faces) {
    for (const f of def.faces) {
      const idx = f.vertices || f;
      const center = V.scale(
        idx.reduce((acc, i) => V.add(acc, vertices[i]), [0, 0, 0]),
        1 / idx.length
      );
      const normal = V.norm(f.normal || center);
      faces.push({ normal, vertices: idx.slice() });
    }
  } else if (!def.edges) {
  for (let a = 0; a < vertices.length; a++) {
    const nb = neighbors[a];
    for (let p = 0; p < nb.length; p++) {
      for (let q = p + 1; q < nb.length; q++) {
        const e1 = V.sub(vertices[nb[p]], vertices[a]);
        const e2 = V.sub(vertices[nb[q]], vertices[a]);
        const cross = V.cross(e1, e2);
        if (V.len(cross) < EPS) continue; // vértices colineales

        let normal = V.norm(cross);
        if (V.dot(normal, vertices[a]) < 0) normal = V.scale(normal, -1);
        const d = V.dot(normal, vertices[a]);
        if (d <= EPS) continue; // el plano pasa por el centro: no es una cara

        // Plano de soporte: ningún vértice puede quedar por fuera.
        const dots = vertices.map((v) => V.dot(v, normal));
        if (dots.some((x) => x > d + 1e-5)) continue;

        // Una misma cara se descubre desde varios de sus vértices; comparamos
        // por dirección y no por una clave redondeada, que el ruido numérico
        // haría caer a un lado u otro del corte.
        if (faces.some((f) => V.dist(f.normal, normal) < 1e-4)) continue;

        const idx = [];
        for (let i = 0; i < dots.length; i++) {
          if (d - dots[i] < 1e-5) idx.push(i);
        }
        faces.push({ normal, vertices: sortFace(idx, vertices, normal) });
      }
    }
  }
  }

  // --- Cara opuesta: la de normal contraria ---
  faces.forEach((face, i) => {
    face.index = i;
    face.opposite = faces.findIndex(
      (other) => V.dist(other.normal, V.scale(face.normal, -1)) < 1e-6
    );
  });

  /* --- Reparto inicial ---
     Los sólidos salen de dos caras opuestas. Los grafos sin caras utilizables
     reparten por distancias dentro del grafo. */
  /* El reparto por caras opuestas solo vale en un sólido convexo, donde la cara
     de normal contraria está de verdad al otro lado. En un toro, por ejemplo,
     dos celdas con normales opuestas pueden ser vecinas, así que los tableros
     definidos como grafo reparten siempre por distancias. */
  const candidates = def.edges
    ? []
    : faces.filter(
        (f) => f.opposite >= 0 && faces[f.opposite].vertices.length === f.vertices.length
      );

  if (!candidates.length) {
    const homes = {
      1: homesByDistance(vertices, neighbors, 0.22),
      2: homesByDistance(vertices, neighbors, 0.33),
    };
    return {
      id: def.id,
      name: def.name,
      vertices,
      edges,
      faces,
      neighbors,
      edgeLength: minDist,
      axisView: !!def.axisView,
      viewZoom: def.viewZoom || 1,
      homes,
      startFaces: true, // el modo "ejércitos grandes" también existe aquí
      piecesPerPlayer: homes[1].sets[0].length,
      piecesPerPlayerBig: homes[2].sets[0].length,
      description: def.description,
    };
  }
  const freeRatio = (f) => 1 - (2 * f.vertices.length) / vertices.length;
  const roomy = candidates.filter((f) => freeRatio(f) >= 1 / 3);
  const startFace = (roomy.length ? roomy : candidates)
    .sort((a, b) => b.vertices.length - a.vertices.length)[0];

  /* Variante de ejércitos grandes: la cara de salida más una vecina con la que
     comparta arista. El rival recibe las dos caras opuestas, que por la simetría
     central del sólido dan una posición congruente y disjunta de la primera. */
  const startPair = (() => {
    const a = startFace;
    for (const b of faces) {
      if (b.index === a.index || b.opposite < 0) continue;
      const shared = b.vertices.filter((v) => a.vertices.includes(v));
      if (shared.length !== 2) continue; // adyacentes = comparten una arista
      const mine = new Set([...a.vertices, ...b.vertices]);
      const theirs = [
        ...faces[a.opposite].vertices,
        ...faces[b.opposite].vertices,
      ];
      if (theirs.some((v) => mine.has(v))) continue; // se solaparían
      // Sin huecos libres no hay partida posible.
      if (vertices.length - 2 * mine.size < 2) continue;
      return [a.index, b.index];
    }
    return null;
  })();

  /* Reparto en el formato común: qué vértices ocupa cada bando, qué caras se
     tiñen de su color y hacia dónde mira la cámara al tocarle el turno. */
  const homeFromFaces = (mineFaces) => {
    const theirFaces = mineFaces.map((i) => faces[i].opposite);
    const collect = (list) => [
      ...new Set(list.flatMap((i) => faces[i].vertices)),
    ];
    return {
      sets: [collect(mineFaces), collect(theirFaces)],
      faces: [mineFaces, theirFaces],
      dirs: [faces[mineFaces[0]].normal, faces[theirFaces[0]].normal],
    };
  };

  const homes = { 1: homeFromFaces([startFace.index]) };
  homes[2] = startPair ? homeFromFaces(startPair) : null;

  return {
    id: def.id,
    name: def.name,
    vertices,
    edges,
    faces,
    neighbors,
    edgeLength: minDist,
    axisView: !!def.axisView,
    viewZoom: def.viewZoom || 1,
    startFace: startFace.index,
    startFaces: startPair,
    homes,
    piecesPerPlayer: homes[1].sets[0].length,
    piecesPerPlayerBig: homes[2] ? homes[2].sets[0].length : null,
    description: def.description,
  };
}

const POLYHEDRA_DEFS = [
  {
    id: 'dodecahedron',
    name: 'Dodecaedro',
    description: '20 vértices, 30 aristas, 12 caras pentagonales. Vértices de grado 3.',
    vertices: [
      ...allSigns(1, 1, 1),
      ...cyclicWithSigns(0, INV_PHI, PHI),
    ],
  },
  {
    id: 'icosahedron',
    name: 'Icosaedro',
    description: '12 vértices, 30 aristas, 20 caras triangulares. Vértices de grado 5.',
    vertices: cyclicWithSigns(0, 1, PHI),
  },
  {
    id: 'icosidodecahedron',
    name: 'Icosidodecaedro',
    description:
      '30 vértices, 60 aristas, 12 pentágonos y 20 triángulos. El más amplio: mucho sitio para maniobrar.',
    vertices: [
      ...cyclicWithSigns(0, 0, PHI),
      ...cyclicWithSigns(0.5, PHI / 2, (PHI * PHI) / 2),
    ],
  },
  {
    id: 'cuboctahedron',
    name: 'Cuboctaedro',
    description:
      '12 vértices, 24 aristas, 6 cuadrados y 8 triángulos. Tablero pequeño y agresivo.',
    vertices: cyclicWithSigns(1, 1, 0),
  },
  {
    id: 'truncatedOctahedron',
    name: 'Octaedro truncado',
    description:
      '24 vértices, 36 aristas, 6 cuadrados y 8 hexágonos. Vértices de grado 3.',
    vertices: allPermsWithSigns(0, 1, 2),
  },
  {
    id: 'truncatedCube',
    name: 'Cubo truncado',
    description:
      '24 vértices, 36 aristas, 8 triángulos y 6 octógonos. Vértices de grado 3 y caras de salida amplias.',
    vertices: allPermsWithSigns(Math.SQRT2 - 1, 1, 1),
  },
  {
    id: 'rhombicuboctahedron',
    name: 'Rombicuboctaedro',
    description:
      '24 vértices, 48 aristas, 8 triángulos y 18 cuadrados. Vértices de grado 4.',
    vertices: allPermsWithSigns(1, 1, 1 + Math.SQRT2),
  },
  {
    id: 'truncatedCuboctahedron',
    name: 'Cuboctaedro truncado',
    description:
      '48 vértices, 72 aristas, cuadrados, hexágonos y octógonos. Vértices de grado 3.',
    vertices: allPermsWithSigns(1, 1 + Math.SQRT2, 1 + 2 * Math.SQRT2),
  },
  {
    id: 'truncatedDodecahedron',
    name: 'Dodecaedro truncado',
    description:
      '60 vértices, 90 aristas, 20 triángulos y 12 decágonos. Caras de salida de 10 vértices.',
    vertices: [
      ...cyclicWithSigns(0, INV_PHI, 2 + PHI),
      ...cyclicWithSigns(INV_PHI, PHI, 2 * PHI),
      ...cyclicWithSigns(PHI, 2, PHI + 1),
    ],
  },
  {
    id: 'truncatedIcosahedron',
    name: 'Icosaedro truncado',
    description:
      '60 vértices, 90 aristas, 12 pentágonos y 20 hexágonos: el balón de fútbol.',
    vertices: [
      ...cyclicWithSigns(0, 1, 3 * PHI),
      ...cyclicWithSigns(1, 2 + PHI, 2 * PHI),
      ...cyclicWithSigns(PHI, 2, 2 * PHI + 1),
    ],
  },
  {
    id: 'rhombicosidodecahedron',
    name: 'Rombicosidodecaedro',
    description:
      '60 vértices, 120 aristas, triángulos, cuadrados y pentágonos. Vértices de grado 4.',
    vertices: [
      ...cyclicWithSigns(1, 1, PHI * PHI * PHI),
      ...cyclicWithSigns(PHI * PHI, PHI, 2 * PHI),
      ...cyclicWithSigns(2 + PHI, 0, PHI * PHI),
    ],
  },
  {
    id: 'truncatedIcosidodecahedron',
    name: 'Icosidodecaedro truncado',
    description:
      '120 vértices, 180 aristas, 30 cuadrados, 20 hexágonos y 12 decágonos: el mayor sólido de Arquímedes.',
    vertices: [
      ...cyclicWithSigns(INV_PHI, INV_PHI, 3 + PHI),
      ...cyclicWithSigns(2 * INV_PHI, PHI, 1 + 2 * PHI),
      ...cyclicWithSigns(INV_PHI, PHI * PHI, 3 * PHI - 1),
      ...cyclicWithSigns(2 * PHI - 1, 2, 2 + PHI),
      ...cyclicWithSigns(PHI, 3, 2 * PHI),
    ],
  },
  {
    id: 'hexagonalPrism',
    name: 'Prisma hexagonal',
    description:
      '12 vértices, 18 aristas, 2 hexágonos y 6 cuadrados. Los ejércitos salen de caras laterales opuestas.',
    vertices: prism(6),
  },
  {
    id: 'octagonalPrism',
    name: 'Prisma octogonal',
    description: '16 vértices, 24 aristas, 2 octógonos y 8 cuadrados. Tablero en forma de anillo.',
    vertices: prism(8),
  },
  {
    id: 'decagonalPrism',
    name: 'Prisma decagonal',
    description: '20 vértices, 30 aristas, 2 decágonos y 10 cuadrados. Anillo largo y estrecho.',
    vertices: prism(10),
  },
  {
    id: 'dodecagonalPrism',
    name: 'Prisma dodecagonal',
    description: '24 vértices, 36 aristas, 2 dodecágonos y 12 cuadrados. El anillo más largo.',
    vertices: prism(12),
  },
  {
    id: 'pentagonalAntiprism',
    name: 'Antiprisma pentagonal',
    description: '10 vértices, 20 aristas, 2 pentágonos y 10 triángulos. Vértices de grado 4.',
    vertices: antiprism(5),
  },
  {
    id: 'heptagonalAntiprism',
    name: 'Antiprisma heptagonal',
    description: '14 vértices, 28 aristas, 2 heptágonos y 14 triángulos. Vértices de grado 4.',
    vertices: antiprism(7),
  },
  {
    id: 'enneagonalAntiprism',
    name: 'Antiprisma eneagonal',
    description: '18 vértices, 36 aristas, 2 eneágonos y 18 triángulos. Vértices de grado 4.',
    vertices: antiprism(9),
  },
];

/* --- Reparto según el número de jugadores -------------------------------- */

/* Fracción del tablero ocupada entre todos, según el tamaño de ejército. */
const OCCUPANCY = { 1: 0.5, 2: 0.68 };

/* Con menos vértices que esto, tres o cuatro ejércitos no dejan sitio para
   maniobrar y la partida se decide por asfixia antes de empezar. */
const MIN_VERTICES_MULTI = 24;

const homesCache = new Map();

/* Reparto de `board` para `playerCount` jugadores y ejércitos de tamaño
   `homeSize`. Con dos jugadores se conserva el reparto original (caras
   opuestas en los sólidos, polos opuestos en los grafos); con más, se reparte
   por zonas alrededor de polos dispersos. Devuelve null si no cabe. */
function boardHomes(board, playerCount, homeSize) {
  if (playerCount === 2) return board.homes[homeSize] || board.homes[1];
  if (board.vertices.length < MIN_VERTICES_MULTI) return null;

  const key = `${board.id}:${playerCount}:${homeSize}`;
  if (!homesCache.has(key)) {
    homesCache.set(
      key,
      homesByPoles(
        board.vertices,
        board.neighbors,
        playerCount,
        OCCUPANCY[homeSize] || OCCUPANCY[1]
      )
    );
  }
  return homesCache.get(key);
}

/* ¿Admite este tablero una partida de `playerCount` jugadores? */
function boardSupportsPlayers(board, playerCount) {
  if (playerCount === 2) return true;
  return [1, 2].some((size) => boardHomes(board, playerCount, size));
}

const POLYHEDRA = {};
for (const def of POLYHEDRA_DEFS) {
  POLYHEDRA[def.id] = buildPolyhedron(def);
}

/* --- Tableros que no son poliedros ---------------------------------------

   Grafos con posiciones 3D. Se declaran después porque algunos se construyen a
   partir de un sólido ya montado (los productos por K2). */
const GRAPH_DEFS = [
  {
    id: 'dodecahedronPrism',
    name: 'Dodecaedro doble',
    description:
      'Producto cartesiano del dodecaedro por una arista: dos dodecaedros, uno dentro del otro, con cada vértice unido a su gemelo. 40 vértices de grado 4.',
    ...graphPrism(POLYHEDRA.dodecahedron),
  },
  {
    id: 'petersenPrism',
    axisView: true,
    name: 'Petersen doble',
    description:
      'Producto cartesiano del grafo de Petersen por una arista. 20 vértices de grado 4; no es el esqueleto de ningún poliedro.',
    ...graphPrism(petersenGraph(), 0.55),
  },
  {
    id: 'petersen',
    axisView: true,
    viewZoom: 1.1,
    name: 'Grafo de Petersen',
    description:
      '10 vértices de grado 3. El grafo simétrico más famoso: un pentágono, un pentagrama y los radios que los unen.',
    ...generalizedPetersen(5, 2),
  },
  {
    id: 'desargues',
    axisView: true,
    viewZoom: 1.1,
    name: 'Grafo de Desargues',
    description: '20 vértices de grado 3. Petersen generalizado GP(10,3), dos coronas y sus radios.',
    ...generalizedPetersen(10, 3),
  },
  {
    id: 'mobiusKantor',
    axisView: true,
    viewZoom: 1.1,
    name: 'Grafo de Möbius-Kantor',
    description: '16 vértices de grado 3. Petersen generalizado GP(8,3).',
    ...generalizedPetersen(8, 3),
  },
  {
    id: 'nauru',
    axisView: true,
    viewZoom: 1.1,
    name: 'Grafo de Nauru',
    description: '24 vértices de grado 3. Petersen generalizado GP(12,5).',
    ...generalizedPetersen(12, 5),
  },
  {
    id: 'tesseract',
    name: 'Teseracto',
    description:
      'El hipercubo de dimensión 4 proyectado en 3D: un cubo dentro de otro. 16 vértices de grado 4.',
    ...hypercube(4),
  },
  {
    id: 'torus46',
    axisView: true,
    viewZoom: 1.15,
    name: 'Toro 4×6',
    description:
      'Producto cartesiano de dos ciclos: un tablero cuadriculado sin bordes, enrollado sobre un toro. 24 vértices de grado 4.',
    ...torusGrid(4, 6),
  },
  {
    id: 'torus55',
    axisView: true,
    viewZoom: 1.15,
    name: 'Toro 5×5',
    description: 'Rejilla cuadrada de 25 casillas sin bordes: por un lado se sale y por el otro se entra.',
    ...torusGrid(5, 5),
  },
  {
    id: 'torus66',
    axisView: true,
    viewZoom: 1.15,
    name: 'Toro 6×6',
    description: 'La rejilla más grande sin bordes: 36 vértices de grado 4.',
    ...torusGrid(6, 6),
  },
];

for (const def of GRAPH_DEFS) {
  POLYHEDRA[def.id] = buildPolyhedron(def);
}
