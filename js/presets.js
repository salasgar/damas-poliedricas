/* Damas poliédricas · Copyright © 2026 Juan Luis Salas García */

'use strict';

/* Preajustes por tablero.

   No todos los poliedros aguantan las mismas reglas. En los tableros pequeños y
   de grado alto, una sola cadena de saltos barre un ejército entero en la
   primera jugada; en los muy amplios pasa lo contrario, nadie ataca nunca y las
   partidas mueren en tablas sin una sola captura.

   Al elegir un tablero se aplican las reglas con las que ese tablero dio las
   mejores partidas en el análisis de ordenador contra ordenador (44
   combinaciones, 20 partidas cada una; el procedimiento y los números están en
   el README). Son un punto de partida, no un candado: el usuario puede cambiar
   cualquier opción después, y al hacerlo desaparece la nota explicativa.

   `reason` se muestra en el panel bajo el selector de tablero. */

/* Orden del desplegable: de más a menos interesante según el análisis, para que
   lo primero que se ofrezca sea lo que mejor se juega. */
const BOARD_ORDER = [
  'dodecahedronPrism',
  'dodecahedron',
  'torus66',
  'truncatedCube',
  'truncatedDodecahedron',
  'nauru',
  'desargues',
  'torus46',
  'octagonalPrism',
  'torus55',
  'truncatedOctahedron',
  'truncatedCuboctahedron',
  'petersenPrism',
  'decagonalPrism',
  'icosidodecahedron',
  'rhombicuboctahedron',
  'dodecagonalPrism',
  'mobiusKantor',
  'heptagonalAntiprism',
  'enneagonalAntiprism',
  'hexagonalPrism',
  'icosahedron',
  'pentagonalAntiprism',
  'petersen',
  'truncatedIcosahedron',
  // Sin ninguna combinación de reglas jugable; el panel avisa.
  'cuboctahedron',
  'tesseract',
  'rhombicosidodecahedron',
  'truncatedIcosidodecahedron',
];

/* Tablero de salida. En una pantalla de móvil un sólido de 60 o 120 vértices
   sale diminuto y con las fichas amontonadas, así que ahí se arranca con el
   mejor tablero que no pase de este tamaño. En escritorio no se toca nada. */
const DEFAULT_BOARD = 'dodecahedron';
const MOBILE_MAX_VERTICES = 30;

/* Devuelve el tablero con el que arrancar. `candidates` permite restringir la
   elección (por ejemplo, a los que admiten cuatro jugadores). */
function defaultBoardId(smallScreen, candidates) {
  const list = candidates && candidates.length ? candidates : BOARD_ORDER;
  const preferred = list.includes(DEFAULT_BOARD) ? DEFAULT_BOARD : list[0];
  if (!smallScreen) return preferred;

  const fits = (id) =>
    POLYHEDRA[id] && POLYHEDRA[id].vertices.length <= MOBILE_MAX_VERTICES;
  if (fits(preferred)) return preferred;
  // La lista va de mejor a peor, así que el primero que quepa es el mejor.
  return list.find(fits) || preferred;
}

const DEFAULT_PRESET = {
  homeSize: 2,
  multiJump: false,
  forcedChain: false,
  mandatoryCapture: false,
  reason: '',
};

const BOARD_PRESETS = {
  dodecahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'La mejor variante de todas: 12 capturas por partida y duraciones de 42 a 116 jugadas.',
  },
  truncatedCube: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Casi tan bueno como el dodecaedro: 11 capturas por partida y hasta 141 jugadas.',
  },
  truncatedDodecahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Ejércitos de 18 fichas y partidas largas (hasta 162 jugadas). Con una sola cara de salida no se comen nunca.',
  },
  truncatedOctahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Buen equilibrio. Aquí los saltos múltiples también funcionan, si quieres partidas más cortas y decisivas.',
  },
  truncatedCuboctahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Tablero grande pero con juego: 6 capturas por partida y de 42 a 118 jugadas.',
  },
  icosidodecahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Sin saltos múltiples: con ellos nadie se atreve a atacar y las partidas acaban sin ninguna captura.',
  },
  rhombicuboctahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Sin saltos múltiples: con ellos las partidas acaban en tablas sin capturas.',
  },
  icosahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Sin saltos múltiples: con ellos, el primero que mueve pierde su ejército entero de una sola cadena.',
  },
  truncatedIcosahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Muy disperso: 60 vértices para 10 fichas por bando, así que apenas hay contacto. Bonito de ver más que de jugar.',
  },

  octagonalPrism: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'El mejor de los prismas: 9,7 capturas por partida sobre un tablero en forma de anillo.',
  },
  decagonalPrism: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Anillo largo: los ejércitos se persiguen por los dos lados del tablero.',
  },
  dodecagonalPrism: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'El anillo más largo. Con una sola cara de salida las fichas casi no llegan a encontrarse.',
  },
  hexagonalPrism: {
    homeSize: 1,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'El más decisivo del lote: solo 12 vértices y resultados repartidos en ambos sentidos.',
  },
  heptagonalAntiprism: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Anillo de triángulos, vértices de grado 4. Partidas de 15 a 65 jugadas.',
  },
  enneagonalAntiprism: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Como el heptagonal pero más largo y algo más lento.',
  },
  pentagonalAntiprism: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Tablero mínimo: 10 vértices. Muy decisivo, aunque con ventaja para el segundo jugador.',
  },

  /* --- Tableros que no son poliedros --- */

  dodecahedronPrism: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'El mejor tablero de todos: 17,6 capturas por partida y duraciones de 48 a 106 jugadas.',
  },
  torus66: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Segundo mejor: 16,7 capturas por partida sobre una rejilla de 36 casillas sin bordes.',
  },
  nauru: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'De los mejores tableros del lote: 11,3 capturas por partida. Es el Petersen generalizado GP(12,5).',
  },
  desargues: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Excelente: 10 capturas por partida y duraciones de 38 a 113 jugadas.',
  },
  torus46: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'El tablero más sangriento: 11,5 capturas por partida. Rejilla sin bordes, se sale por un lado y se entra por el otro.',
  },
  torus55: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Rejilla cuadrada sin bordes, 11,6 capturas por partida. Con saltos múltiples gana casi siempre quien abre.',
  },
  petersenPrism: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Uno de los pocos con victorias en los dos sentidos, y partidas de 13 a 61 jugadas.',
  },
  mobiusKantor: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Petersen generalizado GP(8,3). Correcto, algo más pequeño que Desargues o Nauru.',
  },
  petersen: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Solo 10 vértices: el tablero más pequeño que sigue siendo jugable. Con ejércitos pequeños se queda en nada.',
  },

  /* Estos no tienen ninguna combinación de reglas que dé partidas decentes.
     Se dejan disponibles, pero avisando. */
  tesseract: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Aviso: demasiado simétrico. En las cuatro combinaciones gana siempre el mismo jugador.',
  },
  cuboctahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Aviso: tablero desequilibrado, gana casi siempre el mismo jugador. Con saltos múltiples se decide en la primera jugada.',
  },
  rhombicosidodecahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Aviso: demasiado amplio para los ejércitos que caben. Ninguna combinación de reglas produjo una sola captura.',
  },
  truncatedIcosidodecahedron: {
    homeSize: 2,
    multiJump: false,
    forcedChain: false,
    mandatoryCapture: false,
    reason: 'Aviso: 120 vértices para 12 fichas por bando. Espectacular de ver, pero los ejércitos nunca llegan a encontrarse.',
  },
};
