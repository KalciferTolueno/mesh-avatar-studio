// Fork addition (see FORK.md): what the avatar does when the camera loses the face, like VTube
// Studio's face-lost settings and its "tracking lost / found" hotkey triggers.
import { expressionText } from '../expressions/LiveExpressions';
import { EXPRESSIONS } from '../expressions/presets';
import { ANIMATIONS } from '../expressions/animations';
import type { TrackingOptions } from './tracking';

export const LOST_DEFAULTS = { lostDelay: 0.5, lostReturn: 0.6, lostMode: 'idle' as const, lostExpression: '', foundAnimation: '' };
const text = {
  es: { title: 'Cara perdida', delay: 'Esperar antes de reaccionar', back: 'Tiempo de vuelta al reposo', mode: 'Mientras no te ve', idle: 'Animaciones de espera', rest: 'Quieto (respira y parpadea)', hold: 'Mantener la última postura',
    expression: 'Expresión mientras no te ve', animation: 'Animación al volver', none: 'Ninguna', reset: 'Restablecer', hint: 'Si sales de cámara o algo te tapa la cara: tras la espera, el avatar vuelve al reposo en el tiempo indicado y hace lo elegido. Al volver a verte retoma tu movimiento (y reproduce la animación elegida).' },
  en: { title: 'Face lost', delay: 'Wait before reacting', back: 'Time to return to rest', mode: 'While it cannot see you', idle: 'Idle animations', rest: 'Still (breathes and blinks)', hold: 'Hold the last pose',
    expression: 'Expression while lost', animation: 'Animation when back', none: 'None', reset: 'Reset', hint: 'When you leave the camera or something covers your face: after the wait, the avatar returns to rest over the given time and does what is chosen. When it sees you again it follows you (and plays the chosen animation).' },
  ja: { title: '顔を見失ったとき', delay: '反応までの待ち時間', back: '待機姿勢に戻る時間', mode: '見失っている間', idle: '待機モーション', rest: '静止 (呼吸とまばたき)', hold: '最後の姿勢を保つ',
    expression: '見失っている間の表情', animation: '戻ったときのモーション', none: 'なし', reset: 'リセット', hint: 'カメラから外れたとき、待ち時間のあと待機姿勢に戻り、選んだ動作をします。再び顔が見えると追従を再開します。' },
  zh: { title: '丢失面部时', delay: '反应前等待', back: '回到静止的时间', mode: '看不到你时', idle: '待机动作', rest: '静止（呼吸和眨眼）', hold: '保持最后的姿势',
    expression: '丢失时的表情', animation: '回来时的动作', none: '无', reset: '重置', hint: '离开镜头或脸被遮住时：等待之后，形象在设定时间内回到静止并执行所选行为。再次看到你时恢复跟随（并播放所选动作）。' },
};
type Lang = keyof typeof text;

export function LiveLost({ options, onChange, language }: { options: TrackingOptions; onChange: (patch: Partial<TrackingOptions>) => void; language: Lang }) {
  const t = text[language], names = expressionText[language] as Record<string, string>;
  const seconds = (key: 'lostDelay' | 'lostReturn', label: string, min: number, max: number) => <label className="lighting-slider" key={key}>{label}
    <input aria-label={label} type="range" min={min} max={max} step="0.1" value={options[key] ?? LOST_DEFAULTS[key]} onChange={event => onChange({ [key]: Number(event.target.value) })} />
    <output>{(options[key] ?? LOST_DEFAULTS[key]).toFixed(1)} s</output></label>;
  return <details className="live-lighting live-lost" data-testid="lost-section">
    <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="4" /><path d="M5 20c1.2-3.2 3.8-5 7-5 1.3 0 2.5.3 3.5.8" /><path d="M17 16l4 4M21 16l-4 4" /></svg>{t.title}</summary>
    <div className="lighting-controls">
      {seconds('lostDelay', t.delay, 0.1, 5)}
      {seconds('lostReturn', t.back, 0.2, 3)}
      <label>{t.mode}<select aria-label={t.mode} value={options.lostMode ?? 'idle'} onChange={event => onChange({ lostMode: event.target.value as 'idle' | 'rest' | 'hold' })}>
        <option value="idle">{t.idle}</option><option value="rest">{t.rest}</option><option value="hold">{t.hold}</option></select></label>
      <label>{t.expression}<select aria-label={t.expression} value={options.lostExpression ?? ''} onChange={event => onChange({ lostExpression: event.target.value })}>
        <option value="">{t.none}</option>{EXPRESSIONS.map(e => <option key={e.id} value={e.id}>{names[e.id]}</option>)}</select></label>
      <label>{t.animation}<select aria-label={t.animation} value={options.foundAnimation ?? ''} onChange={event => onChange({ foundAnimation: event.target.value })}>
        <option value="">{t.none}</option>{ANIMATIONS.map(a => <option key={a.id} value={a.id}>{names[a.id]}</option>)}</select></label>
      <button type="button" onClick={() => onChange({ ...LOST_DEFAULTS })}>{t.reset}</button>
      <p className="lighting-hint">{t.hint}</p>
    </div>
  </details>;
}
