// Spanish Live page text (fork addition, see FORK.md).
import type { liveEn } from './i18n';

export const liveEs: typeof liveEn = {
  title: 'En vivo', back: 'Volver al editor', camera: 'Cámara', device: 'Dispositivo', defaultDevice: 'Dispositivo predeterminado',
  start: 'Iniciar cámara', stop: 'Detener cámara', calibrate: 'Calibrar', calibrated: 'Pose neutra guardada',
  calibrateHint: 'Mira de frente a la cámara con los ojos relajados y la boca cerrada, y luego calibra.',
  mirror: 'Espejo', sensitivity: 'Sensibilidad de cabeza', mouthSensitivity: 'Sensibilidad de boca', bodySensitivity: 'Movimiento del cuerpo', screenMove: 'Movimiento en pantalla', movement: 'Movimiento', resetMovement: 'Restablecer movimiento', movementHint: 'Movimiento en pantalla: cuánto te sigue el avatar de lado, arriba, abajo y al acercarte. Movimiento del cuerpo: inclinación y balanceo. Los límites ponen un tope a cada dirección para que no se salga del encuadre.', limits: 'Límites', limitSide: 'Lateral', limitUp: 'Arriba', limitDown: 'Abajo', limitIn: 'Acercar', limitOut: 'Alejar', limitLeanForward: 'Inclinar adelante', limitLeanBack: 'Inclinar atrás', linkEyes: 'Parpadear con los dos ojos a la vez', smoothing: 'Suavizado', cameraPreview: 'Mostrar la cámara',
  microphone: 'Boca con el micrófono', gain: 'Ganancia del micrófono', privacy: 'El video de la cámara y el audio del micrófono no salen de este equipo. La vista de stream solo recibe los valores de movimiento del avatar.',
  background: 'Fondo', transparent: 'Transparente', green: 'Verde', blue: 'Azul', custom: 'Color personalizado',
  fit: 'Encuadre', contain: 'Avatar completo', cover: 'Llenar el marco', obs: 'Copiar URL de OBS', openStream: 'Abrir la vista de stream en otra pestaña', copied: 'URL copiada', copyError: 'No se pudo copiar. Selecciona y copia la URL de abajo.',
  obsHelp: 'Deja esta página abierta. Añade la URL en OBS como fuente de navegador, por ejemplo a 1080 × 1080.',
  loading: 'Cargando avatar…', ready: 'Avatar listo', projectError: 'No se pudo cargar este proyecto. Ábrelo primero en el editor desde la lista local.',
  stopped: 'Cámara detenida', starting: 'Iniciando cámara…', running: 'Cámara lista', tracking: 'Rastreando la cara', lost: 'Cara perdida · volviendo al reposo',
  backgroundStopped: 'El rastreo se detuvo mientras esta página está oculta. Trae esta ventana al frente.',
  backgroundSlow: 'El rastreo va lento mientras esta página está oculta. Trae esta ventana al frente.',
  cameraBlocked: 'Se bloqueó el acceso a la cámara. Permítelo en el navegador e inténtalo de nuevo.',
  cameraUnavailable: 'Cámara no disponible. Revisa el dispositivo y si otra aplicación la está usando.',
  modelError: 'No se pudo iniciar el rastreo facial. Revisa los archivos del modelo local y que WebGL funcione, e inténtalo de nuevo.',
  micOff: 'Micrófono apagado', micStarting: 'Iniciando micrófono…', micOn: 'Micrófono encendido',
  micBlocked: 'Se bloqueó el acceso al micrófono. Permítelo en el navegador e inténtalo de nuevo.', micUnavailable: 'Micrófono no disponible. Revisa el dispositivo elegido.',
  liveUnavailable: 'Abre este proyecto desde la lista de proyectos locales antes de usar En vivo.',
};
