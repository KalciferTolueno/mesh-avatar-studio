// Fork addition (see FORK.md): the Live page's expression toggles and animation keys.
import { useEffect, useState, type MutableRefObject } from 'react';
import { HotkeyPanel } from './HotkeyPanel';
import { ANIMATIONS, type AnimationId, type AnimationPlayer } from './animations';
import { EXPRESSIONS, type ExpressionMixer } from './presets';

const text = {
  es: { title: 'Expresiones', happy: 'Feliz', blush: 'Sonrojo', angry: 'Enfado', sad: 'Triste', surprised: 'Sorpresa', sleepy: 'Sueño', off: 'Quitar todas', hint: 'Pulsa la tecla (o el botón) para activar o quitar cada expresión; se pueden combinar. Las teclas funcionan con esta ventana en primer plano: un navegador no puede leer teclas mientras usas otra aplicación. Esc quita todas.',
    animations: 'Animaciones', nod: 'Asentir', no: 'Negar', greet: 'Saludar', giggle: 'Reír', surprise: 'Sorprenderse', tilt: 'Ladear cabeza', think: 'Pensar', shy: 'Timidez', wink: 'Guiño', animHint: 'Cada tecla reproduce una animación corta sobre tu movimiento, con cámara o sin ella. Pulsarla otra vez la reinicia.' },
  en: { title: 'Expressions', happy: 'Happy', blush: 'Blush', angry: 'Angry', sad: 'Sad', surprised: 'Surprised', sleepy: 'Sleepy', off: 'Clear all', hint: 'Press the key (or the button) to toggle each expression; they can be combined. Keys work while this window is in front: a browser cannot read keys while another app is focused. Esc clears all.',
    animations: 'Animations', nod: 'Nod', no: 'Shake head', greet: 'Greet', giggle: 'Chuckle', surprise: 'Startle', tilt: 'Head tilt', think: 'Think', shy: 'Shy', wink: 'Wink', animHint: 'Each key plays a short animation on top of your movement, with or without the camera. Pressing it again restarts it.' },
  ja: { title: '表情差分', happy: '笑顔', blush: '照れ', angry: '怒り', sad: '悲しみ', surprised: '驚き', sleepy: '眠い', off: 'すべて解除', hint: 'キーまたはボタンで各表情を切り替えます。重ねて使えます。キーはこのウィンドウが前面のときに有効です。Esc ですべて解除。',
    animations: 'モーション', nod: 'うなずく', no: '首を振る', greet: 'あいさつ', giggle: '笑う', surprise: 'びっくり', tilt: '首をかしげる', think: '考える', shy: '照れる', wink: 'ウインク', animHint: 'キーを押すと短いモーションを動きの上に再生します。' },
  zh: { title: '表情', happy: '开心', blush: '脸红', angry: '生气', sad: '难过', surprised: '惊讶', sleepy: '困', off: '全部取消', hint: '按键或按钮切换各表情，可叠加。按键仅在此窗口位于前台时有效。Esc 全部取消。',
    animations: '动作', nod: '点头', no: '摇头', greet: '打招呼', giggle: '笑', surprise: '吓一跳', tilt: '歪头', think: '思考', shy: '害羞', wink: '眨眼', animHint: '每个按键在你的动作之上播放一段短动作。' },
};
type Lang = keyof typeof text;

export function LiveExpressions({ mixer, language }: { mixer: MutableRefObject<ExpressionMixer>; language: Lang }) {
  const t = text[language];
  const [active, setActive] = useState<string[]>([]);
  const sync = () => setActive([...mixer.current.active]);
  const clear = () => { mixer.current.clear(); sync(); };
  return <HotkeyPanel testId="expressions-section" title={t.title} hint={t.hint} language={language} storageKey="mesh-avatar-expression-keys"
    icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2" /><path d="M9 9.5h.01M15 9.5h.01" /></svg>}
    items={EXPRESSIONS.map(e => ({ id: e.id, key: e.key, label: t[e.id as keyof typeof t] }))}
    pressed={id => active.includes(id)} onTrigger={id => { mixer.current.toggle(id); sync(); }} onEscape={clear}
    badge={active.length > 0 && <span className="lighting-on">{active.length}</span>}
    footer={<button type="button" onClick={clear}>{t.off}</button>} />;
}

export function LiveAnimations({ player, language }: { player: MutableRefObject<AnimationPlayer>; language: Lang }) {
  const t = text[language];
  const [current, setCurrent] = useState<string | null>(null);
  // the highlight follows the animation until it ends
  useEffect(() => {
    if (!current) return;
    const timer = setInterval(() => { const now = player.current.current(); if (now !== current) setCurrent(now); }, 100);
    return () => clearInterval(timer);
  }, [current, player]);
  return <HotkeyPanel testId="animations-section" title={t.animations} hint={t.animHint} language={language} storageKey="mesh-avatar-animation-keys"
    icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 5l11 7-11 7z" /></svg>}
    items={ANIMATIONS.map(a => ({ id: a.id, key: a.key, label: t[a.id as keyof typeof t] }))}
    pressed={id => current === id} onTrigger={id => { player.current.play(id as AnimationId); setCurrent(id); }}
    onEscape={() => { player.current.stop(); setCurrent(null); }} />;
}
