// Fork addition (see FORK.md): a Live tools section of buttons with rebindable keys, shared by
// expressions (toggles) and animations (one-shots).
import { useEffect, useState, type ReactNode } from 'react';

export const hotkeyText = {
  es: { key: 'Tecla', press: 'Pulsa una tecla…', none: 'sin tecla' },
  en: { key: 'Key', press: 'Press a key…', none: 'no key' },
  ja: { key: 'キー', press: 'キーを押してください…', none: 'キーなし' },
  zh: { key: '按键', press: '请按一个键…', none: '无按键' },
};
type Lang = keyof typeof hotkeyText;
const keyLabel = (key: string) => key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key;

function loadBindings(storageKey: string, defaults: Record<string, string>): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return Object.fromEntries(Object.entries(defaults).map(([id, key]) => [id, typeof saved[id] === 'string' ? saved[id] : key]));
  } catch { return { ...defaults }; }
}
// keys typed into text fields, lists or with modifiers never trigger anything
function ignored(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return true;
  const el = event.target as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes((el as HTMLInputElement).type);
}

type Props = {
  testId: string; title: string; icon: ReactNode; hint: string; language: Lang; storageKey: string;
  items: { id: string; label: string; key: string }[]; pressed: (id: string) => boolean;
  onTrigger: (id: string) => void; onEscape?: () => void; badge?: ReactNode; footer?: ReactNode;
};

export function HotkeyPanel({ testId, title, icon, hint, language, storageKey, items, pressed, onTrigger, onEscape, badge, footer }: Props) {
  const t = hotkeyText[language];
  const [bindings, setBindings] = useState(() => loadBindings(storageKey, Object.fromEntries(items.map(i => [i.id, i.key]))));
  const [capturing, setCapturing] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(bindings)); } catch { /* storage is optional */ } }, [storageKey, bindings]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (capturing) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        if (event.key !== 'Escape') setBindings(current => ({ ...Object.fromEntries(Object.entries(current).map(([id, k]) => [id, k.toLowerCase() === event.key.toLowerCase() ? '' : k])), [capturing]: event.key }));
        setCapturing(null);
        return;
      }
      if (ignored(event)) return;
      if (event.key === 'Escape') { onEscape?.(); return; }
      const hit = items.find(i => bindings[i.id] && bindings[i.id].toLowerCase() === event.key.toLowerCase());
      if (hit) { event.preventDefault(); onTrigger(hit.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return <details className="live-lighting live-hotkeys" data-testid={testId} open>
    <summary>{icon}{title}{badge}</summary>
    <div className="lighting-controls">
      <div className="expression-grid">
        {items.map(item => <div className="expression-row" key={item.id}>
          <button type="button" className="expression-toggle" aria-pressed={pressed(item.id)} onClick={() => onTrigger(item.id)}>{item.label}</button>
          <button type="button" className="expression-key" title={t.key} aria-label={`${t.key}: ${item.label}`} onClick={() => setCapturing(capturing === item.id ? null : item.id)}>
            {capturing === item.id ? t.press : bindings[item.id] ? keyLabel(bindings[item.id]) : t.none}</button>
        </div>)}
      </div>
      {footer}
      <p className="lighting-hint">{hint}</p>
    </div>
  </details>;
}
