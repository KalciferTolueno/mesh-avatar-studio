// Fork addition (see FORK.md 29): the Live page as a desktop app. A rail of five groups opens
// one settings panel at a time, the stream controls sit on a toolbar over the avatar, and a
// status bar shows tracking, the microphone level, frame rate and the connected OBS views.
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useStreamViews } from './streamViews';
import './shell.css';

export const SHELL_GROUPS = ['capture', 'scene', 'expression', 'motion', 'light'] as const;
export type ShellGroup = typeof SHELL_GROUPS[number];

export const shellText = {
  es: { capture: 'Cámara y voz', scene: 'Escena', expression: 'Expresión', motion: 'Movimiento', light: 'Luz y física', groups: 'Ajustes',
    lock: 'Bloquear posición', light_: 'Iluminación', copy: 'Copiar URL de OBS', copied: 'URL de OBS copiada', copyError: 'No se pudo copiar la URL',
    hint: 'Arrastra para mover · rueda para escalar', mic: 'Nivel del micrófono', fps: 'fps',
    obs: (n: number) => n === 0 ? 'OBS sin conectar' : n === 1 ? 'OBS: 1 vista conectada' : `OBS: ${n} vistas conectadas`, tools: 'Herramientas del directo' },
  en: { capture: 'Camera and voice', scene: 'Scene', expression: 'Expression', motion: 'Movement', light: 'Light and physics', groups: 'Settings',
    lock: 'Lock position', light_: 'Lighting', copy: 'Copy OBS link', copied: 'OBS link copied', copyError: 'Could not copy the link',
    hint: 'Drag to move · scroll to resize', mic: 'Microphone level', fps: 'fps',
    obs: (n: number) => n === 0 ? 'OBS not connected' : n === 1 ? 'OBS: 1 view connected' : `OBS: ${n} views connected`, tools: 'Stream tools' },
  ja: { capture: 'カメラと声', scene: 'シーン', expression: '表情', motion: '動き', light: 'ライトと物理', groups: '設定',
    lock: '位置を固定', light_: 'ライティング', copy: 'OBS の URL をコピー', copied: 'OBS の URL をコピーしました', copyError: 'URL をコピーできませんでした',
    hint: 'ドラッグで移動・ホイールで拡大縮小', mic: 'マイクの音量', fps: 'fps',
    obs: (n: number) => n === 0 ? 'OBS 未接続' : `OBS: ${n} 画面接続中`, tools: '配信ツール' },
  zh: { capture: '摄像头和声音', scene: '场景', expression: '表情', motion: '动作', light: '光照和物理', groups: '设置',
    lock: '锁定位置', light_: '光照', copy: '复制 OBS 链接', copied: '已复制 OBS 链接', copyError: '无法复制链接',
    hint: '拖动移动 · 滚轮缩放', mic: '麦克风音量', fps: 'fps',
    obs: (n: number) => n === 0 ? 'OBS 未连接' : `OBS：已连接 ${n} 个画面`, tools: '直播工具' },
};
type Lang = keyof typeof shellText;

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const shellIcons: Record<ShellGroup | 'lock' | 'unlock' | 'light' | 'copy' | 'mic' | 'camera', ReactNode> = {
  capture: <svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="6" width="13" height="12" /><path d="M16 10l5-3v10l-5-3" /></svg>,
  scene: <svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="18" height="16" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.5" /></svg>,
  expression: <svg viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2M9 9.5h.01M15 9.5h.01" /></svg>,
  motion: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>,
  light: <svg viewBox="0 0 24 24" {...stroke}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></svg>,
  lock: <svg viewBox="0 0 24 24" {...stroke}><rect x="5" y="11" width="14" height="10" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  unlock: <svg viewBox="0 0 24 24" {...stroke}><rect x="5" y="11" width="14" height="10" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>,
  copy: <svg viewBox="0 0 24 24" {...stroke}><rect x="8" y="8" width="13" height="13" /><path d="M16 8V3H3v13h5" /></svg>,
  mic: <svg viewBox="0 0 24 24" {...stroke}><rect x="9" y="3" width="6" height="11" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  camera: <svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="6" width="13" height="12" /><path d="M16 10l5-3v10l-5-3" /></svg>,
};

const GROUP_KEY = 'mesh-avatar:live-group';
/** The open settings group, remembered in this browser. */
export function useShellGroup() {
  const [group, setGroup] = useState<ShellGroup>(() => {
    try { const saved = localStorage.getItem(GROUP_KEY) as ShellGroup; return SHELL_GROUPS.includes(saved) ? saved : 'capture'; } catch { return 'capture'; }
  });
  useEffect(() => { try { localStorage.setItem(GROUP_KEY, group); } catch { /* optional */ } }, [group]);
  return [group, setGroup] as const;
}

export function ShellRail({ group, onChange, language }: { group: ShellGroup; onChange: (group: ShellGroup) => void; language: Lang }) {
  const t = shellText[language];
  return <nav className="app-rail" aria-label={t.groups}>
    {SHELL_GROUPS.map(id => <button key={id} type="button" className="app-rail-item" aria-pressed={group === id} aria-label={t[id]} title={t[id]} onClick={() => onChange(id)}>
      {shellIcons[id]}<span className="app-rail-label">{t[id]}</span></button>)}
  </nav>;
}

/** Microphone level, frame rate and OBS views, refreshed a few times a second. */
export function StatusMeters({ micLevel, fps, micOn, project, language }: {
  micLevel: MutableRefObject<number>; fps: MutableRefObject<number>; micOn: boolean; project: string; language: Lang;
}) {
  const t = shellText[language], views = useStreamViews(project);
  const [values, setValues] = useState({ level: 0, fps: 0 });
  useEffect(() => {
    const timer = setInterval(() => setValues({ level: micLevel.current, fps: fps.current }), 150);
    return () => clearInterval(timer);
  }, [micLevel, fps]);
  return <>
    <span className="app-meter" title={t.mic} data-on={micOn}>{shellIcons.mic}
      <span className="app-meter-track" role="meter" aria-label={t.mic} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(values.level * 100)}>
        <span style={{ transform: `scaleX(${micOn ? Math.min(1, values.level) : 0})` }} /></span></span>
    <span className="app-num">{Math.round(values.fps)} {t.fps}</span>
    <span className="app-obs" data-connected={views > 0}>{t.obs(views)}</span>
  </>;
}

/** Counts drawn frames per second (call once per frame). */
export function useFpsCounter() {
  const fps = useRef(0), state = useRef({ frames: 0, since: performance.now() });
  const tick = () => {
    const now = performance.now(), s = state.current;
    s.frames++;
    if (now - s.since >= 1000) { fps.current = s.frames * 1000 / (now - s.since); s.frames = 0; s.since = now; }
  };
  return [fps, tick] as const;
}
