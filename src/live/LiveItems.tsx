// Fork addition (see FORK.md): the Live page's accessories section. Pictures are added from disk
// into the project folder, shown or hidden with keys, and placed by dragging them on the preview.
import { useRef, useState } from 'react';
import { HotkeyPanel } from '../expressions/HotkeyPanel';
import { MAX_ITEMS, uploadItem, type AvatarItem } from './items';

const text = {
  es: { title: 'Accesorios', add: 'Añadir imagen…', adding: 'Añadiendo…', selected: 'Accesorio', name: 'Nombre', attach: 'Sigue a', head: 'La cabeza', body: 'El cuerpo', none: 'Nada (fijo)', layer: 'Capa', front: 'Delante del avatar', behind: 'Detrás del avatar', scale: 'Tamaño', rotation: 'Giro', flip: 'Voltear', remove: 'Quitar', up: 'Más atrás', down: 'Más delante', full: 'Máximo 16 accesorios.', error: 'No se pudo añadir: usa una imagen PNG, WebP o JPEG de hasta 10 MB.',
    hint: 'Añade imágenes con fondo transparente (PNG): gafas, gorros, orejeras… Arrastra un accesorio sobre la vista previa para colocarlo, usa la rueda encima para su tamaño y Mayús + rueda para girarlo. Su tecla lo muestra u oculta. Se guardan en la carpeta del proyecto y aparecen también en OBS.' },
  en: { title: 'Accessories', add: 'Add picture…', adding: 'Adding…', selected: 'Accessory', name: 'Name', attach: 'Follows', head: 'The head', body: 'The body', none: 'Nothing (fixed)', layer: 'Layer', front: 'In front of the avatar', behind: 'Behind the avatar', scale: 'Size', rotation: 'Rotation', flip: 'Flip', remove: 'Remove', up: 'Backward', down: 'Forward', full: 'Up to 16 accessories.', error: 'Could not add it: use a PNG, WebP or JPEG picture up to 10 MB.',
    hint: 'Add pictures with a transparent background (PNG): glasses, hats… Drag an accessory on the preview to place it, scroll over it to resize and Shift + scroll to rotate. Its key shows or hides it. They are saved in the project folder and appear in OBS too.' },
  ja: { title: 'アクセサリー', add: '画像を追加…', adding: '追加中…', selected: 'アクセサリー', name: '名前', attach: '追従先', head: '頭', body: '体', none: 'なし (固定)', layer: 'レイヤー', front: 'アバターの前', behind: 'アバターの後ろ', scale: 'サイズ', rotation: '回転', flip: '反転', remove: '削除', up: '奥へ', down: '手前へ', full: '最大 16 個です。', error: '追加できません: 10 MB までの PNG・WebP・JPEG を使ってください。',
    hint: '透過 PNG の画像 (眼鏡、帽子など) を追加します。プレビュー上でドラッグして配置、ホイールでサイズ、Shift + ホイールで回転。キーで表示を切り替えます。OBS にも表示されます。' },
  zh: { title: '配饰', add: '添加图片…', adding: '添加中…', selected: '配饰', name: '名称', attach: '跟随', head: '头部', body: '身体', none: '不跟随（固定）', layer: '图层', front: '形象前方', behind: '形象后方', scale: '大小', rotation: '旋转', flip: '翻转', remove: '移除', up: '后移', down: '前移', full: '最多 16 个配饰。', error: '无法添加：请使用 10 MB 以内的 PNG、WebP 或 JPEG 图片。',
    hint: '添加透明背景的图片（PNG）：眼镜、帽子等。在预览上拖动来放置，滚轮调整大小，Shift + 滚轮旋转。按键可显示或隐藏。保存在项目文件夹中，也会显示在 OBS 中。' },
};
type Lang = keyof typeof text;

type Props = {
  project: string; items: AvatarItem[]; onChange: (items: AvatarItem[]) => void; selected: string | null; onSelect: (id: string | null) => void;
  /** Where a new picture of this size goes: centre and scale in source-image px. */
  place: (width: number, height: number) => { x: number; y: number; scale: number } | null;
  onRemoveFile: (file: string) => void; language: Lang;
};

export function LiveItems({ project, items, onChange, selected, onSelect, place, onRemoveFile, language }: Props) {
  const t = text[language];
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'adding' | 'error'>('idle');
  const current = items.find(item => item.id === selected) ?? null;
  const update = (patch: Partial<AvatarItem>) => current && onChange(items.map(item => item.id === current.id ? { ...item, ...patch } : item));
  const add = async (file: File | undefined) => {
    if (!file) return;
    setState('adding');
    try {
      const bitmap = await createImageBitmap(file), size = [bitmap.width, bitmap.height] as const; bitmap.close();
      const stored = await uploadItem(project, file), spot = place(...size) ?? { x: 0, y: 0, scale: 1 };
      const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join('');
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || t.selected;
      onChange([...items, { id, file: stored, name, ...spot, rotation: 0, flip: false, attach: 'head', layer: 'front', visible: true }]);
      onSelect(id); setState('idle');
    } catch { setState('error'); }
    if (input.current) input.current.value = '';
  };
  const move = (step: number) => {
    if (!current) return;
    const i = items.indexOf(current), j = i + step;
    if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  const remove = () => {
    if (!current) return;
    const rest = items.filter(item => item.id !== current.id);
    if (!rest.some(item => item.file === current.file)) onRemoveFile(current.file);
    onChange(rest); onSelect(rest.at(-1)?.id ?? null);
  };
  const slider = (key: 'scale' | 'rotation', min: number, max: number, step: number, show: (n: number) => string) => current && <label className="lighting-slider" key={key}>{t[key]}
    <input aria-label={t[key]} type="range" min={min} max={max} step={step} value={current[key]} onChange={event => update({ [key]: Number(event.target.value) })} />
    <output>{show(current[key])}</output></label>;
  return <HotkeyPanel testId="items-section" title={t.title} hint={t.hint} language={language} storageKey={`mesh-avatar-item-keys:${project}`}
    icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="14" r="3.5" /><circle cx="17" cy="14" r="3.5" /><path d="M10.5 14h3M3.5 14 2 10M20.5 14 22 10" /></svg>}
    items={items.map(item => ({ id: item.id, key: '', label: item.name }))} pressed={id => items.find(item => item.id === id)?.visible ?? false}
    onTrigger={id => { onSelect(id); onChange(items.map(item => item.id === id ? { ...item, visible: !item.visible } : item)); }}
    badge={items.length > 0 && <span className="lighting-on">{items.filter(item => item.visible).length}/{items.length}</span>}
    footer={<div className="item-editor">
      <input ref={input} type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={event => void add(event.target.files?.[0])} />
      <button type="button" disabled={state === 'adding' || items.length >= MAX_ITEMS} onClick={() => input.current?.click()}>{state === 'adding' ? t.adding : t.add}</button>
      {state === 'error' && <small className="live-error">{t.error}</small>}
      {items.length >= MAX_ITEMS && <small>{t.full}</small>}
      {items.length > 0 && <label>{t.selected}<select aria-label={t.selected} value={current?.id ?? ''} onChange={event => onSelect(event.target.value || null)}>
        {!current && <option value="">—</option>}{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {current && <>
        <label>{t.name}<input type="text" maxLength={40} value={current.name} onChange={event => update({ name: event.target.value })} /></label>
        <label>{t.attach}<select aria-label={t.attach} value={current.attach} onChange={event => update({ attach: event.target.value as AvatarItem['attach'] })}>
          <option value="head">{t.head}</option><option value="body">{t.body}</option><option value="none">{t.none}</option></select></label>
        <label>{t.layer}<select aria-label={t.layer} value={current.layer} onChange={event => update({ layer: event.target.value as AvatarItem['layer'] })}>
          <option value="front">{t.front}</option><option value="behind">{t.behind}</option></select></label>
        {slider('scale', 0.02, 3, 0.01, n => `${Math.round(n * 100)} %`)}
        {slider('rotation', -180, 180, 1, n => `${Math.round(n)}°`)}
        <label className="lighting-check"><input type="checkbox" checked={current.flip} onChange={event => update({ flip: event.target.checked })} />{t.flip}</label>
        <div className="live-buttons"><button type="button" onClick={() => move(-1)} disabled={items.indexOf(current) === 0}>{t.up}</button>
          <button type="button" onClick={() => move(1)} disabled={items.indexOf(current) === items.length - 1}>{t.down}</button>
          <button type="button" onClick={remove}>{t.remove}</button></div>
      </>}
    </div>} />;
}
