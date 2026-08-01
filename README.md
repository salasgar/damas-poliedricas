# Damas poliédricas

Damas jugadas sobre los **vértices de un poliedro**. El tablero es el grafo del
sólido: las fichas ocupan vértices y se desplazan por las aristas. Y como lo
único que hace falta es un grafo, también se juega sobre grafos que no son el
esqueleto de ningún sólido: toros, hipercubos y productos cartesianos.

Aplicación web sin dependencias ni compilación: abre `index.html` en el
navegador y ya está.

## Reglas

- **Movimiento.** En tu turno mueves una ficha a un vértice adyacente vacío.
- **Captura.** Si un vértice adyacente tiene una ficha rival y esa ficha tiene a
  su vez algún vértice adyacente vacío, saltas sobre ella, la comes y aterrizas
  en ese hueco. A diferencia de las damas planas, **el salto no es rectilíneo**:
  vale cualquier vértice libre contiguo a la pieza comida, lo que suele dar dos
  o más aterrizajes posibles.
- **Salida.** Cada jugador coloca sus fichas en los vértices de una cara (o de
  dos caras contiguas), y el rival en las **caras opuestas**. Como el reparto es
  por caras opuestas, siempre son 2 jugadores.
- **Final.** A dos jugadores, pierde quien se quede sin fichas o sin movimientos
  legales. Si pasan 60 semimovimientos sin comer nada, tablas. A tres o cuatro,
  ver más abajo.

### Reglas opcionales

Configurables desde el panel; cambiarlas empieza una partida nueva. Al elegir un
tablero se activan solas las que mejor le van (ver más abajo); si quieres jugar
una variante aburrida, tendrás que desmarcarlas a mano.

| Opción | Efecto |
| --- | --- |
| **Permitir saltos múltiples** | Tras comer, si esa misma ficha puede volver a comer, el turno continúa con ella. Desactivada, el turno pasa al oponente en cuanto se hace un salto. |
| Seguir saltando es obligatorio | Solo aplica con los saltos múltiples activados. Marcada, hay que encadenar mientras se pueda; sin marcar, decides si sigues o te plantas con «Terminar turno». |
| Comer es obligatorio | Si hay alguna captura disponible, solo se permiten capturas. |

## Jugadores

De **dos a cuatro** bandos, y cada uno se configura por separado como **Humano**
u **Ordenador**: humanos en el mismo dispositivo, contra la máquina en cualquier
color, o todos máquina para ver partidas de demostración. Cuando los lleva todos
el ordenador aparece un botón de **Pausar/Reanudar**.

### Tres y cuatro jugadores

Con más de dos bandos todos son rivales de todos: se puede comer a cualquiera.
Hay dos diferencias de reglas respecto al duelo:

- **Quedarse sin movimientos no elimina, solo pasa turno.** A dos jugadores estar
  bloqueado es derrota, como en las damas de siempre; a tres o cuatro el bloqueo
  casi siempre es temporal, porque en cuanto otro mueva sus fichas vuelve a haber
  hueco. Solo se elimina a quien se queda sin fichas.
- **Se gana por puntos, no por eliminación.** Es el ajuste por defecto, y no es
  una preferencia: con la regla de «el último en pie», **120 de 120 partidas
  simuladas acabaron en tablas**, porque aniquilar a dos o tres rivales con
  fuerzas parejas casi nunca ocurre antes del límite de tablas. Contando fichas
  comidas, los resultados se reparten:

| Tablero | 3 jugadores | 4 jugadores |
| --- | --- | --- |
| Dodecaedro doble | 3/2/5 · 2 tablas | 3/2/2/3 · 2 tablas |
| Nauru | 2/3/3 · 4 tablas | 2/3/2/3 · 2 tablas |
| Icosidodecaedro | 3/5/2 · 2 tablas | 5/1/1/2 · 3 tablas |
| Dodecaedro truncado | 2/6/4 · 0 tablas | 2/7/2/1 · 0 tablas |
| Toro 6×6 | 2/0/10 · 0 tablas | 2/2/3/4 · 1 tabla |

  (victorias por bando, 12 partidas cada casilla; con eliminación todas esas
  casillas serían «0/0/0 · 12 tablas»).

  Puntuar por fichas comidas también suaviza el **kingmaking**: si te eliminan
  pronto tu marcador sigue contando, así que no te da igual a quién ayudas por
  el camino. La regla de eliminación sigue disponible en el panel.

**Qué tableros lo admiten.** Quince de los veintinueve. Los de menos de 24
vértices quedan fuera: tres o cuatro ejércitos no dejan sitio para maniobrar.

**El multijugador rescata los tableros grandes.** Los tres sólidos que a dos
jugadores eran inservibles por parálisis —nadie atacaba y no se comía una sola
ficha— resultan ser los mejores a tres y cuatro, porque con más ejércitos el
contacto es inevitable:

| Tablero | Capturas a 2 jug. | A 3 jug. | A 4 jug. |
| --- | --: | --: | --: |
| Icosidodecaedro truncado (120 v) | 0,0 | 27,8 | **48,8** |
| Rombicosidodecaedro (60 v) | 0,0 | 27,9 | 34,3 |
| Icosaedro truncado (60 v) | 1,1 | 27,8 | 33,8 |
| Dodecaedro truncado (60 v) | 9,9 | 21,7 | 29,4 |
| Toro 6×6 (36 v) | 16,7 | 14,1 | 15,6 |

El ordenador tiene tres niveles (profundidad de búsqueda 2, 4 y 6). En pruebas
de 60 partidas por emparejamiento, alternando colores, sobre el dodecaedro:

| Enfrentamiento | Resultado |
| --- | --- |
| Normal vs Fácil | 55–0 (5 tablas) |
| Difícil vs Fácil | 60–0 |
| Difícil vs Normal | 30–0 (30 tablas) |

`js/ai.js` es un minimax con poda alfa-beta. La particularidad es que el árbol
se recorre por semimovimientos y no por turnos: cuando una ficha encadena
capturas el turno no cambia, así que el mismo bando vuelve a decidir en el nodo
hijo y la búsqueda nunca corta a mitad de una captura múltiple. Plantarse en
medio de una cadena entra en la búsqueda como una jugada más.

Con más de dos bandos el minimax no vale, porque no hay un único adversario cuya
pérdida sea mi ganancia. La búsqueda pasa a ser **paranoid**: el jugador que
mueve maximiza y todos los demás minimizan *su* puntuación, como si estuvieran
aliados contra él. Es pesimista —en realidad los rivales también se pelean entre
sí— pero conserva la poda alfa-beta, que es lo que max^n no permite. Con dos
jugadores es exactamente el minimax de antes. La evaluación se generaliza a «mis
fichas menos las del rival que mejor esté», que es a quien de verdad hay que
ganar.

## Tableros

Diecinueve poliedros de cuatro familias, ordenados en el desplegable de mejor a
peor según el análisis. «Ejército» es con el reparto que aplica el preajuste.

| Poliedro | Vértices | Grado | Ejército | Caras |
| --- | --- | --- | --- | --- |
| **Dodecaedro** | 20 | 3 | 8 | 12 pentágonos |
| **Cubo truncado** | 24 | 3 | 9 | 8 triángulos, 6 octógonos |
| **Dodecaedro truncado** | 60 | 3 | 18 | 20 triángulos, 12 decágonos |
| **Prisma octogonal** | 16 | 3 | 6 | 2 octógonos, 8 cuadrados |
| Octaedro truncado | 24 | 3 | 10 | 6 cuadrados, 8 hexágonos |
| Cuboctaedro truncado | 48 | 3 | 10 | 12 cuadrados, 8 hexágonos, 6 octógonos |
| Prisma decagonal | 20 | 3 | 6 | 2 decágonos, 10 cuadrados |
| Icosidodecaedro | 30 | 4 | 6 | 20 triángulos, 12 pentágonos |
| Rombicuboctaedro | 24 | 4 | 6 | 8 triángulos, 18 cuadrados |
| Prisma dodecagonal | 24 | 3 | 6 | 2 dodecágonos, 12 cuadrados |
| Antiprisma heptagonal | 14 | 4 | 4 | 2 heptágonos, 14 triángulos |
| Antiprisma eneagonal | 18 | 4 | 4 | 2 eneágonos, 18 triángulos |
| Prisma hexagonal | 12 | 3 | 4 | 2 hexágonos, 6 cuadrados |
| Icosaedro | 12 | 5 | 4 | 20 triángulos |
| Antiprisma pentagonal | 10 | 4 | 4 | 2 pentágonos, 10 triángulos |
| Icosaedro truncado | 60 | 3 | 10 | 12 pentágonos, 20 hexágonos |
| Icosidodecaedro truncado | 120 | 3 | 12 | 30 cuadrados, 20 hexágonos, 12 decágonos |
| Cuboctaedro | 12 | 4 | 5 | 6 cuadrados, 8 triángulos |
| Rombicosidodecaedro | 60 | 4 | 7 | 20 triángulos, 30 cuadrados, 12 pentágonos |

Son los 5 sólidos platónicos y 13 arquimedianos que admiten el reparto (los que
tienen **simetría central**, que es lo que garantiza que cada cara tenga una
opuesta congruente), más las familias de **prismas** de lado par y
**antiprismas** de lado impar. Quedan fuera el tetraedro y el tetraedro truncado
(sin centro de simetría), el cubo chato y el dodecaedro chato (quirales), y el
cubo y el octaedro, tan pequeños que las dos caras de salida llenarían el
tablero entero sin dejar un solo hueco.

Los prismas y antiprismas aportan una topología distinta: en vez de una esfera de
vértices son **anillos**, y los dos ejércitos se persiguen dando la vuelta por
uno u otro lado.

Se puede fijar el tablero en la URL: `index.html#octagonalPrism`.

### Tableros que no son poliedros

Un tablero no necesita ser un sólido: basta un **grafo** con una posición 3D
para cada vértice. Los sólidos son un caso cómodo porque sus caras dan volumen
al dibujo, pero hay familias de grafos igual de jugables que no son el esqueleto
de ningún poliedro. Están en `js/graphs.js`:

| Tablero | Vértices | Grado | Qué es |
| --- | --- | --- | --- |
| Dodecaedro doble | 40 | 4 | Dodecaedro □ K₂: dos dodecaedros, uno dentro del otro, con cada vértice unido a su gemelo |
| Petersen doble | 20 | 4 | Petersen □ K₂ |
| Teseracto | 16 | 4 | Hipercubo Q₄: un cubo dentro de otro |
| Toro 4×6, 5×5, 6×6 | 24, 25, 36 | 4 | C_m □ C_n: un tablero cuadriculado **sin bordes** |
| Grafo de Petersen | 10 | 3 | GP(5,2) |
| Möbius–Kantor | 16 | 3 | GP(8,3) |
| Desargues | 20 | 3 | GP(10,3) |
| Nauru | 24 | 3 | GP(12,5) |

Todos salen de dos construcciones generales: el **producto cartesiano** A □ B
—donde (a₁,b₁) se une a (a₂,b₂) si coinciden en una coordenada y son vecinos en
la otra— y el **Petersen generalizado** GP(n,k), una corona exterior, una
estrella interior de paso k y los radios entre ambas. El toro es el producto de
dos ciclos y el teseracto es K₂ □ K₂ □ K₂ □ K₂, así que en el fondo casi todo es
el mismo producto aplicado a distintas piezas.

### El reparto inicial

En un sólido convexo cada jugador sale de una cara y el rival de la opuesta. Eso
no se puede trasladar tal cual a un grafo: no hay caras, y donde las hay
artificialmente (las celdas del toro) dos caras con normales opuestas pueden ser
vecinas, con lo que los dos ejércitos nacerían pegados.

Los tableros-grafo usan por tanto un criterio equivalente pero interno al grafo:
se buscan **dos vértices lo más lejanos posible** (doble recorrido en anchura) y
cada jugador ocupa los vértices que le quedan más cerca, ordenando por la
diferencia de distancias a uno y otro polo. Es la traducción exacta de "salir de
caras opuestas" cuando no hay caras.

Con **tres o cuatro jugadores** se generaliza igual en todos los tableros, sean
sólidos o no: los polos se eligen por dispersión voraz —el primero es el extremo
de un diámetro y cada siguiente es el vértice que maximiza la distancia mínima a
los ya elegidos—, cada vértice va al polo que tenga más cerca y de cada zona se
toman los más próximos a su polo, recortando todos los ejércitos al mismo tamaño
para que nadie salga con ventaja.

### Ejércitos pequeños o grandes

Cada bando puede salir de **una** cara o de **dos caras que compartan arista**;
al rival le tocan las caras opuestas, que por la simetría central del sólido dan
una posición congruente. En los tableros-grafo es lo mismo con bolas de dos
tamaños alrededor del polo (22 % y 33 % de los vértices). Los ejércitos grandes
son el ajuste por defecto: más contacto y muchas más capturas.

## Controles

- **Arrastrar**: girar el poliedro. **Rueda** o **pellizco**: acercar y alejar.
- **Clic en una ficha propia**: seleccionarla; se marcan en verde los
  movimientos simples y en naranja los saltos, con el camino resaltado.
- **Clic en un destino marcado**: mover.
- `Esc` deselecciona, `Ctrl/Cmd+Z` deshace.
- «Girar hacia el jugador en turno» reorienta la vista al cambiar de turno para
  que siempre veas tu cara de salida.

Las fichas se desplazan con una animación corta al moverse, y la ficha comida se
desvanece: sin eso las jugadas del ordenador son saltos instantáneos difíciles
de seguir.

En pantallas estrechas el panel se reorganiza en pestañas (Partida, Tablero,
Reglas, Jugadas), y en apaisado vuelve a dos columnas. Además el tablero de
salida se elige según la pantalla: en móvil no se arranca en un sólido de 60 o
120 vértices, que saldría diminuto y con las fichas amontonadas, sino en el mejor
tablero que no pase de 30 vértices. Un `#idDelTablero` en la URL manda siempre
sobre esa elección. Con pantalla táctil el
margen de acierto al señalar un vértice sube de 10 a 22 px: en un tablero de 60
vértices una ficha mide unos 12 px y con el dedo sería inalcanzable. Ampliarlo
no vuelve ambigua la elección porque, entre los candidatos dentro del margen,
gana el que está más cerca de la cámara.

## Estructura

```
index.html          estructura y panel lateral
css/style.css
js/math3d.js        vectores y cuaterniones
js/polyhedra.js     construcción de los tableros (sólidos y grafos)
js/graphs.js        grafos que no son poliedros: productos, toros, GP(n,k)
js/presets.js       reglas por defecto de cada tablero, salidas del análisis
js/game.js          reglas (independiente del render)
js/ai.js            jugador automático (minimax con poda alfa-beta)
js/renderer.js      proyección en perspectiva sobre canvas 2D
js/main.js          interacción y bucle de dibujo
```

El render no usa WebGL. Como el tablero tiene pocas decenas de caras, basta con
proyectar en perspectiva y pintar de atrás hacia delante; ese orden es además el
que hace falta para componer bien las caras semitransparentes, que son las que
dan la sensación de profundidad.

`js/game.js` y `js/ai.js` no dependen del navegador, así que se pueden simular
partidas enteras desde Node — que es como se hizo el análisis de variantes de
más abajo.

### Añadir un poliedro

Basta con añadir su lista de vértices a `POLYHEDRA_DEFS` en `js/polyhedra.js`.
Las aristas se deducen por distancia mínima y las caras buscando planos de
soporte, así que no hay que dar normales a mano. Necesita ser convexo, estar
centrado en el origen, tener arista uniforme y un par de caras opuestas iguales
de las que salgan los ejércitos.

La cara de salida se elige sola: la mayor que tenga opuesta congruente **y** deje
libre al menos un tercio del tablero. Ese segundo requisito es lo que hace que en
un prisma los ejércitos salgan de dos caras laterales y no de las dos bases, que
ocuparían todos los vértices y no dejarían ni un hueco donde mover.

## Qué variantes tienen interés

Se simularon **116 combinaciones** de tablero, tamaño de ejército y saltos
múltiples, con 20 partidas de ordenador contra ordenador cada una (nivel Normal,
con desempate aleatorio para que no salga siempre la misma partida).

Una variante se considera **aburrida** si cumple cualquiera de estas cuatro
condiciones, que son las que se comprueban en el análisis:

- se decide en 3 jugadas o menos,
- gana siempre el mismo jugador (≥ 90 % de las partidas),
- no se come casi nada (menos de 1 captura por partida),
- sale siempre la misma partida.

### Jugabilidad de cada tablero

Cada tablero con su mejor configuración, ordenados por calidad de juego.
«Ejército» son las fichas por jugador; «Resultados», victorias de quien abre /
de quien responde / tablas sobre 20 partidas.

| Tablero | V | Ejército | Jugadas | Capturas | Resultados | Valoración | Carácter |
| --- | --: | --: | --: | --: | :-: | :-: | --- |
| Dodecaedro doble | 40 | 13 | 48–106 | 17.6 | 0/0/20 | ★★★ | Muy táctico, capturas constantes |
| Dodecaedro | 20 | 8 | 42–116 | 12.1 | 0/1/19 | ★★★ | Mucho combate, suele acabar en tablas |
| Toro 6×6 | 36 | 12 | 53–84 | 16.7 | 0/0/20 | ★★★ | Muy táctico, capturas constantes |
| Cubo truncado | 24 | 9 | 40–141 | 10.6 | 0/0/20 | ★★★ | Mucho combate, suele acabar en tablas |
| Dodecaedro truncado | 60 | 18 | 31–162 | 9.9 | 0/0/20 | ★★★ | Mucho combate, suele acabar en tablas |
| Nauru GP(12,5) | 24 | 8 | 41–90 | 11.3 | 0/0/20 | ★★☆ | Mucho combate, suele acabar en tablas |
| Desargues GP(10,3) | 20 | 7 | 38–113 | 10.1 | 0/0/20 | ★★☆ | Mucho combate, suele acabar en tablas |
| Toro 4×6 | 24 | 8 | 38–88 | 11.5 | 0/0/20 | ★★☆ | Mucho combate, suele acabar en tablas |
| Toro 5×5 | 25 | 8 | 41–78 | 11.6 | 0/0/20 | ★★☆ | Mucho combate, suele acabar en tablas |
| Prisma octogonal | 16 | 6 | 14–67 | 9.7 | 0/2/18 | ★★☆ | Mucho combate, suele acabar en tablas |
| Octaedro truncado | 24 | 10 | 31–119 | 7.3 | 0/0/20 | ★★☆ | Combate moderado |
| Cuboctaedro truncado | 48 | 10 | 42–118 | 6.0 | 0/0/20 | ★★☆ | Combate moderado |
| Petersen doble | 20 | 7 | 13–61 | 10.4 | 4/1/15 | ★★ | Mucho combate, suele acabar en tablas |
| Prisma decagonal | 20 | 6 | 36–89 | 7.9 | 0/1/19 | ★★ | Combate moderado |
| Icosidodecaedro | 30 | 6 | 37–98 | 4.3 | 0/0/20 | ★★ | Duración muy variable, poco contacto |
| Rombicuboctaedro | 24 | 6 | 37–67 | 7.3 | 0/0/20 | ★★ | Combate moderado |
| Prisma dodecagonal | 24 | 6 | 37–83 | 6.0 | 0/0/20 | ★★ | Combate moderado |
| Möbius–Kantor GP(8,3) | 16 | 5 | 8–67 | 6.4 | 1/0/19 | ★★ | Combate moderado |
| Antiprisma heptagonal | 14 | 4 | 15–65 | 5.6 | 1/0/19 | ★★ | Combate moderado |
| Antiprisma eneagonal | 18 | 4 | 40–75 | 4.8 | 0/0/20 | ★☆ | Poco contacto |
| Prisma hexagonal | 12 | 4 | 6–45 | 6.0 | 2/6/12 | ★☆ | Combate moderado |
| Icosaedro | 12 | 4 | 33–63 | 5.5 | 0/0/20 | ★☆ | Combate moderado |
| Antiprisma pentagonal | 10 | 4 | 5–36 | 5.8 | 0/10/10 | ★☆ | Decisivo, con ventaja para un bando |
| Grafo de Petersen | 10 | 3 | 33–63 | 3.0 | 0/0/20 | ★ | Poco contacto |
| Icosaedro truncado | 60 | 10 | 31–77 | 1.1 | 0/0/20 | ★ | Duración muy variable, poco contacto |

Las estrellas resumen la puntuación descrita arriba: duración y variedad de
duración, capturas por partida, equilibrio entre bandos y proporción de partidas
decisivas. Que muchos acaben en tablas no los descalifica: entre dos ordenadores
del mismo nivel y con material simétrico es lo esperable, igual que en las damas
planas; lo que mide la tabla es si hay juego por el camino.

Sin ninguna variante jugable: **cuboctaedro**, **teseracto**,
**rombicosidodecaedro** e **icosidodecaedro truncado**.

### Los dos fallos característicos

Los saltos múltiples parten el juego en dos, y cada mitad falla por un motivo
opuesto:

- **Tableros pequeños o de grado alto: barrido.** Una sola cadena se lleva el
  ejército entero. En el icosaedro y el cuboctaedro no es una tendencia sino un
  hecho demostrable: recorriendo **todas** las aperturas y **todas** las
  respuestas, con una cara de salida J2 gana tras las 9 de 9 (icosaedro) y 8 de 8
  (cuboctaedro) aperturas posibles. Con dos caras es todavía peor, porque los
  ejércitos nacen en contacto y entonces gana J1 en **una** jugada.
- **Tableros amplios: parálisis.** Con mucho hueco libre, acercarse siempre es
  peor que no hacer nada, así que nadie ataca y la partida muere en tablas. Con
  saltos múltiples dan **0 capturas** por partida el icosidodecaedro, el
  rombicuboctaedro, el cuboctaedro truncado, el dodecaedro truncado, el icosaedro
  truncado, el icosidodecaedro truncado y tres de los cuatro prismas.

Por eso el preajuste de casi todos los tableros los desactiva. Solo el
dodecaedro y el octaedro truncado los aguantan, y aun así rinden mejor sin ellos.

### Los cuatro tableros que no se salvan

- **Cuboctaedro**: ninguna de sus 4 combinaciones es jugable. Con saltos
  múltiples se decide en la primera jugada; sin ellos gana siempre el mismo
  bando (30 de 30). Solo tiene 12 vértices y 2 huecos libres.
- **Rombicosidodecaedro**: 60 vértices para 7 fichas por bando. Ninguna
  combinación produjo una sola captura.
- **Icosidodecaedro truncado**: lo mismo llevado al extremo, 120 vértices para
  12 fichas. Es el más vistoso de todos y el que menos se juega.
- **Teseracto**: demasiado simétrico y demasiado pequeño. En las cuatro
  combinaciones gana siempre el mismo jugador.

Se dejan en la lista, pero el panel avisa al elegirlos.

### Efecto de las otras opciones

- **Dos caras de salida en vez de una** mejora casi todo: en el dodecaedro sube
  las capturas de 5,8 a 12,1 por partida. La excepción son el icosaedro y el
  cuboctaedro con saltos múltiples, donde el contacto inicial lo empeora.
- **«Comer es obligatorio»** apenas cambia nada: acorta un poco las partidas y
  sube las capturas, sin alterar ninguna conclusión.

Entre ordenadores del mismo nivel la mayoría de estas variantes acaban en tablas,
lo cual es normal en un juego de damas con material simétrico y no dice que sean
aburridas: lo que las hace jugables es que duren, que se coma y que no estén
decididas de antemano.

## Ideas pendientes

- Coronación: fichas que llegan a la zona contraria y ganan algún privilegio.
- Partidas por red y guardar/cargar posiciones.
- Equipos (2 contra 2) en los tableros grandes.
- Más grafos: producto por K₂ de los mejores tableros, cilindro y banda de
  Möbius, esferas geodésicas, circulantes C_n(1,k).
