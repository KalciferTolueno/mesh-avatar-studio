// Fork addition (see FORK.md): physics panel for the Live page's right-hand tools.
import { DEFAULT_PHYSICS, PHYSICS_RANGES, type PhysicsTuning } from './settings';

export const physicsText = {
  es: { title: 'Física', strength: 'Fuerza', stiffness: 'Rigidez', wind: 'Viento', drag: 'Al arrastrar', groups: 'Por pieza', none: 'Este avatar no tiene grupos de física; la fuerza también ajusta los mechones.', reset: 'Restablecer física', hint: 'Fuerza: cuánto se balancean las piezas. Rigidez: más alta, oscilan más rápido y cortas. Viento: vaivén en reposo. Al arrastrar: cuánto se balancean al mover el avatar con el ratón.' },
  en: { title: 'Physics', strength: 'Strength', stiffness: 'Stiffness', wind: 'Wind', drag: 'When dragged', groups: 'Per piece', none: 'This avatar has no physics groups; strength also scales the hair strands.', reset: 'Reset physics', hint: 'Strength: how far pieces swing. Stiffness: higher swings faster and shorter. Wind: sway at rest. When dragged: swing when you move the avatar with the mouse.' },
  ja: { title: '物理演算', strength: '強さ', stiffness: '硬さ', wind: '風', drag: 'ドラッグ時', groups: 'パーツごと', none: 'このアバターには物理グループがありません。強さは髪の揺れにも効きます。', reset: '物理演算をリセット', hint: '強さ: 揺れの大きさ。硬さ: 高いほど速く小さく揺れます。風: 静止時の揺れ。ドラッグ時: アバターを動かしたときの揺れ。' },
  zh: { title: '物理', strength: '强度', stiffness: '硬度', wind: '风', drag: '拖动时', groups: '按部件', none: '此形象没有物理组；强度也会影响发丝摆动。', reset: '重置物理', hint: '强度：摆动幅度。硬度：越高摆动越快越短。风：静止时的摆动。拖动时：拖动形象时的摆动。' },
};
type Props = { value: PhysicsTuning; onChange: (value: PhysicsTuning) => void; groups: string[]; language: keyof typeof physicsText };

export function PhysicsControls({ value, onChange, groups, language }: Props) {
  const t = physicsText[language];
  const slider = (label: string, current: number, range: readonly [number, number], set: (n: number) => void) =>
    <label className="lighting-slider physics-slider" key={label}>{label}
      <input aria-label={label} type="range" min={range[0]} max={range[1]} step="0.05" value={current} onChange={e => set(Number(e.target.value))} />
      <output>{current.toFixed(2)}</output></label>;
  const groupValue = (i: number) => value.groups[i] ?? 1;
  const setGroup = (i: number, n: number) => {
    const next = groups.map((_, k) => groupValue(k));
    next[i] = n;
    onChange({ ...value, groups: next });
  };
  return <div className="lighting-controls physics-controls">
    {slider(t.strength, value.strength, PHYSICS_RANGES.strength, n => onChange({ ...value, strength: n }))}
    {slider(t.stiffness, value.stiffness, PHYSICS_RANGES.stiffness, n => onChange({ ...value, stiffness: n }))}
    {slider(t.wind, value.wind, PHYSICS_RANGES.wind, n => onChange({ ...value, wind: n }))}
    {slider(t.drag, value.drag, PHYSICS_RANGES.drag, n => onChange({ ...value, drag: n }))}
    {groups.length ? <fieldset><legend>{t.groups}</legend>
      {groups.map((name, i) => slider(name, groupValue(i), PHYSICS_RANGES.group, n => setGroup(i, n)))}
    </fieldset> : <p className="lighting-hint">{t.none}</p>}
    <button type="button" onClick={() => onChange({ ...DEFAULT_PHYSICS, groups: [] })}>{t.reset}</button>
    <p className="lighting-hint">{t.hint}</p>
  </div>;
}
