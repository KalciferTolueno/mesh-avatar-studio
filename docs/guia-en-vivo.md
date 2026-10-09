# Guía de En vivo (stream con OBS)

Guía de uso de la página **En vivo** de esta versión. Los detalles técnicos y lo que cambió
respecto al original están en [FORK.md](../FORK.md).

## La app de escritorio (recomendada para transmitir)

Haz doble clic en **Mesh Avatar Studio** en el escritorio. Se abre una ventana con En vivo y,
dentro, el servidor que alimenta a OBS: no necesitas `npm run dev` ni Chrome, y usa unos 1.000 MB
menos de RAM. La URL de OBS es la misma (`http://127.0.0.1:5191/stream.html…`).

- Elige tu proyecto en la lista de la cabecera (la próxima vez se abre solo).
- La primera vez Windows pide permiso para la cámara y el micrófono, y los ajustes (calibración
  de vocales, posición, teclas…) se configuran una vez porque la app guarda los suyos.
- Déjala abierta (puede quedar detrás de OBS); si la minimizas el rastreo puede ir más lento.
- Para **editar** el avatar sigue usando `npm run dev` y el Editor en el navegador. Si cambias la
  app, recompílala con `npm run desktop`.

## Antes de empezar (modo navegador)

1. Abre la aplicación (`npm run dev`) y entra al proyecto desde el **Editor** al menos una vez.
2. Pulsa **En vivo** arriba. Deja esta pestaña abierta mientras transmites: es la que mira la
   cámara y escucha el micrófono. El video y el audio no salen de tu equipo; la vista de OBS
   solo recibe los movimientos del avatar.
3. Si la pestaña queda oculta detrás de otras ventanas el navegador puede frenar el rastreo;
   aparecerá un aviso. Mejor tenerla visible en otra pantalla o en una ventana aparte.

## Configurar OBS (una vez)

1. En **Fondo** elige **Transparente** (o verde si prefieres clave de color).
2. Pulsa **Copiar URL de OBS**.
3. En OBS: **Fuente → Navegador**, pega la URL y pon el tamaño **1920 × 1080** (el mismo
   formato elegido en *Posición y tamaño*; 16:9 por defecto).
4. Los cambios que hagas en En vivo (posición, luz, física) se ven en OBS al momento. La URL
   copiada también los guarda, por si reinicias OBS sin la página abierta: si cambias algo
   importante, vuelve a copiarla.

## Cómo está organizada la ventana

- **Arriba:** proyecto, tema e idioma.
- **Sobre el avatar**, la barra de herramientas del directo: **Iniciar cámara**, **Calibrar**,
  **micrófono**, **centrar y ajustar al recuadro** (lo centra y lo hace lo más grande posible
  dentro del recuadro), **bloquear
  posición**, **luz** y **copiar la URL de OBS**. Tu imagen de la cámara
  aparece en una esquina mientras la cámara está encendida.
- **A la derecha**, cinco iconos abren cada uno su panel de ajustes: **Cámara y voz**,
  **Escena** (fondo y OBS, posición y tamaño, accesorios), **Expresión** (expresiones,
  animaciones, gestos), **Movimiento** (movimiento, cara perdida) y **Luz y física**. Solo ese
  panel tiene scroll; el resto de la ventana queda fijo.
- **Abajo**, la barra de estado: si te está rastreando, el nivel del micrófono, los fps y
  **cuántas vistas de OBS están conectadas** (si dice «OBS sin conectar», OBS no está recibiendo).
- Las teclas de expresiones, animaciones y accesorios funcionan con cualquier panel abierto.

## Cada ajuste

### Cámara
- **Iniciar cámara**, mira de frente con la cara relajada y pulsa **Calibrar**. Repite la
  calibración si cambias de silla o de posición.
- **Espejo**: el avatar se mueve como en un espejo.
- **Sensibilidad de cabeza / de boca**, **Suavizado** (más alto = más calmado, con algo de
  retraso) y **Parpadear con los dos ojos a la vez**.

### Boca con el micrófono
- Activa el micrófono para que la boca se mueva con tu voz.
- **Detectar vocales**: la boca toma la forma de la vocal que dices (a, i, u, e, o).
- **Calibrar con tu voz** (muy recomendable con micrófono de portátil): pulsa cada vocal, dila
  sostenida hasta que se marque ✓ y pasa a la siguiente. Se activa con las cinco y se guarda.
  Si una vocal se confunde, vuelve a grabar solo esa.
- **Suavidad del cambio de vocal** y **Fuerza de las vocales** para que la boca cambie más o
  menos brusco y marcado. **Ganancia** si tu voz se oye baja.

### Fondo
- Transparente, verde, azul o un color. **Encuadre**: *Avatar completo* o *Llenar el marco*.
- **Imagen o video de fondo**: pulsa **Subir imagen o video…** y elige un PNG, JPEG, WebP,
  **GIF animado** o un **video MP4 / WebM** corto (se repite en bucle y sin sonido; hasta 60 MB).
  Queda en la lista para volver a elegirlo. **Ajuste**: *Cubrir* (llena el recuadro y recorta
  bordes), *Completo* (se ve entero, con bandas) o *Estirar*. Usa imágenes 16:9 (1920 × 1080).
- Sale también en OBS. Si prefieres montar el fondo en OBS, deja **Ninguno** y fondo
  **Transparente**.

### Expresiones (teclas 1–6)
- Feliz, Sonrojo, Enfado, Triste, Sorpresa y Sueño. Cada tecla activa o quita la suya; se
  pueden combinar. **Esc** quita todas. Las teclas se pueden cambiar en la propia sección.
- Las teclas solo funcionan con la ventana de En vivo al frente (limitación del navegador).

### Animaciones (teclas Q–O)
- Asentir, Negar, Saludar, Reír, Sorprenderse, Ladear cabeza, Pensar, Timidez y Guiño. Se
  reproducen una vez encima de tu movimiento, con o sin cámara.

### Accesorios
- **Añadir imagen…**: elige un PNG con fondo transparente (gafas, gorro, orejeras…). Aparece
  sobre la cabeza; **arrástralo** a su sitio en la vista previa, **rueda** encima para el tamaño
  y **Mayús + rueda** para girarlo.
- **Sigue a**: la cabeza (gafas, gorros), el cuerpo (collares, insignias) o nada (fijo).
  **Capa**: delante o detrás del avatar. También tamaño, giro, voltear y orden.
- Cada accesorio tiene botón y **tecla** para ponértelo o quitártelo en directo.
- Se guardan en la carpeta del proyecto y salen también en OBS.
- Para imágenes: dibújalas en Affinity o pide a ChatGPT "gafas redondas, PNG con fondo
  transparente, vista frontal"; luego colócalas aquí.

### Posición y tamaño
- **Formato del recuadro:** elige la forma de tu avatar en la escena (16:9, 9:16, 4:3, 3:4, 1:1 o
  personalizado) y pon **la fuente de navegador de OBS con el tamaño que indica** (p. ej. 1080 ×
  1080 para 1:1). Un recuadro ajustado al personaje es más fácil de colocar en OBS.
- **Con la app de escritorio, OBS se ajusta solo:** al cambiar el formato, la fuente de tu avatar
  en OBS toma ese tamaño («Ajustar la fuente de OBS a este tamaño»). Necesita OBS abierto y su
  **servidor WebSocket activado** (Herramientas → Ajustes del servidor WebSocket); la app lee la
  contraseña de la configuración de OBS, no tienes que escribirla.
- **Encuadre automático con zona segura:** coloca y escala el avatar solo, con un margen, para
  que no se salga ni se corte aunque te muevas al máximo. La línea discontinua verde de la vista
  previa es la zona segura. Si lo mueves a mano se apaga; **Encajar ahora** lo vuelve a aplicar.
- **Arrastra el avatar** con el ratón para moverlo y usa **la rueda** sobre él para cambiar su
  tamaño (se acerca hacia donde apunta el ratón).
- **Formato**: elige el de tu fuente de OBS (16:9 normalmente). El recuadro punteado es
  exactamente lo que sale en el stream.
- **Bloquear posición** para no moverlo sin querer; **Centrar y tamaño original** para volver.

### Cara perdida
- Qué hace el avatar si sales de cámara: **esperar** antes de reaccionar, **tiempo de vuelta**
  al reposo y **mientras no te ve** (animaciones de espera, quieto respirando, o mantener la
  última postura).
- **Expresión mientras no te ve** (p. ej. Sueño, para "ausente") y **Animación al volver**
  (p. ej. Saludar).

### Movimiento
- **Movimiento en pantalla**: cuánto te sigue el avatar al moverte de lado, arriba, abajo o
  al acercarte. **Movimiento del cuerpo**: inclinación y balanceo.
- **Límites**: tope en cada dirección para que nunca se salga del encuadre.

### Expresión
- Amplía gestos que la cámara capta pequeños: rango arriba/abajo, ojos muy abiertos, cejas,
  ojos sonrientes y rubor al sonreír. **Respiración** y **Parpadeo** (de la cámara, automático
  o ambos).

### Iluminación
- Activa la luz y **arrástrala** sobre la vista previa. Sombreado suave o cel, sombra
  proyectada, color, brillo y luz de borde.

### Física
- **Fuerza**, **Rigidez** y **Viento** del pelo, orejas, cordones, etc. **Al arrastrar**: cuánto
  se balancean al mover el avatar con el ratón. **Por pieza** ajusta cada grupo por separado.

## Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| El avatar mira torcido en reposo | Mira de frente y pulsa **Calibrar**. |
| La boca confunde vocales | **Calibrar con tu voz**, o vuelve a grabar la vocal que falla. |
| Se sale del encuadre al moverte | Baja **Movimiento en pantalla** o los **Límites**. |
| OBS no coincide con la vista previa | Mismo formato en *Posición y tamaño* y en la fuente de OBS. |
| OBS no se mueve | La página En vivo debe seguir abierta y con la cámara iniciada. |
| Se mueve lento o a tirones | Trae la ventana de En vivo al frente; cierra pestañas pesadas. |

Todo lo que ajustas se guarda en este navegador por proyecto.
