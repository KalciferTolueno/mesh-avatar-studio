# Mi versión de Mesh Avatar Studio

Fork de [shinshin86/mesh-avatar-studio](https://github.com/shinshin86/mesh-avatar-studio)
mantenido en [KalciferTolueno/mesh-avatar-studio](https://github.com/KalciferTolueno/mesh-avatar-studio).
Este documento registra **cada diferencia con el original**: cómo funcionaba antes, cómo
funciona ahora, qué archivos toca y dónde puede chocar con actualizaciones del autor. Se
actualiza en el mismo commit que cada cambio.

Cómo usar la página En vivo y configurar OBS: [docs/guia-en-vivo.md](docs/guia-en-vivo.md).

## Remotos y ramas

| Nombre | Qué es |
|---|---|
| `origin` | El repositorio original del autor (solo lectura para nosotros) |
| `fork` | Tu repositorio en GitHub |
| `main` | Copia exacta del `main` original. No se trabaja aquí |
| `mi-version` | Tu versión: el original más todos los cambios de este documento |
| `feat/…` | Una mejora en curso; se fusiona en `mi-version` cuando está verificada |

Base actual del original: `3e8f4e9` (Merge pull request #8, iluminación documentada).

## Traer actualizaciones del autor

```sh
git fetch origin
git checkout main && git merge --ff-only origin/main && git push fork main
git checkout mi-version && git merge main
```

1. Si hay conflictos, revisa la sección **Cambios** de abajo: cada cambio dice qué hacía el
   original y qué hace nuestra versión, para decidir cómo combinarlos.
2. Comprueba (mismo orden que pide `AGENTS.md`):
   ```sh
   npm run lint && npm test && npm run build
   uv run --with numpy --with pillow --with opencv-python-headless tools/test_build_layers.py
   uv run tools/test_agent_tools.py
   PLAYWRIGHT_PORT=5300 npm run e2e
   ```
   La regresión numérica (`tests/regression.test.ts`) debe seguir en **0 px**.
3. Renderiza un proyecto con `npm run render-poses -- projects/<nombre>` y míralo.
4. Actualiza la línea "Base actual del original" y el registro de fusiones al final.

### Fallos conocidos de este equipo (no son regresiones)

- `tests/local-projects.test.ts` y `tests/project-jobs.test.ts` (4 pruebas): Windows no permite
  crear enlaces simbólicos sin el Modo de desarrollador (`EPERM: symlink`).
- Pruebas end-to-end: usan el puerto 5173 por defecto; en este equipo otro proyecto ocupa ese
  puerto, por eso se ejecutan con `PLAYWRIGHT_PORT=5300`. Varias fallan también en el código
  original por tiempos (`preview-status` en `updating`); compáralas siempre contra `main`.
  `e2e/lighting.spec.ts:127` (arrastrar la luz en En vivo) también falla en el original en este
  equipo (`mouse.move` agota el tiempo). `e2e/live-streaming.spec.ts:191` (aviso de rastreo
  detenido) a veces agota el tiempo en la ejecución completa por carga; pasa al repetirla sola.

## Principios para que las fusiones sean fáciles

- **Opcional y compatible:** todo lo nuevo del motor se activa por campos opcionales del rig o
  archivos opcionales del proyecto. Un proyecto del original se ve y se mueve igual; la muestra
  Miko no cambia (regresión en 0 px).
- **Archivos nuevos antes que reescribir:** herramientas nuevas en `tools/`, estilos y textos
  nuevos en archivos propios cuando se pueda.
- **No borrar lo del autor si basta con no cargarlo:** así sus actualizaciones no generan
  conflictos de "modificado / borrado".
- Cada cambio de este documento indica los archivos del original que toca: son los puntos donde
  esperar conflictos.

## Cambios

### 1. Rastreo de cámara (página Live)

- **Antes:** un único suavizado exponencial para todos los parámetros (temblaba o iba con
  retraso); el ojo solo se cerraba si MediaPipe daba `eyeBlink ≥ 0.85`; la boca dependía casi
  solo de `jawOpen` y compartía la sensibilidad de la cabeza; el cabeceo estaba invertido
  (mirar arriba bajaba la cabeza); el cuerpo solo seguía un 20 % del giro de la cabeza.
- **Ahora:** filtro One Euro por parámetro; rango de parpadeo aprendido por ojo (un parpadeo
  débil cierra del todo); enlace de ojos opcional; la boca suma la separación de labios, con
  sensibilidad propia y zona muerta; cabeceo corregido; la posición lateral de la cabeza mueve,
  inclina y desplaza el cuerpo (parámetro nuevo `positionX`); los ajustes se guardan en el
  navegador.
- **Archivos:** `src/live/tracking.ts`, `src/live/LiveApp.tsx`, `src/live/i18n.ts`,
  `tests/live-tracking.test.ts`.
- **Conflictos probables:** si el autor cambia `mapFace`, `FacePose` o los controles de Live.

### 2. Motor: parámetro `positionX` y escala del cuerpo

- **Antes:** no existía desplazamiento lateral del avatar; respiración y balanceo del cuerpo
  usaban distancias en píxeles fijas pensadas para la imagen de 1254 px.
- **Ahora:** `positionX` (−1…1) desplaza todo el avatar hasta un 8 % del ancho
  (`renderer.js` suma `state.shiftX` al offset); las distancias del cuerpo se multiplican por
  `ancho / 1254` (factor 1 en Miko).
- **Archivos:** `src/engine/rig.js` (`PARAMS`, `BODY_PX`, `applyBody`), `src/engine/renderer.js`
  (`draw`), `src/engine/createMeshAvatar.js` (`shiftX`).

### 3. Motor: ojos con bocas dibujadas pero sin ojos dibujados

- **Antes:** si el proyecto tenía cualquier variante dibujada, el motor ocultaba los ojos
  originales al parpadear aunque no hubiera ojos dibujados (los ojos desaparecían).
- **Ahora:** cada ojo usa dibujos solo si existen `eyes_half` y `eyes_closed`; si falta
  `eyes_smile` se usa `eyes_closed`.
- **Archivos:** `src/engine/sprites.js` (`eyeDrawn`), `src/engine/createMeshAvatar.js`
  (`eyeOpenFor`).

### 4. Giro 3D de la cabeza (`rig.head.depth`)

- **Antes:** el giro deslizaba la cara como un disco plano; las mejillas y el contorno se
  estiraban; profundidades fijas por rasgo pensadas para Miko (nariz 8 px, orejas asimétricas).
- **Ahora (solo si el rig tiene `head.depth`):** perfil de cúpula (`round`), parte rígida de toda
  la cabeza (`rigid`), profundidad por rasgo (`nose`, `mouth`, `eyes`, `ears`) y mapa de
  profundidad (`map`). Sin `head.depth` el giro es exactamente el original.
- **Archivos:** `src/engine/rig.js` (`turnOffset`, `depthTurn`, bloque `if (DEPTH)` en
  `deformBase`), `src/rig/validate.ts`, `src/rig/types.ts`, `docs/rig-fields.md`.

### 5. Mapa de profundidad (`tools/build-depth.py`)

- **Nuevo:** Depth Anything V2 Small local (ONNX) escribe `built/depth.png` y lo anota en
  `layers.json` (`"depth"`). El motor lo muestrea por vértice si `head.depth.map` está puesto.
- **Archivos del original tocados:** `src/engine/createMeshAvatar.js` (carga `depthAt` antes de
  `createRig`), `src/engine/rig.js` (`createRig(rig, { depthAt })`, peso `depth`),
  `src/editor/project.ts`, `tools/render-poses.mjs`, `docs/reference.md`.
- **Ojo:** volver a ejecutar `build-layers.py` reescribe `layers.json`; hay que volver a correr
  `build-depth.py` y `build-parts.py`.

### 6. Piezas separadas y PSD (`tools/build-parts.py`, `tools/export-psd.py`)

- **Antes:** una sola imagen base (más ojos, mano y accesorios recortados).
- **Ahora (solo si `layers.json` tiene `"parts"`):** cuerpo, cabeza, orejas y pelo delantero en
  capas separadas, con lo oculto rellenado localmente (LaMa para la frente, sombreado suave para
  el cuello). El cuerpo ignora el giro de la cabeza (`baseWeights(..., role = 'body')`); las
  piezas de cabeza la siguen completas. `export-psd.py` genera un PSD por capas.
- **Piezas sobre el cuerpo (`parts.items`):** objetos como los cordones de la capucha se recortan
  por su contorno, la tela de detrás se rellena (suave, desde la propia ropa) y se dibujan entre
  el cuerpo y la cabeza (`z: 0.5`, rol `body`). Así la física los mueve sin deformar la ropa.
- **Lo que hay detrás de la cabeza (`parts.behind`):** en vez de adivinarlo con un relleno
  (que dejaba un parche rectangular y trozos de pelaje al levantar la cabeza), se pinta un cuello
  que se ensancha hacia los hombros, sombreado con el propio tono de sombra del pelaje (no gris),
  y a los lados solo un poco de ropa oscura y apagada, con colores tomados del dibujo, siempre `inset` px dentro de la silueta de la cabeza para que su borde no asome. La
  máscara de la cabeza rellena sus huecos internos (un píxel de la boca se colaba en el cuerpo).
- **Archivos del original tocados:** `src/engine/createMeshAvatar.js` (`addPiece`, bucle de
  `pieces`), `src/engine/rig.js` (`baseWeights` con `role`), `src/rig/validate.ts` y
  `src/rig/types.ts` (`parts`), `src/editor/project.ts`, `tools/render-poses.mjs`, documentación.

### 7. Idioma español

- **Antes:** inglés, japonés y chino; inglés por defecto salvo preferencia guardada.
- **Ahora:** se **añade** el español sin quitar nada. Los selectores (editor y En vivo) muestran
  ES junto a los botones originales. Una preferencia guardada (incluidos japonés o chino) se
  respeta como antes; sin preferencia, un navegador en español arranca en español y cualquier
  otro en inglés, como el original.
- **Textos en español** en archivos propios: `src/editor/i18n-es.ts` (interfaz, peticiones al
  agente, partes, campos), `src/live/i18n-es.ts`, `src/lighting/i18n-es.ts`. El diccionario
  español se construye sobre el inglés (`{ ...en, ...es }`): si el autor añade textos nuevos,
  se ven en inglés hasta traducirlos aquí. **Tras cada fusión, busca claves nuevas en los
  diccionarios en inglés y tradúcelas;** el resto de idiomas los mantiene el autor.
- **Archivos del original tocados (pocas líneas):** `src/editor/i18n.tsx` (tipo `Language`,
  registro de `es`, idioma inicial), `src/editor/App.tsx` (un botón ES), `src/live/LiveApp.tsx`
  (`es` en la lista de idiomas), `src/live/i18n.ts`, `src/lighting/Controls.tsx`.

### 8. Tema oscuro y claro, selector Editar / En vivo

- **Antes:** un único tema claro con colores fijos en `style.css`, `live.css` y `lighting.css`; el
  editor tenía un botón azul "Live" y la página Live un enlace "Volver al editor".
- **Ahora:** tema **oscuro por defecto** y claro, con botón en la barra superior del editor y de
  En vivo (preferencia `mesh-avatar-theme` en el navegador). Un selector segmentado
  **Editar / En vivo** reúne los dos enlaces (siguen siendo páginas distintas; En vivo se abre en
  otra pestaña como antes). La vista de stream para OBS no carga el tema y sigue transparente.
- **Archivos nuevos:** `src/theme/theme.css` (colores y pulido; todas las reglas van bajo
  `:root[data-theme]` para ganar a las originales sin editarlas), `src/theme/theme.ts`
  (preferencia, aplica el tema antes del primer render, textos del selector en es/en/ja/zh),
  `src/theme/ThemeControls.tsx` (`ThemeToggle`, `ModeSwitch`).
- **Archivos del original tocados:** `src/editor/App.tsx` (el enlace Live va dentro de
  `ModeSwitch`; botón de tema), `src/live/LiveApp.tsx` (cabecera con `ModeSwitch` y tema; el
  enlace a Editar conserva el nombre accesible "Volver al editor"), `src/editor/EditorCanvas.tsx`
  (el lienzo se limpia con `clearRect` en vez de pintarse con `#f9fafc`; el fondo lo pone el CSS).
- **Lista de partes compacta:** la descripción de cada parte solo se muestra en la parte
  seleccionada (regla al final de `theme.css`; el original la mostraba en todas).
- **Si el autor cambia estilos:** sus reglas nuevas se verán con nuestros colores mientras usen
  sus variables (`--ink`, `--surface`, `--line`, `--accent`…); si añade colores fijos, hay que
  sobrescribirlos en `theme.css`.

### 9. Física estilo Live2D (`rig.physics`)

- **Antes:** solo había física en los mechones (cadenas de resortes), las borlas y los moños,
  empujados por la cabeza.
- **Ahora (solo si el rig tiene `physics`):** grupos de física como los de Live2D / VTube Studio:
  cada uno es un péndulo amortiguado (pivote → punta) empujado por una mezcla configurable de
  giro e inclinación de cabeza y cuerpo y desplazamiento lateral, con inercia, gravedad (se
  mantiene colgando al inclinarse) y viento suave en reposo. Mueve una pieza separada (`part`,
  p. ej. las orejas) o una banda a lo largo del eje (p. ej. los cordones de la capucha).
  Inspirado en los `physics3.json` de los modelos de ejemplo de VTube Studio (BlackWolfGirl:
  orejas, cola, cordones, mangas…).
- **Archivos nuevos:** `src/engine/groups.js` (simulación y pesos), `tests/physics-groups.test.ts`.
- **Archivos del original tocados:** `src/engine/rig.js` (`baseWeights(..., piece)` añade
  `w.groups`; `deformBase` gira la región alrededor del pivote tras moños y mechones),
  `src/engine/createMeshAvatar.js` (crea la simulación y la avanza en `tick`; pasa el nombre de
  la pieza), `src/rig/validate.ts`, `src/rig/types.ts`, `docs/rig-fields.md`.
- **Ajuste práctico:** la banda (`width`) debe cubrir el objeto entero y al menos dos celdas de la
  malla (`mesh.baseCell`); si no, el objeto se estrecha y ensancha al girar.

### 10. Ajustes de física en En vivo (y en OBS)

- **Nuevo:** sección **Física** en la barra derecha de En vivo: fuerza, rigidez y viento globales
  (la fuerza también escala los mechones, como la "Physics Strength" de VTube Studio) y un control
  de intensidad por cada grupo de `rig.physics`. Se guardan por proyecto en el navegador
  (`mesh-avatar:physics:<proyecto>`), viajan en la URL de OBS (`ph=fuerza,rigidez,viento` y
  `phg=` uno por grupo) y se envían en vivo a las vistas de stream abiertas.
- **Archivos nuevos:** `src/physics/settings.ts` (formato estricto, URL, almacenamiento, envío),
  `src/physics/PhysicsControls.tsx` (controles y textos es/en/ja/zh),
  `src/physics/LivePhysics.tsx` (sección de En vivo), `src/server/physics-relay.ts`
  (retransmisión validada), `tests/physics-settings.test.ts`.
- **Archivos del original tocados:** `vite.config.ts` (registra `physicsRelay()`),
  `src/live/LiveApp.tsx` (estado `physics` y la sección), `src/live/settings.ts`
  (`ViewSettings.physics`, URL), `src/live/avatar-view.ts` (aplica los ajustes al crear el
  avatar), `src/live/stream.ts` (recibe los cambios), `src/engine/createMeshAvatar.js`
  (`setPhysicsTuning`, `getPhysicsGroups`), `src/engine/index.ts` (tipos), `src/engine/groups.js`.

### 11. Movimiento del modelo en pantalla: vertical y zoom

- **Antes (en nuestra versión):** solo desplazamiento lateral (`positionX`), atado a
  "Movimiento del cuerpo".
- **Ahora:** como el "Model Position Movement" de VTube Studio, el avatar sigue la altura de la
  cabeza en el encuadre (`positionY`) y se acerca al inclinarse hacia la cámara (`positionZ`). Un
  control propio, **Movimiento en pantalla**, regula X, Y y zoom; "Movimiento del cuerpo" queda
  para la inclinación y el balanceo del cuerpo. Como la ilustración está cortada abajo, el borde
  inferior nunca sube dentro del marco: bajar desplaza, y subir o alejarse escalan respecto al
  borde inferior; acercarse escala respecto a la cabeza.
- **Sin calibrar también funciona:** la primera posición en que se detecta la cabeza es el centro
  del movimiento; **Calibrar** lo vuelve a fijar. Unos 8 cm de lado, 7 cm de alto u 8 cm hacia la
  cámara dan el recorrido completo (con "Movimiento en pantalla" en 1).
- **Sección Movimiento** en la barra derecha de En vivo (junto a Iluminación y Física): reúne
  "Movimiento en pantalla", "Movimiento del cuerpo", los límites y un botón para restablecerlos.
- **Límites:** topes de 0 a 100 %
  para lateral, arriba, abajo, acercar y alejar (opciones `limitSide`, `limitUp`, `limitDown`,
  `limitIn`, `limitOut`). Se aplican en `mapFace`, así que también limitan la vista de OBS, y se
  guardan con los demás ajustes de rastreo.
  También **Inclinar adelante** e **Inclinar atrás** (`limitLeanForward`, `limitLeanBack`,
  60 % por defecto) limitan la inclinación del cuerpo (`bodyAngleY`).
- **Archivos del original tocados:** `src/engine/rig.js` (`PARAMS`: `positionY`, `positionZ`),
  `src/engine/renderer.js` (`state.shiftY`, `state.zooms`), `src/engine/createMeshAvatar.js`
  (`screenMove`), `src/live/tracking.ts` (posición `y`/`z` de la cabeza, opción `screenMove`),
  `src/live/LiveApp.tsx` (control), `src/live/i18n.ts` y `src/live/i18n-es.ts` (texto).

### 12. Inclinación del cuerpo adelante / atrás (`bodyAngleY`)

- **Antes:** el cuerpo solo giraba (`bodyAngleX`) e inclinaba de lado (`bodyAngleZ`).
- **Ahora:** parámetro `bodyAngleY` (−10…10, positivo = hacia atrás). Inclinarse hacia delante
  baja y ensancha un poco el torso (se acerca); hacia atrás lo sube y estrecha. Se desvanece hacia
  el borde inferior, igual que la inclinación lateral. En En vivo lo mueve un tercio del cabeceo
  (como `FaceAngleY → ParamBodyAngleY` en VTube Studio) más el acercarse a la cámara, escalado
  por "Movimiento del cuerpo". Los grupos de física aceptan `bodyAngleY` como entrada. Control
  "Adelante/atrás" en la prueba de poses del editor. Amplitud: hasta 38 px (escalado al tamaño de la imagen) y un
  6 % de ancho; en En vivo la mueve la mitad del cabeceo y, más suave, el acercarse a la cámara.
  El zoom por distancia es de ±8 % y alcanza su máximo a unos 14 cm.
- **Archivos del original tocados:** `src/engine/rig.js` (`PARAMS`, `applyBody`),
  `src/engine/groups.js`, `src/rig/types.ts`, `src/live/tracking.ts`, `src/editor/Preview.tsx`
  (control), `src/editor/i18n.tsx` y `src/editor/i18n-zh.ts` (clave `bodyLean`),
  `src/editor/i18n-es.ts`.

### 13. Expresión: rangos amplificados como VTube Studio

- **Antes:** el cabeceo, las cejas y la sonrisa seguían la cámara 1:1; con ojos dibujados el ojo
  no podía abrirse más que el dibujo; el rubor nunca se activaba desde la cámara y su tamaño
  estaba fijado para la imagen de 1254 px.
- **Ahora:** sección **Expresión** en En vivo con: rango arriba/abajo (`pitchBoost`, 1.4 por
  defecto, como el ±20° → ±30° de VTube Studio), ojos muy abiertos (`eyeWideGain`), cejas
  (`browGain`), ojos sonrientes (`smileEyes`) y rubor al sonreír (`blushGain`). En el motor, el
  parámetro nuevo `eyeWide` agranda la zona de cada ojo (sobre todo en vertical) incluso con ojos
  dibujados, y el rubor escala con la imagen (factor 1 en Miko). Control "Ojos muy abiertos" en la
  prueba de poses del editor. Sin estas opciones (`mapFace` por defecto) el rastreo es el de antes.
- **Archivos del original tocados:** `src/engine/rig.js` (`PARAMS`: `eyeWide`; `deformBase`),
  `src/engine/renderer.js` (radios del rubor), `src/live/tracking.ts`, `src/live/LiveApp.tsx`
  (sección), `src/live/i18n.ts`, `src/live/i18n-es.ts`, `src/editor/Preview.tsx`,
  `src/editor/i18n.tsx`, `src/editor/i18n-zh.ts`, `src/editor/i18n-es.ts`.

### 14. Expresiones con teclas

- **Nuevo:** sección **Expresiones** en En vivo, como las hotkeys de VTube Studio: Feliz, Sonrojo,
  Enfado, Triste, Sorpresa y Sueño, con teclas 1–6 reasignables (clic en la tecla y pulsar otra) y
  botones. Se activan y quitan con transición suave, se pueden combinar y Esc quita todas. Se
  aplican encima del rastreo (o sobre la pose neutra sin cámara) y llegan a OBS: la página envía
  los parámetros también cuando solo hay expresiones activas. Las teclas solo funcionan con la
  ventana de En vivo en primer plano (un navegador no puede leer teclas globales).
- **Archivos nuevos:** `src/expressions/presets.ts` (expresiones y mezclador),
  `src/expressions/LiveExpressions.tsx` (sección, teclas, textos es/en/ja/zh),
  `tests/expressions.test.ts`.
- **Archivos del original tocados:** `src/live/LiveApp.tsx` (mezclador en cada fotograma, envío y
  sección).

### 15. Animaciones con teclas

- **Nuevo:** sección **Animaciones** en En vivo, como el `TriggerAnimation` de VTube Studio:
  asentir, negar, saludar, reír, sorprenderse, ladear la cabeza, pensar, timidez y guiño (teclas
  Q–O, reasignables). Reutilizan las animaciones del motor (`src/engine/motions.js`), pero se
  reproducen **sobre el rastreo**: las pistas de cabeza, cuerpo y mirada se suman al movimiento
  real y las de la cara se mezclan con entrada y salida suaves. Funcionan sin cámara y llegan a
  OBS. Esc las detiene.
- **Archivos nuevos:** `src/expressions/animations.ts` (reproductor), `src/expressions/HotkeyPanel.tsx`
  (panel de botones con teclas reasignables, compartido con Expresiones).
- **Archivos del original tocados:** `src/live/LiveApp.tsx` (reproductor en cada fotograma, envío,
  sección). Si el autor cambia el formato de `MOTIONS` o `sampleTrack`, revisar `animations.ts`.

### 16. Respiración y parpadeo con cámara

- **Antes:** con la cámara activa la respiración del motor seguía, pero muy sutil y sin mover la
  cabeza, y los ojos dependían solo de lo que la cámara detectara.
- **Ahora:** en la sección Expresión, **Respiración** (0–1, 0.8 por defecto) controla el ciclo de
  respiración durante el rastreo y la cabeza lo acompaña un poco; **Parpadeo** elige entre solo
  cámara, solo automático, o cámara más un parpadeo automático cuando no se detecta ninguno en
  unos 4 s (por defecto), como `UseBreathing` / `UseBlinking` de VTube Studio.
- **Archivos nuevos:** `src/expressions/life.ts`.
- **Archivos del original tocados:** `src/live/tracking.ts` (opciones `breathing`, `blinkMode`),
  `src/live/LiveApp.tsx`, `src/live/i18n.ts`, `src/live/i18n-es.ts`.

### 17. Vocales del micrófono

- **Antes:** con el micrófono, la boca se abría según el volumen y el motor elegía una vocal **al
  azar** en cada sílaba.
- **Ahora (opción "Detectar vocales", activada por defecto):** se aplica pre-énfasis (+6 dB por
  octava), se traza la envolvente uniendo los picos de los armónicos y se compara **la forma
  entera** de 200 a 3200 Hz con la de cada vocal japonesa (perfiles de voz grave y aguda),
  descontando nivel e inclinación del espectro. Las diferencias se suavizan unos 0,1 s y solo se
  cambia a una vocal claramente mejor durante ~0,1 s, así una vocal sostenida ("ooooo") no salta
  entre formas. El motor usa además esa vocal para la apertura de la boca (`setVoiceVowel`) en vez
  de elegir una al azar en cada sílaba. Probado con voces sintéticas de 100 a 250 Hz, con
  vibrato, temblor de formantes e inclinación de 0 a 9 dB/octava; con 12 dB/octava la "a" grave
  puede confundirse a ratos con "o" La vocal fija `mouthForm`, así que se usan las bocas dibujadas que correspondan (あ, い,
  お…). Se calcula en el navegador a partir del espectro; no se graba ni se envía audio.
- **Cambios suaves:** cada vocal se mantiene un tiempo mínimo, la forma de la boca se acerca a la
  nueva vocal con suavidad (`VowelMouth`) y el motor funde los dibujos de boca al cambiar
  (`setMouthBlend`, en `src/engine/sprites.js`; 0 = cambio instantáneo como el original, que es
  lo que usa el editor). Controles en el micrófono: **Suavidad del cambio de vocal** (fundido de
  0,03 a 0,18 s) y **Fuerza de las vocales** (acerca i/u a la boca neutra).
- **Calibración con tu voz:** en el micrófono, un botón por vocal (a, i, u, e, o): se pulsa uno, se
  dice esa vocal sostenida y se graba solo esa (así no se mezclan); se puede repetir cualquiera y
  lo grabado se conserva entre sesiones. Se activa al tener las cinco. Guarda la envolvente media
  de cada una (48 frecuencias de 200 a 3200 Hz) en este
  navegador (`mesh-avatar-vowel-templates`) y desde entonces compara contra ellas en vez de contra
  voces típicas. Pensado para micrófonos de portátil o auriculares sencillos: en la prueba con un
  micrófono de portátil simulado pasa de 179 fotogramas equivocados a 0. "Usar voces típicas"
  borra la calibración. La supresión de ruido del navegador (WebRTC) ya está activa; un supresor
  tipo RNNoise reduciría ruido de fondo pero no mejora la detección de vocales.
- **Archivos nuevos:** `src/expressions/vowels.ts`, `src/expressions/VowelCalibrationPanel.tsx`,
  `tests/vowels.test.ts`, `tests/vowels-sustained.test.ts`, `tests/vowels-calibration.test.ts`.
- **Archivos del original tocados:** `src/live/media.ts` (método `spectrum()` en
  `MicrophoneCapture`), `src/live/tracking.ts` (opciones `voiceVowels`, `vowelSmooth`,
  `vowelStrength`), `src/engine/sprites.js`, `src/engine/motion.js` (`voiceVowel`),
  `src/engine/createMeshAvatar.js`, `src/engine/index.ts` (`setMouthBlend`, `setVoiceVowel`),
  `src/live/LiveApp.tsx`,
  `src/live/i18n.ts`, `src/live/i18n-es.ts`.

### 18. Bocas propias para «e» y «u»

- **Antes:** solo hay cuatro bocas dibujadas (`mouth_a`, `mouth_a_half`, `mouth_i`, `mouth_o`). La
  «e» reutiliza la «a» entreabierta un 6 % más ancha y la «u» es la «o» estrechada al 78 %, así que
  con vocales del micrófono la «e» parece «a» y la «u» parece «o».
- **Ahora:** si el conjunto de sprites trae `mouth_e` y/o `mouth_u`, el motor los usa para esas
  vocales (`OWN_MOUTHS` en `src/engine/sprites.js`); si no, todo sigue como en el original (Miko
  no los tiene: regresión 0 px). `tools/build-sprites.py` recorta también
  `variants/mouth_e.png` y `variants/mouth_u.png` cuando existen (`EXTRA_MOUTH_VARIANTS` en
  `tools/agent_common.py`), sin avisar si faltan. El editor (subida de variantes,
  `variant-requests.py`) no los conoce todavía: se colocan a mano en `variants/`.
- **Tigre:** dibujadas en local con `projects/tigre/work/draw_mouths.py` («e» ancha y plana con
  dientes de arriba, «u» pequeña y redonda) y copiadas a `tigre-3d/built/sprites`.
- **Archivos del original tocados:** `src/engine/sprites.js`, `tools/build-sprites.py`,
  `tools/agent_common.py`.

### 19. Posición y tamaño del avatar en el encuadre (como VTube Studio)

- **Antes:** el avatar siempre ocupaba el encuadre según "Encuadre" (encajar / llenar); no se podía
  mover ni cambiar de tamaño, y la vista previa de En vivo tenía la forma del panel, distinta de
  la de OBS.
- **Ahora:** en En vivo se **arrastra** el avatar para moverlo y se usa la **rueda** sobre él para
  cambiar su tamaño (con el punto bajo el ratón fijo). Sección **Posición y tamaño**: formato de
  la vista previa (16:9 por defecto, 9:16, 4:3, 1:1 o libre, para que coincida con la fuente de
  navegador de OBS), deslizadores horizontal / vertical / tamaño (20–400 %), **Bloquear
  posición** y **Centrar y tamaño original**. Se guarda por proyecto en el navegador
  (`mesh-avatar:frame:<proyecto>`), va en la URL de OBS (`frame=x,y,tamaño`, solo si se movió) y
  se envía en vivo a las vistas de stream abiertas (evento `studio:frame`, repetido cada segundo
  para que una vista abierta después se sincronice).
- **Motor:** `setFrame({ x, y, scale })` aplica un desplazamiento (en fracciones del ancho / alto
  del lienzo) y una escala alrededor del centro del lienzo después del resto de la vista; con los
  valores por defecto no cambia nada (regresión 0 px).
- **Archivos nuevos:** `src/live/frame.ts`, `src/live/LiveFrame.tsx`, `src/server/frame-relay.ts`,
  `tests/live-frame.test.ts`.
- **Archivos del original tocados:** `src/engine/renderer.js` (`frame`), `src/engine/createMeshAvatar.js`
  y `src/engine/index.ts` (`setFrame`), `src/live/settings.ts`, `src/live/avatar-view.ts`,
  `src/live/stream.ts`, `src/live/LiveApp.tsx`, `vite.config.ts` (`frameRelay()`),
  `src/theme/theme.css` (vista previa centrada y cursor de arrastre).

### 20. Física al arrastrar el avatar

- **Antes:** la física solo reaccionaba a la pose (cabeza, cuerpo, posición lateral rastreada).
- **Ahora:** al arrastrar el avatar por el encuadre (sección 19), o cuando la vista de OBS recibe
  ese movimiento, el motor calcula la aceleración del avatar en pantalla (suavizada ~0,05 s,
  porque OBS la recibe 30 veces por segundo) y se la pasa a la física como una fuerza de
  inercia: los grupos de física (`src/engine/groups.js`, parámetro `dragAcc` de `step`) y los
  mechones y moños (`src/engine/physics.js`, campo `drag`) se quedan atrás y vuelven. El arrastre
  del ratón acelera mucho más que moverse ante la cámara, así que se escala (×0,05) y se satura
  (máx. 10 unidades de `positionX`/s²): un arrastre rápido balancea casi hasta el máximo, nunca
  más. Sin arrastre no se suma nada (regresión 0 px).
- **Ajuste:** en Física, **Al arrastrar** (0–2, 1 por defecto). Va en la URL de OBS como cuarto
  valor de `ph=` (`ph=fuerza,rigidez,viento,arrastre`; se siguen aceptando URLs con tres) y por
  el relé de física.
- **Archivos del original tocados:** `src/engine/createMeshAvatar.js` (`dragAcceleration`),
  `src/engine/physics.js`, `src/engine/index.ts`. Del fork: `src/engine/groups.js`,
  `src/physics/settings.ts`, `src/physics/PhysicsControls.tsx`, `tests/physics-settings.test.ts`,
  `tests/physics-groups.test.ts`.

### 21. Cara perdida (como VTube Studio)

- **Antes:** con la cámara encendida, si la cara no se veía durante 0,5 s el avatar volvía al
  reposo (peso con constante 0,2 s, parámetros 0,175 s) y pasaba a las animaciones de espera del
  motor. Nada era configurable.
- **Ahora:** sección **Cara perdida** en En vivo (`src/live/LiveLost.tsx`):
  **Esperar antes de reaccionar** (`lostDelay`, 0,5 s por defecto), **Tiempo de vuelta al
  reposo** (`lostReturn`, 0,6 s: reproduce las constantes originales), **Mientras no te ve**
  (`lostMode`: animaciones de espera como antes, quieto respirando y parpadeando, o mantener la
  última postura de cabeza y cuerpo con la cara relajada), **Expresión mientras no te ve**
  (`lostExpression`, p. ej. Sueño; `ExpressionMixer.setAuto`, no altera las expresiones
  activadas con teclas) y **Animación al volver** (`foundAnimation`, p. ej. Saludar; también se
  reproduce la primera vez que la cámara encuentra la cara). Con los valores por defecto se
  comporta como el original. Sin cámara encendida no cambia nada.
- `FacePose.sample` devuelve además `hold` y `lostFor` (segundos sin ver la cara).
- **Archivos nuevos:** `src/live/LiveLost.tsx`.
- **Archivos del original tocados:** `src/live/tracking.ts` (opciones `lost*`, `sample`),
  `src/live/LiveApp.tsx`. Del fork: `src/expressions/presets.ts` (`setAuto`),
  `src/expressions/LiveExpressions.tsx` (exporta `expressionText`), `tests/live-tracking.test.ts`,
  `tests/expressions.test.ts`.

### 22. Accesorios que siguen la cabeza (como los objetos de VTube Studio)

- **Antes:** no había forma de añadir gafas, gorros u otros objetos sin editar la ilustración.
- **Ahora:** sección **Accesorios** en En vivo (`src/live/LiveItems.tsx`): **Añadir imagen…**
  (PNG, WebP o JPEG de hasta 10 MB, máx. 16), cada uno con su botón y **tecla** para mostrarlo u
  ocultarlo (`HotkeyPanel`, teclas por proyecto en `mesh-avatar-item-keys:<proyecto>`), y para el
  seleccionado: nombre, **Sigue a** (cabeza, cuerpo o nada), **Capa** (delante o detrás del
  avatar), tamaño, giro, voltear, orden y quitar. En la vista previa se **arrastra** un accesorio
  para colocarlo, la **rueda** encima cambia su tamaño y **Mayús + rueda** lo gira (fuera de un
  accesorio, arrastrar y la rueda siguen moviendo el avatar, sección 19).
- **Motor** (`src/engine/items.js`, nuevo): cada accesorio es una imagen rígida en px de la
  imagen original. Para que siga a la cabeza sin doblarse, se deforman su ancla y dos puntos
  vecinos con los pesos de la cara en ese punto (giro con profundidad, cabeceo, inclinación,
  cuerpo; sin cejas, mandíbula, ni mechones) y el accesorio toma la posición, rotación,
  compresión y cizalla resultantes. API: `setItems`, `itemAt`, `canvasToImage`. Con iluminación
  se sombrea como superficie plana. Sin accesorios no cambia nada (regresión 0 px).
- **Renderizador:** `addLayer` acepta `{ item, first }`, nuevos `removeLayer`, `orderItems`,
  `flatNormal`, `applyFrame` (extraído de `draw`, mismo cálculo) y `toImageDrawn` (punto del
  lienzo a px de la imagen tal como se dibujó, con movimiento y encuadre).
- **Guardado:** las imágenes y `items.json` van en `projects/<proyecto>/items/` (ignorado por git)
  a través de un plugin nuevo del servidor (`src/server/project-items.ts`, rutas `/__items/…`:
  solo origen local, nombres seguros, sin salir de la carpeta del proyecto, imágenes
  comprobadas por sus bytes). OBS las carga al abrir y recibe los cambios en vivo (evento
  `studio:items`). Quitar un accesorio borra su copia de la carpeta del proyecto.
- **Archivos nuevos:** `src/engine/items.js`, `src/live/items.ts`, `src/live/LiveItems.tsx`,
  `src/server/project-items.ts`, `tests/live-items.test.ts`.
- **Archivos del original tocados:** `src/engine/renderer.js`, `src/engine/createMeshAvatar.js`,
  `src/engine/index.ts`, `src/live/LiveApp.tsx`, `src/live/stream.ts`, `vite.config.ts`. Del fork:
  `src/live/LiveFrame.tsx` (arrastre y rueda sobre accesorios), `src/theme/theme.css`.

### 23. Imágenes y videos de fondo

- **Antes:** el fondo solo podía ser transparente, verde, azul o un color.
- **Ahora:** en **Fondo** (`src/live/LiveBackground.tsx`): **Imagen o video de fondo** con
  **Subir imagen o video…** (PNG, JPEG, WebP, GIF animado, MP4 o WebM, hasta 60 MB; el video se
  repite en bucle y sin sonido), lista de los ya subidos, **Ajuste del fondo** (cubrir, completo,
  estirar) y **Borrar este archivo**. Se muestra detrás del lienzo del avatar
  (`showBackground` en `src/live/background.ts`: fondo CSS del lienzo para imágenes, un
  `<video>` colocado justo debajo para videos), tanto en la vista previa (dentro del recuadro de
  Posición y tamaño) como en la vista de stream. Se guarda por proyecto en el navegador
  (`mesh-avatar:background:<proyecto>`), va en la URL de OBS (`bgimg=<archivo>&bgfit=…`, solo si
  hay uno) y se envía en vivo (evento `studio:background`, repetido cada segundo).
- **Archivos:** `projects/<proyecto>/backgrounds/` mediante el plugin de la sección 22
  (`/__items/<proyecto>/backgrounds`, `upload-background` con los bytes en bruto, y
  `background/<archivo>`), con las mismas reglas: solo origen local, nombres seguros, sin salir
  del proyecto y tipo comprobado por los bytes (GIF, MP4, WebM, PNG, JPEG, WebP).
- **Archivos nuevos:** `src/live/background.ts`, `src/live/LiveBackground.tsx`.
- **Archivos del original tocados:** `src/live/settings.ts`, `src/live/stream.ts`,
  `src/live/LiveApp.tsx`. Del fork: `src/server/project-items.ts`, `tests/live-items.test.ts`.

### 24. Barra derecha de En vivo plegada

- **Antes:** Cámara, Micrófono y Fondo eran bloques fijos siempre abiertos, y varias secciones
  del fork (expresiones, animaciones, accesorios, posición, movimiento) empezaban abiertas.
- **Ahora:** arriba queda un bloque fijo con lo de cada directo (**Iniciar / Detener cámara**,
  **Calibrar**, estado, avisos, casilla del **micrófono** y la imagen de la cámara). Todo lo
  demás son secciones `<details>` que **empiezan cerradas**: Cámara (dispositivo, espejo,
  sensibilidades, suavizado, mostrar cámara), Micrófono (dispositivo, vocales, calibración,
  ganancia), **Fondo y OBS** (color, imagen o video, encuadre, URL de OBS) y todas las del fork.
  El `<video>` de la cámara está fuera de las secciones plegables a propósito: dentro de un
  `<details>` cerrado deja de dibujarse y el rastreo se para. La imagen de la cámara solo se ve
  con la cámara encendida y "Mostrar la cámara" activado.
- **Prueba e2e tocada:** `e2e/live-streaming.spec.ts:89` abre las secciones Cámara y Fondo antes
  de usar sus controles (sigue fallando en este equipo en el mismo punto que en el original).
- **Archivos del original tocados:** `src/live/LiveApp.tsx`, `e2e/live-streaming.spec.ts`. Del
  fork: `src/live/LiveFrame.tsx`, `src/expressions/HotkeyPanel.tsx` (sin `open`),
  `src/theme/theme.css`.

### 25. App de escritorio para el directo (Tauri)

- **Antes:** para transmitir había que tener `npm run dev` (Node + Vite) y una pestaña de Chrome
  con En vivo. Medido en este portátil con la cámara apagada: **1.693 MB** de RAM (Node 437 MB +
  Chrome limpio 1.256 MB) y ~71 % de un núcleo.
- **Ahora:** `src-tauri/` construye `mesh-avatar-desktop.exe`: una ventana (WebView2) con En vivo
  y un servidor local en Rust (`src-tauri/src/server.rs`, axum) en `127.0.0.1:5191`, la misma
  dirección que usa OBS. Medido igual: **~670 MB** (app 27 MB + WebView2 ~640 MB) y la misma CPU
  (~66–71 %): el rastreo y el dibujo cuestan lo mismo, se ahorra Node y el Chrome aparte.
- **El servidor hace para el directo lo que los plugins de Vite:** `/__bus` (relé WebSocket de
  movimientos, luz, física, encuadre, accesorios y fondo; filtra eventos desconocidos, máx. 60 por
  segundo y evento), `/__studio/projects` y sus archivos en **solo lectura**, `/__items/…`
  (accesorios y fondos, mismas comprobaciones) y las páginas compiladas de `dist-desktop/`.
  Solo acepta peticiones locales (Host y Origin). Si el puerto ya está ocupado (p. ej. con
  `npm run dev` abierto), la ventana usa ese servidor.
- **El editor no está en la app:** crear o retocar el avatar sigue con `npm run dev`. En la app
  no aparece el botón Editar y el proyecto se elige en la cabecera de En vivo.
- **Cambios en la web para que funcione igual en los dos modos:**
  - `src/live/bus.ts` (nuevo): envía y recibe por `import.meta.hot` con `npm run dev` (como el
    original) o por `/__bus` en la app. `src/live/relay.ts`, `src/physics/settings.ts`,
    `src/live/frame.ts`, `src/live/items.ts` y `src/live/background.ts` usan el bus.
  - `src/editor/project.ts`: `localProjects()` también consulta en el modo `desktop`
    (`vite build --mode desktop`).
  - `src/live/LiveProjectPicker.tsx` (nuevo): selector de proyecto en la cabecera de En vivo y
    reapertura del último proyecto si se abre sin `?project=` (`src/live/main.tsx`).
- **Construir:** `npm run desktop` (compila las páginas en `dist-desktop/` y luego Rust; ~4 min la
  primera vez). El exe busca `projects/`, `samples/` y `dist-desktop/` en la carpeta del
  repositorio (o en `MESH_AVATAR_ROOT`). Tras cambiar la web, volver a ejecutar `npm run desktop`.
  Pruebas del servidor: `cargo test --release` en `src-tauri/`. Icono genérico propio
  (`src-tauri/icons/`), no la ilustración del usuario.
- **Notas:** los ajustes guardados en el navegador (calibración de vocales, posición, teclas…)
  son de cada navegador: en la app se configuran una vez. WebView2 pide permiso para la cámara y
  el micrófono la primera vez. Como en Chrome, si la ventana se minimiza el rastreo puede ir más
  lento (aparece el aviso); mejor dejarla abierta detrás de OBS.
- **Archivos nuevos:** `src-tauri/` (Cargo.toml, Cargo.lock, build.rs, tauri.conf.json,
  capabilities/, icons/, shell/, src/main.rs, src/server.rs), `src/live/bus.ts`,
  `src/live/LiveProjectPicker.tsx`. **Del original tocados:** `package.json` (scripts
  `desktop:web` y `desktop`, `@tauri-apps/cli`), `.gitignore`, `src/live/relay.ts`,
  `src/editor/project.ts`, `src/live/main.tsx`, `src/live/LiveApp.tsx`.

### 26. Esquinas rectas en los contenedores

- **Antes:** paneles, secciones, vista previa, recuadros, menús, avisos y etiquetas tenían
  esquinas redondeadas (4–12 px, o píldoras).
- **Ahora:** una regla al final de `src/theme/theme.css` deja a 0 el `border-radius` de todos los
  contenedores (div, section, details, p, label, video, canvas, span…) en el editor y en En vivo.
  Después, también los controles: `--radius` y `--radius-sm` a 0 y una regla con `!important`
  para botones (incluido el sol de la luz), selectores, campos de texto y enlaces con forma de
  botón, que en las hojas del original tienen sus propias esquinas. Solo siguen redondos los
  círculos de verdad (punto de En vivo, muestras de color y números de la guía), además de las
  casillas y los tiradores de los deslizadores del navegador. Para volver atrás basta con borrar
  esas dos reglas y restaurar los tokens.

### 27. Mejoras de la auditoría de diseño (Impeccable)

- **Auditoría:** en [docs/auditoria-diseno.md](docs/auditoria-diseno.md), siguiendo la guía
  `audit` de la skill Impeccable (pbakaus/impeccable, Apache 2.0). De la skill solo se
  descargaron sus instrucciones en Markdown a `.claude/skills/impeccable/` (local, no se sube);
  no se instalaron su programa ni su hook. Nota: de 13/20 a 17/20.
- **Cambios** (todos en `src/theme/theme.css`, salvo el icono):
  - Contraste: `--faint` `#8b8b97` (oscuro) y `#6f6f7d` (claro), `--muted` `#5c5c6a` (claro) y
    un token nuevo, `--accent-ink` (`#5544d4` en claro), para todo texto de acento. Antes, el
    morado sobre lila del tema claro daba 4,31:1 y las etiquetas de sección 2,78–3,54:1.
  - Fuente: se declara la que de verdad se ve (Segoe UI Variable / Segoe UI / system-ui).
    «Inter» estaba declarada pero nunca se cargaba.
  - Insignias (`.lighting-on`, `.badge`) con la paleta de acento en lugar de amarillo; textos
    pequeños a un mínimo de 11–12 px; números tabulares en los valores.
  - Calibración de vocales sin caja propia (era una tarjeta dentro de otra): ahora es una línea
    divisoria.
  - Casillas de 16 px, deslizadores con 24 px de alto, botones y selectores de En vivo con
    32 px mínimo.
  - Chevrons dibujados con CSS en las secciones plegables, en lugar de los caracteres ▸/▾.
    El sol de la luz pasa a ser SVG (`src/lighting/Controls.tsx`, archivo del original).
  - Cabecera de En vivo que se ajusta en varias líneas en pantallas estrechas, `caret-color`
    con el acento y alternativa para `prefers-reduced-motion` (sin transiciones).
- **Archivos del original tocados:** `src/lighting/Controls.tsx`. Del fork:
  `src/theme/theme.css`, `docs/auditoria-diseno.md`.

### 28. En vivo ocupa la ventana; solo la barra de ajustes tiene scroll

- **Antes:** la página entera tenía scroll: al bajar por los ajustes también se desplazaban la
  cabecera y la vista del avatar (que era `position: sticky`).
- **Ahora:** en pantallas de más de 800 px, En vivo mide exactamente la ventana (`100dvh`, sin
  scroll de página). La cabecera y la vista quedan fijas, la vista ocupa toda la altura disponible
  y solo `.live-controls` se desplaza (`overflow-y: auto`, `overscroll-behavior: contain`).
  En pantallas estrechas se mantiene el scroll normal de la página.
- **Archivos:** solo `src/theme/theme.css` (del fork).

### 29. En vivo como app de escritorio (carcasa)

- **Antes:** una cabecera, la vista del avatar y una columna larga con 12 secciones plegables
  (sección 24), más un bloque fijo arriba con cámara, calibrar y micrófono.
- **Ahora** (`src/live/LiveShell.tsx` y `src/live/shell.css`, criterios de las skills Impeccable
  y Taste: separación por líneas en vez de cajas, un solo acento, estados claros):
  - **Barra superior** compacta: marca, nombre, proyecto, Editar/En vivo (solo con
    `npm run dev`), tema e idiomas.
  - **Escenario** de borde a borde con una **barra de herramientas flotante**: iniciar o detener
    la cámara, calibrar (la ayuda va en su descripción emergente), micrófono, bloquear la
    posición, encender o apagar la luz y copiar la URL de OBS. La imagen de la cámara es una
    miniatura en una esquina; está fuera de los paneles para que el rastreo no se pare.
  - **Barra de iconos** a la derecha con 5 grupos (Cámara y voz · Escena · Expresión ·
    Movimiento · Luz y física), de los que se ve **un panel** a la vez (`hidden`, así los
    componentes y sus teclas siguen vivos). El grupo abierto se recuerda
    (`mesh-avatar:live-group`). Dentro del panel, las secciones empiezan abiertas y se separan
    por líneas; se pueden plegar. El tirador de la luz solo aparece en el grupo Luz y física.
  - **Barra de estado:** estado del rastreo, avisos, "Pose neutra guardada", confirmación de
    URL copiada, nivel del micrófono, fps, **vistas de OBS conectadas** y estado del avatar.
- **Vistas de OBS:** cada vista de stream envía `studio:stream-hello` cada 2 s
  (`src/live/streamViews.ts`). En vivo cuenta las que ha oído en los últimos 5 s. Lo reenvían
  `src/server/frame-relay.ts` (Vite) y `src-tauri/src/server.rs` (evento añadido a la lista).
- Sustituye el bloque fijo de la sección 24 y la disposición de la 28 (sus reglas se borraron
  de `theme.css`). En pantallas estrechas todo se apila, la barra de iconos se vuelve una fila
  de pestañas y la página tiene scroll.
- **Pruebas e2e tocadas:** `e2e/live-streaming.spec.ts:89` y `e2e/lighting.spec.ts:127` abren el
  grupo correspondiente (Escena, Luz y física) en lugar de una sección. Siguen fallando en este
  equipo en el mismo punto que en el original.
- **Archivos nuevos:** `src/live/LiveShell.tsx`, `src/live/shell.css`, `src/live/streamViews.ts`.
  **Del original tocados:** `src/live/LiveApp.tsx`, `src/live/stream.ts`, `e2e/lighting.spec.ts`,
  `e2e/live-streaming.spec.ts`. Del fork: `src/server/frame-relay.ts`, `src-tauri/src/server.rs`,
  `src/theme/theme.css`.

### 30. Idiomas en un solo botón (En vivo)

- **Antes:** cuatro botones de idioma en la barra superior.
- **Ahora:** un botón con un globo y el código del idioma actual (`LanguageMenu` en
  `src/live/LiveShell.tsx`). Abre un menú (`role="menu"`, opciones `menuitemradio` con el código y
  el nombre, y una marca en el actual) que se cierra al elegir, al pulsar fuera o con Esc, y se
  recorre con las flechas. El editor conserva su selector compacto.
- **Pruebas e2e:** `e2e/live-streaming.spec.ts` cambia de idioma con `pickLanguage` (abre el menú
  y elige). Nota: la prueba de la línea 95 pasa entera con más tiempo (`--timeout=90000`, 47 s);
  en este equipo solo le faltan segundos con el límite de 30 s.
- **Archivos:** `src/live/LiveShell.tsx`, `src/live/shell.css`, `src/live/LiveApp.tsx`,
  `e2e/live-streaming.spec.ts`.

### 31. OBS sigue al último cambio (varias páginas En vivo abiertas)

- **Problema:** En vivo reenvía su encuadre y su fondo cada segundo (secciones 19 y 23), para que
  una vista de OBS abierta después se sincronice. Con **dos páginas En vivo** abiertas a la vez
  (p. ej. la app de escritorio y una pestaña del navegador), cada una reenviaba sus valores y el
  avatar de OBS **saltaba** de una posición a otra cada segundo.
- **Ahora:** los mensajes de encuadre y fondo llevan `at`, el momento (`Date.now()`) en que esa
  página cambió el valor por última vez. Se guarda por proyecto
  (`mesh-avatar:changed:<frame|background>:<proyecto>`). La vista de stream ignora los que son
  más antiguos que el último aplicado, así que manda la página donde se tocó por última vez. Los
  mensajes sin `at` cuentan como 0 (compatibles). Comprobado con dos emisores alternando valores
  cada 350 ms: el avatar queda quieto en el más reciente (8 de 8 muestras).
- **Archivos:** `src/live/frame.ts` (`at`, `loadChangedAt`, `saveChangedAt`),
  `src/live/background.ts`, `src/live/stream.ts`, `src/live/LiveApp.tsx`,
  `tests/live-frame.test.ts`.
- **Nota de pruebas:** con OBS y la app abiertos a la vez, las pruebas e2e de velocidad del relé
  (`live-streaming.spec.ts:173`) bajan a ~14 fps (mínimo 15) por la carga de la GPU; con OBS
  cerrado pasan.

### 32. Formatos del recuadro y encuadre automático con zona segura

- **Antes:** el recuadro (la fuente de navegador de OBS) solo podía ser 16:9, 9:16, 4:3, 1:1 o el
  panel entero, y el avatar se colocaba a mano: con la cámara podía salirse o cortarse.
- **Ahora** (Escena → Posición y tamaño):
  - **Formatos:** 16:9, 9:16, 4:3, **3:4**, 1:1, **Personalizado** (ancho × alto en px, de 200 a
    4096) y ajustar al panel. Se muestra el **tamaño que debe tener la fuente en OBS** (p. ej.
    1080 × 1080 para 1:1).
  - **Encuadre automático con zona segura** (activo por defecto si el avatar nunca se movió a
    mano) y **Margen de seguridad** (0–20 %, 5 % por defecto). Coloca y escala el avatar para que
    quepa con ese margen arriba y a los lados (abajo apoya en el borde si el dibujo está cortado
    ahí), contando el movimiento máximo de la cámara: de lado (`positionX`, 0,08 del ancho de la
    imagen × límite lateral) y arriba o acercándose (zoom de hasta 10 % y 8 % × límites). Se
    recalcula al cambiar el formato, el margen o los límites de Movimiento. Mover, escalar o usar
    los deslizadores a mano lo apaga. **Encajar ahora** lo aplica una vez.
  - **Guía de zona segura:** línea discontinua sobre la vista previa mientras está abierto el
    grupo Escena.
- **Motor:** `getContentBounds()` (contorno de los píxeles opacos de `base.png`) y
  `fitFrame({ safe, shiftX, grow })` en `src/engine/createMeshAvatar.js`.
- **Comprobado** en 1:1 llevando el tigre al extremo de cada movimiento y de todos a la vez: el
  margen libre más pequeño fue 5,4 % (con margen de 5 %); nunca se corta.
- **Archivos:** `src/engine/createMeshAvatar.js`, `src/engine/index.ts`, `src/live/frame.ts`,
  `src/live/LiveFrame.tsx`, `src/live/LiveApp.tsx`, `src/live/shell.css`.

### 33. La fuente de OBS sigue el formato del recuadro (app de escritorio)

- **Antes:** al cambiar el formato del recuadro en En vivo había que cambiar a mano el ancho y el
  alto de la fuente de navegador en OBS.
- **Ahora:** con **Ajustar la fuente de OBS a este tamaño** (activado por defecto), al cambiar
  el formato o el tamaño personalizado, y cuando OBS conecta una vista, la app pide al servidor
  de escritorio que cambie las fuentes de navegador de OBS que muestran la vista de stream de
  este proyecto (URL `http://127.0.0.1:5191/stream.html` o `localhost` con `project=<proyecto>`)
  al tamaño del recuadro. La sección muestra el resultado: fuente ajustada, OBS cerrado, servidor
  WebSocket de OBS apagado, o ninguna fuente de este avatar. Si está desactivado, aparece
  **Ajustar en OBS ahora**.
- **Cómo:** `src-tauri/src/obs.rs` es un cliente del WebSocket de OBS (obs-websocket v5,
  integrado en OBS 28+). Lee el puerto y la contraseña del archivo de configuración de OBS
  (`%APPDATA%/obs-studio/plugin_config/obs-websocket/config.json`), así que nadie escribe la
  contraseña y nunca llega a una página. Usa `GetInputList`, `GetInputSettings` y
  `SetInputSettings` (`width`, `height`), con un límite de 4 s. Rutas en `server.rs`:
  `GET /__obs/<proyecto>` (cuántas fuentes) y `POST /__obs/<proyecto>` (`{ width, height }`,
  de 200 a 4096 px), solo locales. Con `npm run dev` no existe y la sección lo indica.
- **Comprobado** con OBS 32.2.2: elegir 9:16 en En vivo deja la fuente en 1080 × 1920 y volver
  a 16:9, en 1920 × 1080, con el aviso correcto en la app.
- **Archivos nuevos:** `src-tauri/src/obs.rs`, `src/live/obsLink.ts`. **Tocados del fork:**
  `src-tauri/Cargo.toml` (`tokio-tungstenite`, `sha2`, `base64`), `src-tauri/src/main.rs`,
  `src-tauri/src/server.rs`, `src/live/frame.ts` (`obs`), `src/live/LiveFrame.tsx`,
  `src/live/LiveApp.tsx`, `src/live/shell.css`.

### 34. Botón «Centrar y ajustar al recuadro»

- En la barra de herramientas sobre el avatar: centra el avatar y lo **maximiza** dentro del
  recuadro, dejando solo el margen de seguridad (sin la reserva de movimiento del encuadre
  automático): `fitNow(true)`, que llama a `fitFrame` con `shiftX` y `grow` a 0. En 1:1 el tigre
  queda con 5 % libre a cada lado y apoyado abajo. Funciona aunque la posición esté bloqueada o
  el automático apagado, y no cambia esas opciones. Llega a OBS como cualquier cambio de
  encuadre. El botón **Encajar ahora** de la sección sigue aplicando el encaje con reserva de
  movimiento.
- **Archivos:** `src/live/LiveShell.tsx` (texto e icono), `src/live/LiveApp.tsx`.

### 35. Ventana sin marco de Windows: los botones van en la barra de la app

- **Antes:** la app de escritorio tenía la barra de título de Windows encima de la barra de la app.
- **Ahora:** la ventana se crea sin decoraciones (`.decorations(false)`) y con sombra
  (`.shadow(true)`, que mantiene los bordes para redimensionar y el encaje en los bordes de la
  pantalla). La barra superior de En vivo hace de barra de título:
  - **Minimizar, maximizar/restaurar y cerrar** a la derecha (`WindowControls` en
    `src/live/LiveShell.tsx`), con el estilo de Windows (cerrar en rojo al pasar el ratón). El
    icono de maximizar cambia a restaurar según el estado.
  - **Arrastrar** la ventana desde las zonas vacías, el logo o el título
    (`data-tauri-drag-region`), y **doble clic** para maximizar o restaurar.
  - Solo aparece dentro de la app (cuando existe `window.__TAURI__`); en el navegador la página
    queda igual.
- **Permisos:** `app.withGlobalTauri: true` y la capacidad `default` concede a la página servida
  en `http://127.0.0.1:5191` y `localhost:5191` (`remote.urls`) solo `minimize`,
  `toggle-maximize`, `is-maximized`, `close`, `start-dragging` e `internal-toggle-maximize` de
  su ventana.
- **Comprobado** con UI Automation sobre la ventana real: los tres botones están; maximizar,
  restaurar y minimizar cambian el estado de la ventana. Captura: sin barra de Windows.
- **Archivos:** `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`,
  `src-tauri/capabilities/default.json`, `src/live/LiveShell.tsx`, `src/live/LiveApp.tsx`,
  `src/live/shell.css`.

## Registro de fusiones con el original

| Fecha | Commit del original | Notas |
|---|---|---|
| 2026-10-07 | `3e8f4e9` | Iluminación y sombras. Un conflicto en `src/live/LiveApp.tsx`: se mantuvieron los ajustes guardados de rastreo junto a los de iluminación |
