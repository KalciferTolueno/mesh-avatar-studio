# Mi versión de Mesh Avatar Studio

Fork de [shinshin86/mesh-avatar-studio](https://github.com/shinshin86/mesh-avatar-studio)
mantenido en [KalciferTolueno/mesh-avatar-studio](https://github.com/KalciferTolueno/mesh-avatar-studio).
Este documento registra **cada diferencia con el original**: cómo funcionaba antes, cómo
funciona ahora, qué archivos toca y dónde puede chocar con actualizaciones del autor. Se
actualiza en el mismo commit que cada cambio.

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
- **Archivos del original tocados:** `src/engine/rig.js` (`PARAMS`: `positionY`, `positionZ`),
  `src/engine/renderer.js` (`state.shiftY`, `state.zooms`), `src/engine/createMeshAvatar.js`
  (`screenMove`), `src/live/tracking.ts` (posición `y`/`z` de la cabeza, opción `screenMove`),
  `src/live/LiveApp.tsx` (control), `src/live/i18n.ts` y `src/live/i18n-es.ts` (texto).

## Registro de fusiones con el original

| Fecha | Commit del original | Notas |
|---|---|---|
| 2026-10-07 | `3e8f4e9` | Iluminación y sombras. Un conflicto en `src/live/LiveApp.tsx`: se mantuvieron los ajustes guardados de rastreo junto a los de iluminación |
