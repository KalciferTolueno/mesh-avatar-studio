// Fork addition (see FORK.md): the Live page's expressions section, with key bindings.
import { useEffect, useState, type MutableRefObject } from 'react';
import { EXPRESSIONS, loadBindings, saveBindings, type ExpressionMixer } from './presets';

const text = {
  es: { title: 'Expresiones', happy: 'Feliz', blush: 'Sonrojo', angry: 'Enfado', sad: 'Triste', surprised: 'Sorpresa', sleepy: 'Sueño', key: 'Tecla', press: 'Pulsa una tecla…', none: 'sin tecla', off: 'Quitar todas', hint: 'Pulsa la tecla (o el botón) para activar o quitar cada expresión; se pueden combinar. Las teclas funcionan con esta ventana en primer plano: un navegador no puede leer teclas mientras usas otra aplicación. Esc quita todas.' },
  en: { title: 'Expressions', happy: 'Happy', blush: 'Blush', angry: 'Angry', sad: 'Sad', surprised: 'Surprised', sleepy: 'Sleepy', key: 'Key', press: 'Press a key…', none: 'no key', off: 'Clear all', hint: 'Press the key (or the button) to toggle each expression; they can be combined. Keys work while this window is in front: a browser cannot read keys while another app is focused. Esc clears all.' },
  ja: { title: '表情差分', happy: '笑顔', blush: '照れ', angry: '怒り', sad: '悲しみ', surprised: '驚き', sleepy: '眠い', key: 'キー', press: 'キーを押してください…', none: 'キーなし', off: 'すべて解除', hint: 'キーまたはボタンで各表情を切り替えます。重ねて使えます。キーはこのウィンドウが前面のときに有効です。Esc ですべて解除。' },
  zh: { title: '表情', happy: '开心', blush: '脸红', angry: '生气', sad: '难过', surprised: '惊讶', sleepy: '困', key: '按键', press: '请按一个键…', none: '无按键', off: '全部取消', hint: '按键或按钮切换各表情，可叠加。按键仅在此窗口位于前台时有效。Esc 全部取消。' },
};
type Lang = keyof typeof text;
const keyLabel = (key: string) => key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key;

export function LiveExpressions({ mixer, language }: { mixer: MutableRefObject<ExpressionMixer>; language: Lang }) {
  const t = text[language];
  const [bindings, setBindings] = useState(loadBindings);
  const [active, setActive] = useState<string[]>([]);
  const [capturing, setCapturing] = useState<string | null>(null);
  const toggle = (id: string) => { mixer.current.toggle(id); setActive([...mixer.current.active]); };
  const clear = () => { mixer.current.clear(); setActive([]); };
  useEffect(() => { saveBindings(bindings); }, [bindings]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (capturing) {
        event.preventDefault();
        if (event.key !== 'Escape') setBindings(current => ({ ...Object.fromEntries(Object.entries(current).map(([id, k]) => [id, k === event.key ? '' : k])), [capturing]: event.key }));
        setCapturing(null);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range' && (target as HTMLInputElement).type !== 'checkbox' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (event.key === 'Escape') { clear(); return; }
      const hit = EXPRESSIONS.find(e => bindings[e.id] && bindings[e.id].toLowerCase() === event.key.toLowerCase());
      if (hit) { event.preventDefault(); toggle(hit.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return <details className="live-lighting live-expressions" data-testid="expressions-section" open>
    <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>{t.title}
      {active.length > 0 && <span className="lighting-on">{active.length}</span>}</summary>
    <div className="lighting-controls">
      <div className="expression-grid">
        {EXPRESSIONS.map(e => <div className="expression-row" key={e.id}>
          <button type="button" className="expression-toggle" aria-pressed={active.includes(e.id)} onClick={() => toggle(e.id)}>{t[e.id as keyof typeof t]}</button>
          <button type="button" className="expression-key" title={t.key} onClick={() => setCapturing(capturing === e.id ? null : e.id)}>
            {capturing === e.id ? t.press : bindings[e.id] ? keyLabel(bindings[e.id]) : t.none}</button>
        </div>)}
      </div>
      <button type="button" onClick={clear}>{t.off}</button>
      <p className="lighting-hint">{t.hint}</p>
    </div>
  </details>;
}
