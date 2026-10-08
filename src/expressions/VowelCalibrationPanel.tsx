// Fork addition (see FORK.md): vowel calibration in the Live microphone section. Each vowel is
// recorded on its own button, so moving on to the next vowel never blends two together.
import { useEffect, useState, type MutableRefObject } from 'react';
import { completeTemplates, loadVowelTemplates, saveVowelTemplates, VowelCalibration, type Vowel, type VowelDetector, type VowelTemplates } from './vowels';

const text = {
  es: { title: 'Calibrar con tu voz', needMic: 'Activa el micrófono para grabar.', say: (v: string) => `Di «${v}» sostenida a tu volumen normal…`, cancel: 'Cancelar', clear: 'Borrar calibración', done: 'Calibrado con tu voz y tu micrófono.', missing: (v: string) => `Faltan: ${v}. Mientras tanto se usan voces típicas.`, none: 'Sin calibrar: se usan voces típicas.', hint: 'Pulsa una vocal, dila sostenida y espera a que se marque; luego la siguiente. Puedes repetir cualquiera. Mejora mucho la detección con micrófonos de portátil o auriculares sencillos. Se guarda solo en este navegador.' },
  en: { title: 'Calibrate with your voice', needMic: 'Turn the microphone on to record.', say: (v: string) => `Hold "${v}" at your usual volume…`, cancel: 'Cancel', clear: 'Clear calibration', done: 'Calibrated to your voice and microphone.', missing: (v: string) => `Missing: ${v}. Typical voices are used until then.`, none: 'Not calibrated: typical voices are used.', hint: 'Press a vowel, hold it until it is checked, then the next one. Any can be recorded again. Greatly improves detection with laptop or basic headset microphones. Stored in this browser only.' },
  ja: { title: '自分の声で調整', needMic: 'マイクをオンにしてください。', say: (v: string) => `「${v}」をいつもの声で伸ばしてください…`, cancel: 'キャンセル', clear: '調整を消去', done: 'あなたの声とマイクで調整済みです。', missing: (v: string) => `残り: ${v}。それまでは標準の声を使います。`, none: '未調整: 標準の声を使用しています。', hint: '母音を押して、チェックが付くまで伸ばしてから次へ。どれでも録り直せます。このブラウザにのみ保存されます。' },
  zh: { title: '用你的声音校准', needMic: '请先打开麦克风。', say: (v: string) => `用平常的音量持续发「${v}」…`, cancel: '取消', clear: '清除校准', done: '已按你的声音和麦克风校准。', missing: (v: string) => `还差: ${v}。在此之前使用典型声音。`, none: '未校准：使用典型声音。', hint: '按下一个元音，持续发音直到打勾，再录下一个。可随时重录。仅保存在此浏览器。' },
};
const SPOKEN: Record<string, Record<Vowel, string>> = {
  es: { a: 'a', i: 'i', u: 'u', e: 'e', o: 'o' }, en: { a: 'ah', i: 'ee', u: 'oo', e: 'eh', o: 'oh' },
  ja: { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' }, zh: { a: 'a', i: 'i', u: 'u', e: 'e', o: 'o' },
};
type Lang = keyof typeof text;

export function VowelCalibrationPanel({ detector, calibration, micOn, language }: {
  detector: MutableRefObject<VowelDetector>; calibration: MutableRefObject<VowelCalibration | null>; micOn: boolean; language: Lang;
}) {
  const t = text[language], spoken = SPOKEN[language];
  const [templates, setTemplates] = useState<VowelTemplates>(loadVowelTemplates);
  const [recording, setRecording] = useState<{ vowel: Vowel; progress: number } | null>(null);
  useEffect(() => { saveVowelTemplates(templates); detector.current.setTemplates(completeTemplates(templates)); }, [templates, detector]);
  // follow the recording (fed by the Live frame loop) and keep the vowel when it is done
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const run = calibration.current;
      if (!run) { setRecording(null); return; }
      if (run.done) {
        setTemplates(current => ({ ...current, ...run.templates }));
        calibration.current = null; setRecording(null); return;
      }
      setRecording(current => current && { ...current, progress: run.progress });
    }, 80);
    return () => clearInterval(timer);
  }, [recording?.vowel, calibration]);
  useEffect(() => { if (!micOn && calibration.current) { calibration.current = null; setRecording(null); } }, [micOn, calibration]);
  const record = (vowel: Vowel) => { calibration.current = new VowelCalibration([vowel]); setRecording({ vowel, progress: 0 }); };
  const cancel = () => { calibration.current = null; setRecording(null); };
  const missing = VowelCalibration.ORDER.filter(v => !templates[v]);
  return <div className="vowel-calibration" data-testid="vowel-calibration">
    <strong>{t.title}</strong>
    <div className="vowel-steps">{VowelCalibration.ORDER.map(v => {
      const now = recording?.vowel === v;
      return <button type="button" key={v} disabled={!micOn} aria-pressed={now} className={now ? 'now' : templates[v] ? 'done' : ''}
        style={now ? { ['--p' as string]: `${Math.round(recording!.progress * 100)}%` } : undefined} onClick={() => now ? cancel() : record(v)}>
        {spoken[v]}{templates[v] && !now ? ' ✓' : ''}</button>;
    })}</div>
    {recording ? <><p className="vowel-prompt">{t.say(spoken[recording.vowel])}</p><button type="button" onClick={cancel}>{t.cancel}</button></>
      : <small>{missing.length === 0 ? t.done : missing.length === 5 ? t.none : t.missing(missing.map(v => spoken[v]).join(', '))}</small>}
    {!micOn && <small>{t.needMic}</small>}
    {missing.length < 5 && !recording && <button type="button" onClick={() => setTemplates({})}>{t.clear}</button>}
    <small>{t.hint}</small>
  </div>;
}
