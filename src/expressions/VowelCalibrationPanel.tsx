// Fork addition (see FORK.md): guided vowel calibration in the Live microphone section.
import { useEffect, useState, type MutableRefObject } from 'react';
import { loadVowelTemplates, saveVowelTemplates, VowelCalibration, type VowelDetector } from './vowels';

const text = {
  es: { start: 'Calibrar vocales con mi voz', redo: 'Volver a calibrar', cancel: 'Cancelar', clear: 'Usar voces típicas', needMic: 'Activa el micrófono para calibrar.', say: (v: string) => `Di «${v}» sostenida, a tu volumen normal`, done: 'Calibrado con tu voz y tu micrófono.', generic: 'Sin calibrar: se usan voces típicas.', hint: 'Mejora mucho la detección con micrófonos de portátil o auriculares sencillos. Se guarda solo en este navegador.' },
  en: { start: 'Calibrate vowels with my voice', redo: 'Calibrate again', cancel: 'Cancel', clear: 'Use typical voices', needMic: 'Turn the microphone on to calibrate.', say: (v: string) => `Hold "${v}" at your usual volume`, done: 'Calibrated to your voice and microphone.', generic: 'Not calibrated: typical voices are used.', hint: 'Greatly improves detection with laptop or basic headset microphones. Stored in this browser only.' },
  ja: { start: '自分の声で母音を調整', redo: 'もう一度調整', cancel: 'キャンセル', clear: '標準の声を使う', needMic: 'マイクをオンにしてください。', say: (v: string) => `「${v}」をいつもの声で伸ばしてください`, done: 'あなたの声とマイクで調整済みです。', generic: '未調整: 標準の声を使用しています。', hint: 'ノートPCや簡易ヘッドセットのマイクで精度が大きく上がります。このブラウザにのみ保存されます。' },
  zh: { start: '用我的声音校准元音', redo: '重新校准', cancel: '取消', clear: '使用典型声音', needMic: '请先打开麦克风。', say: (v: string) => `用平常的音量持续发「${v}」`, done: '已按你的声音和麦克风校准。', generic: '未校准：使用典型声音。', hint: '可大幅提升笔记本或简易耳麦的识别效果。仅保存在此浏览器。' },
};
const SPOKEN: Record<string, Record<string, string>> = {
  es: { a: 'a', i: 'i', u: 'u', e: 'e', o: 'o' }, en: { a: 'ah', i: 'ee', u: 'oo', e: 'eh', o: 'oh' },
  ja: { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' }, zh: { a: 'a', i: 'i', u: 'u', e: 'e', o: 'o' },
};
type Lang = keyof typeof text;

export function VowelCalibrationPanel({ detector, calibration, micOn, language }: {
  detector: MutableRefObject<VowelDetector>; calibration: MutableRefObject<VowelCalibration | null>; micOn: boolean; language: Lang;
}) {
  const t = text[language];
  const [calibrated, setCalibrated] = useState(() => { const saved = loadVowelTemplates(); detector.current.setTemplates(saved); return !!saved; });
  const [status, setStatus] = useState<{ vowel: string; progress: number } | null>(null);
  // follow the running calibration (fed by the Live frame loop) and save it when it ends
  useEffect(() => {
    if (!status) return;
    const timer = setInterval(() => {
      const run = calibration.current;
      if (!run) { setStatus(null); return; }
      if (run.done) {
        saveVowelTemplates(run.templates); detector.current.setTemplates(run.templates);
        calibration.current = null; setCalibrated(true); setStatus(null); return;
      }
      setStatus({ vowel: run.vowel!, progress: run.progress });
    }, 80);
    return () => clearInterval(timer);
  }, [status, calibration, detector]);
  const start = () => { calibration.current = new VowelCalibration(); setStatus({ vowel: 'a', progress: 0 }); };
  const cancel = () => { calibration.current = null; setStatus(null); };
  const clear = () => { saveVowelTemplates(null); detector.current.setTemplates(null); setCalibrated(false); };
  return <div className="vowel-calibration" data-testid="vowel-calibration">
    {status ? <>
      <p className="vowel-prompt">{t.say(SPOKEN[language][status.vowel])}</p>
      <div className="vowel-steps">{VowelCalibration.ORDER.map(v => {
        const index = VowelCalibration.ORDER.indexOf(v), now = VowelCalibration.ORDER.indexOf(status.vowel as never);
        return <span key={v} className={index < now ? 'done' : index === now ? 'now' : ''} style={index === now ? { ['--p' as string]: `${Math.round(status.progress * 100)}%` } : undefined}>{SPOKEN[language][v]}</span>;
      })}</div>
      <button type="button" onClick={cancel}>{t.cancel}</button>
    </> : <>
      <small>{calibrated ? t.done : t.generic}</small>
      <div className="live-buttons">
        <button type="button" disabled={!micOn} onClick={start}>{calibrated ? t.redo : t.start}</button>
        {calibrated && <button type="button" onClick={clear}>{t.clear}</button>}
      </div>
      {!micOn && <small>{t.needMic}</small>}
      <small>{t.hint}</small>
    </>}
  </div>;
}
