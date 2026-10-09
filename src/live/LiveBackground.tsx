// Fork addition (see FORK.md): picture or video background controls for the Live "Background"
// section. Files are uploaded into the project folder so the OBS view can show them too.
import { useEffect, useRef, useState } from 'react';
import { BACKGROUND_FITS, deleteBackground, isVideo, listBackgrounds, uploadBackground, type BackgroundFit, type BackgroundImage } from './background';

const text = {
  es: { image: 'Imagen o video de fondo', none: 'Ninguno (solo color)', upload: 'Subir imagen o video…', uploading: 'Subiendo…', fit: 'Ajuste del fondo', cover: 'Cubrir (recorta los bordes)', contain: 'Completo (con bandas)', stretch: 'Estirar', remove: 'Borrar este archivo', error: 'No se pudo subir: usa PNG, JPEG, WebP, GIF (hasta 60 MB) o un video MP4 / WebM.',
    hint: 'Imágenes, GIF animados o videos cortos en bucle (sin sonido). Usa el formato de tu escena (16:9). Se guardan en la carpeta del proyecto y salen también en OBS; si prefieres poner el fondo en OBS, deja "Ninguno" y fondo transparente.', video: 'video' },
  en: { image: 'Background picture or video', none: 'None (color only)', upload: 'Upload picture or video…', uploading: 'Uploading…', fit: 'Background fit', cover: 'Cover (crops the edges)', contain: 'Whole (with bars)', stretch: 'Stretch', remove: 'Delete this file', error: 'Could not upload: use PNG, JPEG, WebP, GIF (up to 60 MB) or an MP4 / WebM video.',
    hint: 'Pictures, animated GIFs or short looping videos (muted). Use your scene shape (16:9). They are saved in the project folder and appear in OBS too; to set the background in OBS instead, keep "None" and a transparent background.', video: 'video' },
  ja: { image: '背景の画像・動画', none: 'なし (色のみ)', upload: '画像・動画をアップロード…', uploading: 'アップロード中…', fit: '背景の合わせ方', cover: '全体を覆う (端を切る)', contain: '全体を表示 (余白あり)', stretch: '引き伸ばす', remove: 'このファイルを削除', error: 'アップロードできません: PNG・JPEG・WebP・GIF (60 MB まで) または MP4・WebM 動画を使ってください。',
    hint: '画像、GIF アニメ、短いループ動画 (無音) を使えます。プロジェクトフォルダーに保存され、OBS にも表示されます。', video: '動画' },
  zh: { image: '背景图片或视频', none: '无（仅颜色）', upload: '上传图片或视频…', uploading: '上传中…', fit: '背景适配', cover: '覆盖（裁剪边缘）', contain: '完整（留边）', stretch: '拉伸', remove: '删除此文件', error: '无法上传：请使用 PNG、JPEG、WebP、GIF（最多 60 MB）或 MP4 / WebM 视频。',
    hint: '可使用图片、GIF 动图或短循环视频（静音）。保存在项目文件夹中，也会显示在 OBS 中。', video: '视频' },
};
type Lang = keyof typeof text;

export function LiveBackground({ project, value, onChange, language }: { project: string; value: BackgroundImage; onChange: (value: BackgroundImage) => void; language: Lang }) {
  const t = text[language];
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle');
  useEffect(() => { let live = true; void listBackgrounds(project).then(list => { if (live) setFiles(list); }); return () => { live = false; }; }, [project]);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setState('uploading');
    try {
      const stored = await uploadBackground(project, file);
      setFiles(current => [...current, stored].sort()); onChange({ ...value, file: stored }); setState('idle');
    } catch { setState('error'); }
    if (input.current) input.current.value = '';
  };
  const remove = async () => {
    if (!value.file) return;
    const file = value.file;
    onChange({ ...value, file: null });
    await deleteBackground(project, file);
    setFiles(current => current.filter(entry => entry !== file));
  };
  const label = (file: string) => `${file.replace(/-[0-9a-f]{8}\.[a-z0-9]+$/, '')}${isVideo(file) ? ` (${t.video})` : ''}`;
  return <div className="live-background-image" data-testid="background-image">
    <label>{t.image}<select aria-label={t.image} value={value.file ?? ''} onChange={event => onChange({ ...value, file: event.target.value || null })}>
      <option value="">{t.none}</option>{files.map(file => <option key={file} value={file}>{label(file)}</option>)}</select></label>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" hidden onChange={event => void upload(event.target.files?.[0])} />
    <div className="live-buttons">
      <button type="button" disabled={state === 'uploading'} onClick={() => input.current?.click()}>{state === 'uploading' ? t.uploading : t.upload}</button>
      {value.file && <button type="button" onClick={() => void remove()}>{t.remove}</button>}
    </div>
    {state === 'error' && <small className="live-error">{t.error}</small>}
    {value.file && <label>{t.fit}<select aria-label={t.fit} value={value.fit} onChange={event => onChange({ ...value, fit: event.target.value as BackgroundFit })}>
      {BACKGROUND_FITS.map(fit => <option key={fit} value={fit}>{t[fit]}</option>)}</select></label>}
    <small>{t.hint}</small>
  </div>;
}
