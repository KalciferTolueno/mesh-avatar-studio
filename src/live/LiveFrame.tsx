// Fork addition (see FORK.md): place and size the avatar in the frame by dragging and scrolling
// on the Live preview, like VTube Studio, with the same values in a sidebar section. The preview
// takes the OBS canvas shape so what is placed here is what the stream shows.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ObsLink } from './obsLink';
import { ASPECTS, ASPECT_SIZE, CUSTOM_RANGE, DEFAULT_FRAME, FRAME_RANGES, SAFE_RANGE, parseFrame, zoomFrameAt, type FrameAspect, type FrameSettings } from './frame';

const text = {
  es: { obsSync: 'Ajustar la fuente de OBS a este tamaño', obsApply: 'Ajustar en OBS ahora', obsDone: (n: number, w: number, h: number) => n === 0 ? 'OBS está abierto, pero no tiene ninguna fuente con este avatar: añádela con la URL de OBS.' : `OBS: ${n === 1 ? 'fuente ajustada' : `${n} fuentes ajustadas`} a ${w} × ${h}.`, obsWorking: 'Ajustando OBS…', obsDesktop: 'El ajuste automático de OBS funciona con la app de escritorio.', obsReason: (r: string) => r === 'unreachable' ? 'OBS no está abierto.' : r === 'disabled' || r.includes('config') ? 'Activa en OBS: Herramientas → Ajustes del servidor WebSocket.' : 'OBS rechazó la conexión; revisa su servidor WebSocket.',
    title: 'Posición y tamaño', aspect: 'Formato del recuadro (igual que en OBS)', free: 'Ajustar al panel (sin formato)', custom: 'Personalizado', width: 'Ancho', height: 'Alto',
    obsSize: (w: number, h: number) => `Tamaño de la fuente en OBS: ${w} × ${h}`, auto: 'Encuadre automático con zona segura', safe: 'Margen de seguridad', fit: 'Encajar ahora',
    autoHint: 'El avatar se coloca y escala solo para caber en el recuadro con este margen, contando lo que se mueve con la cámara (de lado, arriba, al acercarte). La línea discontinua de la vista previa marca la zona segura. Si lo mueves a mano, el automático se apaga.',
    x: 'Horizontal', y: 'Vertical', scale: 'Tamaño', lock: 'Bloquear posición', reset: 'Centrar y tamaño original',
    hint: 'Arrastra el avatar con el ratón para moverlo y usa la rueda sobre él para cambiar su tamaño. Se guarda y se aplica también en OBS. Pon tu fuente de navegador de OBS con el tamaño indicado arriba.' },
  en: { obsSync: 'Resize the OBS source to this size', obsApply: 'Resize in OBS now', obsDone: (n: number, w: number, h: number) => n === 0 ? 'OBS is open but has no source with this avatar: add it with the OBS link.' : `OBS: ${n === 1 ? 'source resized' : `${n} sources resized`} to ${w} × ${h}.`, obsWorking: 'Resizing in OBS…', obsDesktop: 'Resizing OBS automatically works with the desktop app.', obsReason: (r: string) => r === 'unreachable' ? 'OBS is not open.' : r === 'disabled' || r.includes('config') ? 'In OBS, enable Tools → WebSocket Server Settings.' : 'OBS refused the connection; check its WebSocket server.',
    title: 'Position and size', aspect: 'Box shape (as in OBS)', free: 'Fit the panel (no shape)', custom: 'Custom', width: 'Width', height: 'Height',
    obsSize: (w: number, h: number) => `OBS source size: ${w} × ${h}`, auto: 'Automatic framing with a safe zone', safe: 'Safe margin', fit: 'Fit now',
    autoHint: 'The avatar places and sizes itself to fit the box with this margin, counting how far it moves with the camera. The dashed line on the preview marks the safe zone. Moving it by hand turns automatic framing off.',
    x: 'Horizontal', y: 'Vertical', scale: 'Size', lock: 'Lock position', reset: 'Center and original size',
    hint: 'Drag the avatar to move it and scroll over it to resize it. It is saved and applied in OBS too. Set your OBS browser source to the size shown above.' },
  ja: { obsSync: 'OBS のソースをこのサイズにする', obsApply: '今すぐ OBS に反映', obsDone: (n: number, w: number, h: number) => n === 0 ? 'OBS にこのアバターのソースがありません。' : `OBS: ${w} × ${h} に調整しました。`, obsWorking: 'OBS を調整中…', obsDesktop: 'OBS の自動調整はデスクトップアプリで使えます。', obsReason: (r: string) => r === 'unreachable' ? 'OBS が起動していません。' : 'OBS の WebSocket サーバーを有効にしてください。',
    title: '位置とサイズ', aspect: '枠の画面比 (OBS と同じ)', free: 'パネルに合わせる', custom: 'カスタム', width: '幅', height: '高さ',
    obsSize: (w: number, h: number) => `OBS のソースサイズ: ${w} × ${h}`, auto: 'セーフゾーン付き自動配置', safe: '安全マージン', fit: '今すぐ合わせる',
    autoHint: 'カメラでの動きも含めて、枠に収まるよう自動で配置・拡大縮小します。手で動かすと自動はオフになります。',
    x: '左右', y: '上下', scale: 'サイズ', lock: '位置を固定', reset: '中央・元のサイズに戻す',
    hint: 'アバターをドラッグで移動、ホイールで拡大縮小します。OBS のブラウザソースを上のサイズにしてください。' },
  zh: { obsSync: '把 OBS 来源调整为此尺寸', obsApply: '立即调整 OBS', obsDone: (n: number, w: number, h: number) => n === 0 ? 'OBS 中没有此形象的来源。' : `OBS：已调整为 ${w} × ${h}。`, obsWorking: '正在调整 OBS…', obsDesktop: 'OBS 自动调整需使用桌面应用。', obsReason: (r: string) => r === 'unreachable' ? 'OBS 未打开。' : '请在 OBS 中启用 WebSocket 服务器。',
    title: '位置和大小', aspect: '画框比例（与 OBS 相同）', free: '适应面板', custom: '自定义', width: '宽', height: '高',
    obsSize: (w: number, h: number) => `OBS 来源尺寸：${w} × ${h}`, auto: '带安全区的自动取景', safe: '安全边距', fit: '立即适配',
    autoHint: '形象会自动定位和缩放以适配画框，并计入随摄像头的移动。手动移动后自动取景会关闭。',
    x: '水平', y: '垂直', scale: '大小', lock: '锁定位置', reset: '居中并恢复大小',
    hint: '拖动形象来移动，滚轮缩放。请把 OBS 浏览器来源设为上面的尺寸。' },
};
type Lang = keyof typeof text;
/** The box's OBS source size in px, or null for the free panel shape. */
export function boxSize(value: FrameSettings): [number, number] | null {
  if (value.aspect === 'free') return null;
  return value.aspect === 'custom' ? [value.custom.w, value.custom.h] : ASPECT_SIZE[value.aspect];
}

/** Accessories under the pointer take the drag and the wheel instead of the avatar (src/live/LiveItems.tsx). */
export interface FrameItemHandler {
  at(x: number, y: number): string | null;
  move(id: string, from: [number, number], to: [number, number]): void;
  scale(id: string, factor: number): void;
  rotate(id: string, degrees: number): void;
}
/** Sizes the preview canvas to the chosen shape and lets the avatar be dragged and scrolled. */
export function useFrameCanvas(canvas: RefObject<HTMLCanvasElement | null>, value: FrameSettings, onChange: (value: FrameSettings) => void, items?: FrameItemHandler) {
  const latest = useRef({ value, onChange, items }); latest.current = { value, onChange, items };
  useLayoutEffect(() => {
    const element = canvas.current, box = element?.parentElement;
    if (!element || !box) return;
    const fit = () => {
      const size = boxSize(value);
      if (!size) { element.style.width = ''; element.style.height = ''; return; }
      const ratio = size[0] / size[1], width = Math.min(box.clientWidth, box.clientHeight * ratio);
      element.style.width = `${Math.floor(width)}px`; element.style.height = `${Math.floor(width / ratio)}px`;
    };
    const observer = new ResizeObserver(fit); observer.observe(box); fit();
    return () => { observer.disconnect(); element.style.width = ''; element.style.height = ''; };
  }, [canvas, value.aspect, value.custom.w, value.custom.h]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let drag: { id: number; x: number; y: number; item: string | null } | null = null;
    const local = (event: MouseEvent): [number, number] => { const b = element.getBoundingClientRect(); return [event.clientX - b.left, event.clientY - b.top]; };
    const change = (frame: FrameSettings['frame']) => latest.current.onChange({ ...latest.current.value, frame, auto: false });
    const down = (event: PointerEvent) => {
      if (latest.current.value.locked || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, item: latest.current.items?.at(...local(event)) ?? null };
      element.setPointerCapture(event.pointerId); element.dataset.dragging = 'true';
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      const bounds = element.getBoundingClientRect(), frame = latest.current.value.frame;
      if (drag.item) {
        latest.current.items?.move(drag.item, [drag.x - bounds.left, drag.y - bounds.top], local(event));
        drag.x = event.clientX; drag.y = event.clientY;
        return;
      }
      const next = parseFrame({ ...frame, x: frame.x + (event.clientX - drag.x) / bounds.width, y: frame.y + (event.clientY - drag.y) / bounds.height });
      drag.x = event.clientX; drag.y = event.clientY;
      if (next) change(next);
    };
    const up = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null; delete element.dataset.dragging;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    };
    const wheel = (event: WheelEvent) => {
      if (latest.current.value.locked) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const steps = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
      const item = latest.current.items?.at(...local(event));
      if (item) {
        if (event.shiftKey) latest.current.items!.rotate(item, (steps || event.deltaX) * 0.05);
        else latest.current.items!.scale(item, Math.exp(-steps * 0.001));
        return;
      }
      change(zoomFrameAt(latest.current.value.frame, Math.exp(-steps * 0.001),
        (event.clientX - bounds.left) / bounds.width - 0.5, (event.clientY - bounds.top) / bounds.height - 0.5));
    };
    element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
    };
  }, [canvas]);
}

export function LiveFrame({ value, onChange, onFit, obs, onObsApply, language }: { value: FrameSettings; onChange: (value: FrameSettings) => void; onFit: () => void; obs: ObsLink; onObsApply: () => void; language: Lang }) {
  const t = text[language], frame = value.frame, size = boxSize(value);
  const slider = (key: 'x' | 'y' | 'scale', show: (n: number) => string) => <label className="lighting-slider" key={key}>{t[key]}
    <input aria-label={t[key]} type="range" min={FRAME_RANGES[key][0]} max={FRAME_RANGES[key][1]} step={key === 'scale' ? 0.01 : 0.005} value={frame[key]} disabled={value.locked}
      onChange={event => onChange({ ...value, auto: false, frame: parseFrame({ ...frame, [key]: Number(event.target.value) }) ?? frame })} />
    <output>{show(frame[key])}</output></label>;
  const custom = (key: 'w' | 'h', label: string) => <label className="frame-size-field" key={key}>{label}
    <input type="number" inputMode="numeric" min={CUSTOM_RANGE[0]} max={CUSTOM_RANGE[1]} step={10} value={value.custom[key]} aria-label={label}
      onChange={event => { const n = Number(event.target.value); if (Number.isFinite(n) && n >= CUSTOM_RANGE[0] && n <= CUSTOM_RANGE[1]) onChange({ ...value, custom: { ...value.custom, [key]: Math.round(n) } }); }} /></label>;
  const moved = frame.x !== 0 || frame.y !== 0 || frame.scale !== 1;
  return <details className="live-lighting live-frame" data-testid="frame-section">
    <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="10" r="2.5" /><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" /></svg>{t.title}{(moved || value.auto) && <span className="lighting-on">{value.auto ? 'AUTO' : `${Math.round(frame.scale * 100)} %`}</span>}</summary>
    <div className="lighting-controls">
      <label>{t.aspect}<select aria-label={t.aspect} value={value.aspect} onChange={event => onChange({ ...value, aspect: event.target.value as FrameAspect })}>
        {ASPECTS.map(aspect => <option key={aspect} value={aspect}>{aspect === 'free' ? t.free : aspect === 'custom' ? t.custom : aspect}</option>)}</select></label>
      {value.aspect === 'custom' && <div className="frame-size">{custom('w', t.width)}<span aria-hidden="true">×</span>{custom('h', t.height)}</div>}
      {size && <p className="frame-obs-size">{t.obsSize(size[0], size[1])}</p>}
      {size && <>
        <label className="lighting-check"><input type="checkbox" checked={value.obs} onChange={event => onChange({ ...value, obs: event.target.checked })} />{t.obsSync}</label>
        <p className="frame-obs-state" role="status" data-state={obs.state}>{obs.state === 'working' ? t.obsWorking : obs.state === 'done' ? t.obsDone(obs.sources, obs.width, obs.height)
          : obs.state === 'unavailable' ? t.obsReason(obs.reason) : obs.state === 'desktop-only' ? t.obsDesktop : ''}</p>
        {!value.obs && <button type="button" onClick={onObsApply}>{t.obsApply}</button>}
      </>}
      <label className="lighting-check"><input type="checkbox" checked={value.auto} onChange={event => onChange({ ...value, auto: event.target.checked })} />{t.auto}</label>
      <label className="lighting-slider">{t.safe}
        <input aria-label={t.safe} type="range" min={SAFE_RANGE[0]} max={SAFE_RANGE[1]} step={0.01} value={value.safe} disabled={!value.auto} onChange={event => onChange({ ...value, safe: Number(event.target.value) })} />
        <output>{Math.round(value.safe * 100)} %</output></label>
      <button type="button" onClick={onFit}>{t.fit}</button>
      <p className="lighting-hint">{t.autoHint}</p>
      {slider('x', n => `${Math.round(n * 100)} %`)}
      {slider('y', n => `${Math.round(n * 100)} %`)}
      {slider('scale', n => `${Math.round(n * 100)} %`)}
      <label className="lighting-check"><input type="checkbox" checked={value.locked} onChange={event => onChange({ ...value, locked: event.target.checked })} />{t.lock}</label>
      <button type="button" disabled={!moved} onClick={() => onChange({ ...value, auto: false, frame: { ...DEFAULT_FRAME } })}>{t.reset}</button>
      <p className="lighting-hint">{t.hint}</p>
    </div>
  </details>;
}

/** The safe zone drawn over the preview canvas: margins on the top and the sides (a drawing cut
 * at the bottom sits on the bottom edge). */
export function SafeZoneGuide({ canvas, safe, visible }: { canvas: RefObject<HTMLCanvasElement | null>; safe: number; visible: boolean }) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element || !visible) return;
    const update = () => setBox({ left: element.offsetLeft, top: element.offsetTop, width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(update); observer.observe(element); if (element.parentElement) observer.observe(element.parentElement); update();
    return () => observer.disconnect();
  }, [canvas, visible]);
  if (!visible || !box || safe <= 0) return null;
  return <div className="safe-zone" aria-hidden="true" style={{ left: box.left + box.width * safe, top: box.top + box.height * safe, width: box.width * (1 - 2 * safe), height: box.height * (1 - safe) }} />;
}
