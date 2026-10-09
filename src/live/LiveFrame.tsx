// Fork addition (see FORK.md): place and size the avatar in the frame by dragging and scrolling
// on the Live preview, like VTube Studio, with the same values in a sidebar section. The preview
// takes the OBS canvas shape so what is placed here is what the stream shows.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { ASPECTS, DEFAULT_FRAME, FRAME_RANGES, parseFrame, zoomFrameAt, type FrameAspect, type FrameSettings } from './frame';

const text = {
  es: { title: 'Posición y tamaño', aspect: 'Formato (igual que en OBS)', free: 'Libre (todo el panel)', x: 'Horizontal', y: 'Vertical', scale: 'Tamaño', lock: 'Bloquear posición', reset: 'Centrar y tamaño original',
    hint: 'Arrastra el avatar con el ratón para moverlo y usa la rueda sobre él para cambiar su tamaño. Se guarda y se aplica también en OBS (la vista abierta se actualiza sola; la URL copiada lo incluye). Elige el mismo formato que tu fuente de navegador en OBS, normalmente 16:9 (1920 × 1080).' },
  en: { title: 'Position and size', aspect: 'Shape (as in OBS)', free: 'Free (whole panel)', x: 'Horizontal', y: 'Vertical', scale: 'Size', lock: 'Lock position', reset: 'Center and original size',
    hint: 'Drag the avatar to move it and scroll over it to resize it. It is saved and applied in OBS too (an open stream view updates by itself; the copied URL includes it). Pick the same shape as your OBS browser source, usually 16:9 (1920 × 1080).' },
  ja: { title: '位置とサイズ', aspect: '画面比 (OBS と同じ)', free: '自由 (パネル全体)', x: '左右', y: '上下', scale: 'サイズ', lock: '位置を固定', reset: '中央・元のサイズに戻す',
    hint: 'アバターをドラッグで移動、ホイールで拡大縮小します。保存され OBS にも反映されます。OBS のブラウザソースと同じ画面比を選んでください (通常 16:9)。' },
  zh: { title: '位置和大小', aspect: '画面比例（与 OBS 相同）', free: '自由（整个面板）', x: '水平', y: '垂直', scale: '大小', lock: '锁定位置', reset: '居中并恢复大小',
    hint: '拖动形象来移动，在其上滚动滚轮来缩放。会保存并同步到 OBS。请选择与 OBS 浏览器源相同的比例（通常为 16:9）。' },
};
type Lang = keyof typeof text;
const RATIO: Record<Exclude<FrameAspect, 'free'>, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '4:3': 4 / 3, '1:1': 1 };

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
      if (value.aspect === 'free') { element.style.width = ''; element.style.height = ''; return; }
      const ratio = RATIO[value.aspect], width = Math.min(box.clientWidth, box.clientHeight * ratio);
      element.style.width = `${Math.floor(width)}px`; element.style.height = `${Math.floor(width / ratio)}px`;
    };
    const observer = new ResizeObserver(fit); observer.observe(box); fit();
    return () => { observer.disconnect(); element.style.width = ''; element.style.height = ''; };
  }, [canvas, value.aspect]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let drag: { id: number; x: number; y: number; item: string | null } | null = null;
    const local = (event: MouseEvent): [number, number] => { const b = element.getBoundingClientRect(); return [event.clientX - b.left, event.clientY - b.top]; };
    const change = (frame: FrameSettings['frame']) => latest.current.onChange({ ...latest.current.value, frame });
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

export function LiveFrame({ value, onChange, language }: { value: FrameSettings; onChange: (value: FrameSettings) => void; language: Lang }) {
  const t = text[language], frame = value.frame;
  const slider = (key: 'x' | 'y' | 'scale', show: (n: number) => string) => <label className="lighting-slider" key={key}>{t[key]}
    <input aria-label={t[key]} type="range" min={FRAME_RANGES[key][0]} max={FRAME_RANGES[key][1]} step={key === 'scale' ? 0.01 : 0.005} value={frame[key]} disabled={value.locked}
      onChange={event => onChange({ ...value, frame: parseFrame({ ...frame, [key]: Number(event.target.value) }) ?? frame })} />
    <output>{show(frame[key])}</output></label>;
  const moved = frame.x !== 0 || frame.y !== 0 || frame.scale !== 1;
  return <details className="live-lighting live-frame" data-testid="frame-section" open>
    <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="10" r="2.5" /><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" /></svg>{t.title}{moved && <span className="lighting-on">{Math.round(frame.scale * 100)} %</span>}</summary>
    <div className="lighting-controls">
      <label>{t.aspect}<select aria-label={t.aspect} value={value.aspect} onChange={event => onChange({ ...value, aspect: event.target.value as FrameAspect })}>
        {ASPECTS.map(aspect => <option key={aspect} value={aspect}>{aspect === 'free' ? t.free : aspect}</option>)}</select></label>
      {slider('x', n => `${Math.round(n * 100)} %`)}
      {slider('y', n => `${Math.round(n * 100)} %`)}
      {slider('scale', n => `${Math.round(n * 100)} %`)}
      <label className="lighting-check"><input type="checkbox" checked={value.locked} onChange={event => onChange({ ...value, locked: event.target.checked })} />{t.lock}</label>
      <button type="button" disabled={!moved} onClick={() => onChange({ ...value, frame: { ...DEFAULT_FRAME } })}>{t.reset}</button>
      <p className="lighting-hint">{t.hint}</p>
    </div>
  </details>;
}
