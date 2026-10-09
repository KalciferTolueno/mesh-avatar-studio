import { LightingControls, LightHandle, lightingText } from '../lighting/Controls';
import { loadLighting, saveLighting } from '../lighting/settings';
import { LivePhysics } from '../physics/LivePhysics';
import { LiveAnimations, LiveExpressions } from '../expressions/LiveExpressions';
import { ExpressionMixer } from '../expressions/presets';
import { AnimationPlayer, ANIMATIONS } from '../expressions/animations';
import { LifeLayer } from '../expressions/life';
import { VowelDetector, VowelMouth, type VowelCalibration } from '../expressions/vowels';
import { VowelCalibrationPanel } from '../expressions/VowelCalibrationPanel';
import { loadPhysics } from '../physics/settings';
import type { MeshAvatar } from '../engine';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../editor/i18n';
import { ModeSwitch, ThemeToggle } from '../theme/ThemeControls';
import { themeText } from '../theme/theme';
const themeLabel = (language: keyof typeof themeText) => themeText[language].edit;
import { createAvatarView, neutralParameters } from './avatar-view';
import { viewSettings, streamUrl, backgroundColor } from './settings';
import { FacePose, type TrackingOptions } from './tracking';
import { CameraCapture, MicrophoneCapture, type CameraState, type MicState, type BackgroundTracking } from './media';
import { liveText } from './i18n';
import { Icon } from '../editor/Icon';
import { createLiveSender, sendLighting } from './relay';
import { LiveFrame, useFrameCanvas } from './LiveFrame';
import { LiveLost, LOST_DEFAULTS } from './LiveLost';
import { LiveItems } from './LiveItems';
import { itemLayers, loadItems, saveItems, sendItems, type AvatarItem } from './items';
import { LiveBackground } from './LiveBackground';
import { LiveProjectPicker } from './LiveProjectPicker';
import { LanguageMenu, ShellRail, StatusMeters, shellIcons, shellText, useFpsCounter, useShellGroup, type ShellGroup } from './LiveShell';
import { loadBackground, saveBackground, sendBackground, showBackground } from './background';
import { loadFrameSettings, saveFrameSettings, sendFrame } from './frame';

// fork: name of the folding background section, which also holds the OBS link
const FOLD_TEXT = { es: { background: 'Fondo y OBS' }, en: { background: 'Background and OBS' }, ja: { background: '背景と OBS' }, zh: { background: '背景和 OBS' } };
const OPTIONS_KEY = 'mesh-avatar-live-tracking';
// like VTube Studio's sample models: pitch ±20° -> ±30°, livelier brows, blush and wide eyes on
const EXPRESSION_DEFAULTS = { pitchBoost: 1.4, eyeWideGain: 1, browGain: 1.3, blushGain: 0.5, smileEyes: 1, breathing: 0.8, blinkMode: 'both' as const, voiceVowels: true, vowelSmooth: 0.5, vowelStrength: 0.85 };
const DEFAULT_OPTIONS: Required<TrackingOptions> = { mirror: true, sensitivity: 1, smoothing: 0.35, mouthSensitivity: 1.5, linkEyes: true, bodySensitivity: 1, screenMove: 1, limitSide: 1, limitUp: 1, limitDown: 1, limitIn: 1, limitOut: 1, limitLeanForward: 0.6, limitLeanBack: 0.6, ...EXPRESSION_DEFAULTS, ...LOST_DEFAULTS };
const MOVEMENT_DEFAULTS = { screenMove: 1, bodySensitivity: 1, limitSide: 1, limitUp: 1, limitDown: 1, limitIn: 1, limitOut: 1, limitLeanForward: 0.6, limitLeanBack: 0.6 };
// Tracking adjustments are a per-browser convenience; anything unreadable falls back to defaults.
function loadTrackingOptions(): Required<TrackingOptions> {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}');
    const options = Object.fromEntries(Object.entries(DEFAULT_OPTIONS).map(([key, value]) =>
      [key, typeof saved[key] === typeof value && (typeof value !== 'number' || Number.isFinite(saved[key])) ? saved[key] : value])) as Required<TrackingOptions>;
    if (!['idle', 'rest', 'hold'].includes(options.lostMode)) options.lostMode = 'idle';
    return options;
  } catch { return { ...DEFAULT_OPTIONS }; }
}

export function LiveApp() {
  const { language, setLanguage } = useI18n(), t = liveText[language];
  const [settings, setSettings] = useState(() => { const view = viewSettings(location.search); return { ...view, lighting: view.lighting ?? loadLighting(view.project), physics: view.physics ?? loadPhysics(view.project), backgroundImage: view.backgroundImage ?? loadBackground(view.project) }; });
  const [lightingOpen, setLightingOpen] = useState(false);
  // fork (FORK.md 29): open settings group, status bar meters and short notices
  const [shellGroup, setShellGroup] = useShellGroup();
  const micLevel = useRef(0);
  const [fps, countFrame] = useFpsCounter();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = (message: string) => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2500); };
  // every settings section starts open inside its group panel (they still fold on a click)
  useEffect(() => { document.querySelectorAll<HTMLDetailsElement>('.app-panel details').forEach(details => { details.open = true; }); }, []);
  // fork: avatar position and size in the frame (src/live/LiveFrame.tsx)
  const [frame, setFrame] = useState(() => loadFrameSettings(settings.project));
  const frameRef = useRef(frame.frame); frameRef.current = frame.frame;
  const [options, setOptions] = useState<TrackingOptions>(loadTrackingOptions);
  useEffect(() => { try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch { /* storage unavailable */ } }, [options]);
  const [cameraState, setCameraState] = useState<CameraState>('stopped');
  const [micState, setMicState] = useState<MicState>('micOff');
  const [tracking, setTracking] = useState(false), [showCamera, setShowCamera] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [cameraId, setCameraId] = useState(''), [micId, setMicId] = useState('');
  const [gain, setGain] = useState(1), [calibrated, setCalibrated] = useState(false);
  const [copyState, setCopyState] = useState<'copied' | 'copyError' | null>(null);
  const [viewState, setViewState] = useState<'loading' | 'ready' | 'projectError'>('loading');
  const [backgroundStatus, setBackgroundStatus] = useState<BackgroundTracking>(null);
  const canvas = useRef<HTMLCanvasElement>(null), video = useRef<HTMLVideoElement>(null);
  const camera = useRef<CameraCapture | null>(null), microphone = useRef<MicrophoneCapture | null>(null);
  const avatarRef = useRef<MeshAvatar | null>(null);
  const lightRef = useRef(settings.lighting); lightRef.current = settings.lighting;
  // fork: accessories (src/live/LiveItems.tsx), stored in the project folder for OBS too
  const [items, setItems] = useState<AvatarItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const itemsLoaded = useRef<string | null>(null);
  const changeItem = (id: string, change: (item: AvatarItem) => Partial<AvatarItem>) =>
    setItems(current => current.map(item => item.id === id ? { ...item, ...change(item) } : item));
  useFrameCanvas(canvas, frame, setFrame, {
    at: (x, y) => avatarRef.current?.itemAt(x, y) ?? null,
    move: (id, from, to) => {
      const a = avatarRef.current?.canvasToImage(...from), b = avatarRef.current?.canvasToImage(...to);
      setSelectedItem(id);
      if (a && b) changeItem(id, item => ({ x: item.x + b[0] - a[0], y: item.y + b[1] - a[1] }));
    },
    scale: (id, factor) => { setSelectedItem(id); changeItem(id, item => ({ scale: Math.max(0.02, Math.min(8, item.scale * factor)) })); },
    rotate: (id, degrees) => { setSelectedItem(id); changeItem(id, item => ({ rotation: ((item.rotation + degrees + 540) % 360) - 180 })); },
  });
  const pose = useRef(new FacePose());
  const expressions = useRef(new ExpressionMixer());
  const animations = useRef(new AnimationPlayer());
  const life = useRef(new LifeLayer());
  const vowels = useRef(new VowelDetector());
  const vowelMouth = useRef(new VowelMouth());
  const vowelCalibration = useRef<VowelCalibration | null>(null);
  // fork: face lost for longer than the wait (src/live/LiveLost.tsx)
  const faceLost = useRef(false);
  const controls = useRef({ options, gain, micState, cameraState }); controls.current = { options, gain, micState, cameraState };
  const refreshDevices = () => { void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => undefined); };
  useEffect(() => {
    const capture = new CameraCapture(video.current!, (result, now) => pose.current.update(result, now), state => { setCameraState(state); if (state !== 'running') setTracking(false); });
    const mic = new MicrophoneCapture(setMicState);
    camera.current = capture; microphone.current = mic;
    refreshDevices(); navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    const stop = () => { capture.stop(); mic.stop(); pose.current.reset(); };
    window.addEventListener('pagehide', stop);
    return () => { stop(); navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices); window.removeEventListener('pagehide', stop); };
  }, []);
  useEffect(() => {
    let cancelled = false, view: Awaited<ReturnType<typeof createAvatarView>> | undefined;
    const clock = new Worker(new URL('./clock-worker.ts', import.meta.url), { type: 'module' });
    clock.onmessage = () => {
      const now = performance.now();
      view?.updateIfStalled(now);
      setBackgroundStatus(camera.current?.backgroundStatus(document.visibilityState === 'hidden' || !!view?.paintPaused(now), now) ?? null);
    };
    const send = createLiveSender(settings.project);
    setViewState('loading');
    void createAvatarView(canvas.current!, settings, (avatar, now, dt) => {
      const control = controls.current, sampled = pose.current.sample(now, dt, control.options);
      setTracking(sampled.tracking);
      // fork: with the camera on and the face lost, the chosen behaviour (src/live/LiveLost.tsx):
      // idle motions as before, a still rest, or the held pose; plus an expression meanwhile and
      // an animation when the face is back
      const mixer = expressions.current, player = animations.current;
      const cameraOn = control.cameraState === 'running', lost = cameraOn && !sampled.tracking;
      const idle = !sampled.tracking && (!lost || (control.options.lostMode ?? 'idle') === 'idle');
      avatar.setAutoIdle(idle); avatar.setAutoMotion(idle);
      if (lost) faceLost.current = true;
      else if (sampled.tracking && faceLost.current) {
        faceLost.current = false;
        const back = ANIMATIONS.find(a => a.id === control.options.foundAnimation);
        if (back) player.play(back.id);
      }
      mixer.setAuto(lost ? control.options.lostExpression || null : null);
      // fork: expressions toggled with keys sit on top of tracking (src/expressions)
      // and so do animations on keys (src/expressions/animations.ts)
      mixer.step(dt); player.step(dt);
      // breathing and blinking while tracking or holding the pose (src/expressions/life.ts); idle motion does it otherwise
      const tracked = sampled.tracking || sampled.hold ? life.current.apply(sampled.params, dt, { breathing: control.options.breathing ?? 0.8, blinkMode: control.options.blinkMode ?? 'both' }) : sampled.params;
      // the microphone's vowels shape the drawn mouths while speaking (src/expressions/vowels.ts)
      const micOn = control.micState === 'micOn', level = micOn ? microphone.current?.level(control.gain) ?? 0 : 0;
      const calibrating = vowelCalibration.current;
      const spectrum = micOn && ((control.options.voiceVowels ?? true) || calibrating) ? microphone.current?.spectrum() : null;
      // while calibrating, the voice is recorded as templates instead of moving the mouth
      if (calibrating && spectrum) calibrating.feed(vowels.current.envelope(spectrum.data, spectrum.binHz), level);
      const vowel = spectrum && !calibrating && (control.options.voiceVowels ?? true) ? vowels.current.detect(spectrum.data, spectrum.binHz, level, dt) : null;
      const smooth = control.options.vowelSmooth ?? 0.5;
      const form = vowelMouth.current.step(vowel, dt, smooth, control.options.vowelStrength ?? 0.85);
      avatar.setMouthBlend(0.03 + 0.15 * smooth);
      avatar.setVoiceVowel(vowel);
      const voice: Record<string, number> = form === null ? {} : { mouthForm: form };
      if (sampled.tracking || sampled.hold || !(mixer.any() || player.any() || form !== null)) avatar.setParameters({ ...mixer.apply(player.apply(tracked)), ...voice }, sampled.weight);
      else {
        // without the camera, only what they drive is set; idle motion keeps the rest alive
        const all = mixer.apply(player.apply(neutralParameters));
        avatar.setParameters({ ...Object.fromEntries([...new Set([...mixer.touched(), ...player.touched()])].map(key => [key, all[key]])), ...voice }, 1);
      }
      avatar.setSpeaking(micOn); avatar.setVoiceLevel(level);
      micLevel.current = level; countFrame();
    }, (avatar, now) => {
      if (controls.current.cameraState === 'running' || controls.current.micState === 'micOn' || expressions.current.any() || animations.current.any()) send(avatar.getParameters(), now);
    }).then(value => { if (cancelled) value.destroy(); else { view = value; avatarRef.current = value.avatar; value.avatar.setLighting(lightRef.current); value.avatar.setFrame(frameRef.current); setViewState('ready'); } }).catch(() => { if (!cancelled) setViewState('projectError'); });
    return () => { cancelled = true; clock.terminate(); view?.destroy(); avatarRef.current = null; };
  }, [settings.project, settings.fit]);
  useEffect(() => {
    saveLighting(settings.project, settings.lighting);
    avatarRef.current?.setLighting(settings.lighting);
  }, [settings.project, settings.lighting]);
  useEffect(() => {
    let sent: typeof settings.lighting | undefined;
    // Throttle continuous drags and deliver the final position even after dragging stops.
    const timer = setInterval(() => {
      if (sent === lightRef.current) return;
      sent = lightRef.current; sendLighting(settings.project, sent);
    }, 34);
    return () => clearInterval(timer);
  }, [settings.project]);
  useEffect(() => {
    saveFrameSettings(settings.project, frame);
    avatarRef.current?.setFrame(frame.frame);
  }, [settings.project, frame]);
  useEffect(() => {
    // the first send waits a second: the dev server connection is not open yet on load
    let sent: typeof frame.frame | undefined = frameRef.current, at = performance.now();
    // like the light: throttled while dragging, and the final position always arrives; repeated
    // every second so a stream view opened later picks it up too
    const timer = setInterval(() => {
      const now = performance.now();
      if (sent === frameRef.current && now - at < 1000) return;
      sent = frameRef.current; at = now; sendFrame(settings.project, sent);
    }, 34);
    return () => clearInterval(timer);
  }, [settings.project]);
  useEffect(() => {
    let cancelled = false;
    itemsLoaded.current = null;
    void loadItems(settings.project).then(list => { if (cancelled) return; itemsLoaded.current = settings.project; setItems(list); setSelectedItem(list[0]?.id ?? null); });
    return () => { cancelled = true; };
  }, [settings.project]);
  useEffect(() => { if (viewState === 'ready') void avatarRef.current?.setItems(itemLayers(settings.project, items)); }, [settings.project, items, viewState]);
  useEffect(() => {
    if (itemsLoaded.current !== settings.project) return;
    sendItems(settings.project, items);
    // saved shortly after the last change, so dragging does not write on every frame
    const timer = setTimeout(() => { void saveItems(settings.project, items).catch(() => undefined); }, 400);
    return () => clearTimeout(timer);
  }, [settings.project, items]);
  /** A new picture goes on the head, about as wide as a quarter of the visible height. */
  const placeItem = (width: number) => {
    const view = canvas.current, avatar = avatarRef.current;
    if (!view || !avatar) return null;
    const top = avatar.canvasToImage(view.clientWidth / 2, 0), bottom = avatar.canvasToImage(view.clientWidth / 2, view.clientHeight);
    const centre = avatar.canvasToImage(view.clientWidth / 2, view.clientHeight * 0.3);
    if (!top || !bottom || !centre) return null;
    return { x: centre[0], y: centre[1], scale: Math.abs(bottom[1] - top[1]) / 4 / width };
  };
  // fork: picture or video behind the avatar (src/live/background.ts), shown on the preview
  // canvas, saved per project and relayed to the stream views (repeated every second)
  const backgroundRef = useRef(settings.backgroundImage); backgroundRef.current = settings.backgroundImage;
  useEffect(() => {
    saveBackground(settings.project, settings.backgroundImage);
    return canvas.current ? showBackground(canvas.current, settings.project, settings.backgroundImage) : undefined;
  }, [settings.project, settings.backgroundImage]);
  useEffect(() => {
    let sent = backgroundRef.current, at = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      if (sent === backgroundRef.current && now - at < 1000) return;
      sent = backgroundRef.current; at = now; sendBackground(settings.project, sent);
    }, 100);
    return () => clearInterval(timer);
  }, [settings.project]);
  const removeItemFile = (file: string) => { void fetch(`/__items/${encodeURIComponent(settings.project)}/file/${encodeURIComponent(file)}`, { method: 'DELETE' }).catch(() => undefined); };
  const changeLighting = (lighting: typeof settings.lighting) => setSettings(current => ({ ...current, lighting }));
  const cameraActive = cameraState === 'starting' || cameraState === 'running';
  const micActive = micState === 'micStarting' || micState === 'micOn';
  const url = streamUrl({ ...settings, frame: frame.frame }, location.origin);
  const status = cameraState === 'running' ? tracking ? 'tracking' : 'lost' : cameraState;
  // fork (FORK.md 29): the Live page as a desktop app (src/live/LiveShell.tsx)
  const shell = shellText[language];
  const copyObs = () => { void navigator.clipboard.writeText(url).then(() => flash(shell.copied)).catch(() => flash(shell.copyError)); };
  const group = (id: ShellGroup, children: React.ReactNode) => <div className="app-group" data-group={id} hidden={shellGroup !== id}>{children}</div>;
  return <main className="live-app app-shell">
    {/* fork: Edit / Live switch and theme toggle (src/theme/ThemeControls.tsx); the back link keeps its name */}
    <header className="live-header app-bar"><div className="live-header-actions">
      <span className="app-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10L7 4l4 3M18 10l-1-6-4 3" /><circle cx="12" cy="13" r="7" /><path d="M9.5 15.5c.7.6 1.5.9 2.5.9s1.8-.3 2.5-.9" /></svg></span>
      <h1>Mesh Avatar Studio</h1>
      {/* fork: the desktop app (src-tauri) has no editor; both choose the project here */}
      {import.meta.env.MODE !== 'desktop' && <ModeSwitch language={language} current="live" edit={<a href="/" aria-label={t.back}>{themeLabel(language)}</a>} />}
      <LiveProjectPicker current={settings.project} language={language} /></div>
      <div className="live-header-actions"><ThemeToggle language={language} />
      <LanguageMenu language={language} onChange={setLanguage} /></div>
    </header>
    <div className="live-layout app-main"><section className="live-view app-stage"><div className="live-preview checkerboard lighting-preview" style={{ backgroundColor: settings.background, backgroundImage: settings.background === 'transparent' ? undefined : 'none' }}>
      <canvas ref={canvas} data-testid="live-avatar" className={frame.locked ? undefined : 'live-movable'} />
      {lightingOpen && shellGroup === 'light' && <LightHandle value={settings.lighting} onChange={changeLighting} language={language} />}
      <div className="app-toolbar" role="toolbar" aria-label={shell.tools}>
        <button className={cameraActive ? 'app-tool' : 'app-tool live-primary'} disabled={!cameraActive && viewState !== 'ready'} onClick={() => {
            setCalibrated(false); pose.current.reset();
            if (cameraActive) camera.current?.stop(); else void camera.current?.start(cameraId).then(refreshDevices);
          }}>{shellIcons.camera}{cameraActive ? t.stop : t.start}</button>
        <button className="app-tool" disabled={!tracking} title={t.calibrateHint} onClick={() => setCalibrated(pose.current.calibrate(performance.now()))}>{t.calibrate}</button>
        <label className="app-tool app-icon-tool" title={t.microphone} data-on={micActive}><input type="checkbox" checked={micActive} disabled={!micActive && viewState !== 'ready'} onChange={event => { if (event.target.checked) void microphone.current?.start(micId).then(refreshDevices); else microphone.current?.stop(); }} />{shellIcons.mic}<span className="app-sr">{t.microphone}</span></label>
        <span className="app-toolbar-gap" aria-hidden="true" />
        <button className="app-tool app-icon-tool" aria-pressed={frame.locked} aria-label={shell.lock} title={shell.lock} onClick={() => setFrame(current => ({ ...current, locked: !current.locked }))}>{frame.locked ? shellIcons.lock : shellIcons.unlock}</button>
        <button className="app-tool app-icon-tool" aria-pressed={settings.lighting.enabled} aria-label={shell.light_} title={shell.light_} onClick={() => changeLighting({ ...settings.lighting, enabled: !settings.lighting.enabled })}>{shellIcons.light}</button>
        <button className="app-tool app-icon-tool" aria-label={shell.copy} title={shell.copy} onClick={copyObs}>{shellIcons.copy}</button>
      </div>
      {/* kept out of the settings panels: a hidden video stops feeding the face tracker */}
      <video ref={video} autoPlay muted playsInline className={showCamera && cameraActive ? 'camera-preview app-pip' : 'camera-preview camera-hidden'} style={{ transform: options.mirror ? 'scaleX(-1)' : undefined }} aria-label={t.cameraPreview} />
      {!frame.locked && <span className="app-stage-hint" aria-hidden="true">{shell.hint}</span>}
    </div></section>
    <aside className="live-controls app-panel" aria-label={shell[shellGroup]}>
      <h2 className="app-panel-title">{shell[shellGroup]}</h2>
      {group('capture', <>
      <details className="live-lighting live-fold" data-testid="camera-section">
        <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></svg>{t.camera}</summary>
        <div className="live-fold-body">
        <label>{t.device}<select aria-label={t.camera} value={cameraId} disabled={cameraActive} onChange={event => setCameraId(event.target.value)}><option value="">{t.defaultDevice}</option>{devices.filter(device => device.kind === 'videoinput' && device.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${t.camera} ${i + 1}`}</option>)}</select></label>
        <label className="live-check"><input type="checkbox" checked={options.mirror} onChange={event => setOptions(current => ({ ...current, mirror: event.target.checked }))} />{t.mirror}</label>
        <label>{t.sensitivity}<input type="range" min="0.25" max="2" step="0.05" value={options.sensitivity} onChange={event => setOptions(current => ({ ...current, sensitivity: Number(event.target.value) }))} /></label>
        <label>{t.mouthSensitivity}<input type="range" min="0.5" max="3" step="0.05" value={options.mouthSensitivity} onChange={event => setOptions(current => ({ ...current, mouthSensitivity: Number(event.target.value) }))} /></label>
        <label className="live-check"><input type="checkbox" checked={options.linkEyes} onChange={event => setOptions(current => ({ ...current, linkEyes: event.target.checked }))} />{t.linkEyes}</label>
        <label>{t.smoothing}<input type="range" min="0" max="1" step="0.05" value={options.smoothing} onChange={event => setOptions(current => ({ ...current, smoothing: Number(event.target.value) }))} /></label>
        <label className="live-check"><input type="checkbox" checked={showCamera} onChange={event => setShowCamera(event.target.checked)} />{t.cameraPreview}</label>
        </div>
      </details>
      <details className="live-lighting live-fold" data-testid="microphone-section">
        <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>{t.microphone}{micState === 'micOn' && <span className="lighting-on">ON</span>}</summary>
        <div className="live-fold-body">
        <label>{t.device}<select aria-label={t.microphone} value={micId} disabled={micActive} onChange={event => setMicId(event.target.value)}><option value="">{t.defaultDevice}</option>{devices.filter(device => device.kind === 'audioinput' && device.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${t.microphone} ${i + 1}`}</option>)}</select></label>
        <label className="live-check"><input type="checkbox" checked={options.voiceVowels} onChange={event => setOptions(current => ({ ...current, voiceVowels: event.target.checked }))} />{t.voiceVowels}</label>
        {options.voiceVowels && <VowelCalibrationPanel detector={vowels} calibration={vowelCalibration} micOn={micState === 'micOn'} language={language} />}
        {(['vowelSmooth', 'vowelStrength'] as const).map(key => <label key={key}>{t[key]}<input type="range" min="0" max="1" step="0.05" value={options[key]} disabled={!options.voiceVowels} onChange={event => setOptions(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
        <label>{t.gain}<input type="range" min="0.25" max="5" step="0.05" value={gain} onChange={event => setGain(Number(event.target.value))} /></label>
        </div>
      </details>
      <p className="live-privacy">{t.privacy}</p>
      </>)}
      {group('scene', <>
      <details className="live-lighting live-fold" data-testid="background-section">
        <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.5" /></svg>{FOLD_TEXT[language].background}</summary>
        <div className="live-fold-body">
        <label>{t.background}<select aria-label={t.background} value={settings.background} onChange={event => setSettings(current => ({ ...current, background: backgroundColor(event.target.value) }))}>
        <option value="transparent">{t.transparent}</option><option value="#00ff00">{t.green}</option><option value="#0000ff">{t.blue}</option>{!['transparent', '#00ff00', '#0000ff'].includes(settings.background) && <option value={settings.background}>{t.custom}</option>}
      </select></label><label>{t.custom}<input type="color" value={settings.background === 'transparent' ? '#ffffff' : settings.background} onChange={event => setSettings(current => ({ ...current, background: event.target.value }))} /></label>
        <LiveBackground project={settings.project} value={settings.backgroundImage} onChange={backgroundImage => setSettings(current => ({ ...current, backgroundImage }))} language={language} />
        <label>{t.fit}<select value={settings.fit} onChange={event => setSettings(current => ({ ...current, fit: event.target.value as 'contain' | 'cover' }))}><option value="contain">{t.contain}</option><option value="cover">{t.cover}</option></select></label>
        <div className="live-buttons"><button className="live-primary" onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopyState('copied')).catch(() => setCopyState('copyError')); }}>{t.obs}</button>
        <a className="live-open" href={url} target="_blank" rel="noreferrer">{t.openStream}</a></div>
        {copyState && <p role="status">{t[copyState]}</p>}<input className="obs-url" aria-label={t.obs} readOnly value={url} onFocus={event => event.target.select()} /><small>{t.obsHelp}</small>
        </div>
      </details>
      <LiveFrame value={frame} onChange={setFrame} language={language} />

      <LiveItems project={settings.project} items={items} onChange={setItems} selected={selectedItem} onSelect={setSelectedItem} place={placeItem} onRemoveFile={removeItemFile} language={language} />

      </>)}
      {group('expression', <>
      {/* fork: expressions on keys, like VTube Studio's hotkeys (FORK.md 14) */}
      <LiveExpressions mixer={expressions} language={language} />
      <LiveAnimations player={animations} language={language} />
      {/* fork: expression ranges, like VTube Studio's amplified mappings (FORK.md 13) */}
      <details className="live-lighting live-expression" data-testid="expression-section">
        <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2" /><path d="M9 9.5h.01M15 9.5h.01" /></svg>{t.expression}</summary>
        <div className="lighting-controls">
          {(['pitchBoost', 'eyeWideGain', 'browGain', 'smileEyes', 'blushGain'] as const).map(key => <label className="lighting-slider" key={key}>{t[key]}
            <input aria-label={t[key]} type="range" min="0" max={key === 'pitchBoost' ? 2.5 : 3} step="0.05" value={options[key]} onChange={event => setOptions(current => ({ ...current, [key]: Number(event.target.value) }))} />
            <output>{(options[key] ?? 1).toFixed(2)}</output></label>)}
          <label className="lighting-slider">{t.breathing}
            <input aria-label={t.breathing} type="range" min="0" max="1" step="0.05" value={options.breathing} onChange={event => setOptions(current => ({ ...current, breathing: Number(event.target.value) }))} />
            <output>{(options.breathing ?? 0.8).toFixed(2)}</output></label>
          <label>{t.blinkMode}<select aria-label={t.blinkMode} value={options.blinkMode} onChange={event => setOptions(current => ({ ...current, blinkMode: event.target.value as 'camera' | 'auto' | 'both' }))}>
            <option value="both">{t.blinkBoth}</option><option value="camera">{t.blinkCamera}</option><option value="auto">{t.blinkAuto}</option></select></label>
          <button type="button" onClick={() => setOptions(current => ({ ...current, ...EXPRESSION_DEFAULTS }))}>{t.resetExpression}</button>
          <p className="lighting-hint">{t.expressionHint}</p>
        </div>
      </details>
      </>)}
      {group('motion', <>
      {/* fork: everything that moves the avatar on screen, with its limits (FORK.md 11, 12) */}
      <details className="live-lighting live-movement" data-testid="movement-section">
        <summary><Icon name="live" />{t.movement}</summary>
        <div className="lighting-controls">
          {(['screenMove', 'bodySensitivity'] as const).map(key => <label className="lighting-slider" key={key}>{t[key]}
            <input aria-label={t[key]} type="range" min="0" max="3" step="0.05" value={options[key]} onChange={event => setOptions(current => ({ ...current, [key]: Number(event.target.value) }))} />
            <output>{(options[key] ?? 1).toFixed(2)}</output></label>)}
          <fieldset><legend>{t.limits}</legend>
            {(['limitSide', 'limitUp', 'limitDown', 'limitIn', 'limitOut', 'limitLeanForward', 'limitLeanBack'] as const).map(key => <label className="lighting-slider" key={key}>{t[key]}
              <input aria-label={t[key]} type="range" min="0" max="1" step="0.05" value={options[key]} onChange={event => setOptions(current => ({ ...current, [key]: Number(event.target.value) }))} />
              <output>{Math.round((options[key] ?? 1) * 100)} %</output></label>)}
          </fieldset>
          <button type="button" onClick={() => setOptions(current => ({ ...current, ...MOVEMENT_DEFAULTS }))}>{t.resetMovement}</button>
          <p className="lighting-hint">{t.movementHint}</p>
        </div>
      </details>
      <LiveLost options={options} onChange={patch => setOptions(current => ({ ...current, ...patch }))} language={language} />

      </>)}
      {group('light', <>
      <details className="live-lighting" data-testid="lighting-section" onToggle={event => setLightingOpen(event.currentTarget.open)}>
        <summary><Icon name="light" />{lightingText[language].title}{settings.lighting.enabled && <span className="lighting-on">ON</span>}</summary>
        <LightingControls value={settings.lighting} onChange={changeLighting} language={language} />
      </details>
      {/* fork: physics adjustments (src/physics), also carried by the OBS URL */}
      <LivePhysics project={settings.project} value={settings.physics} onChange={physics => setSettings(current => ({ ...current, physics }))}
        avatar={avatarRef} ready={viewState === 'ready'} language={language} />
      </>)}
    </aside>
    <ShellRail group={shellGroup} onChange={setShellGroup} language={language} /></div>
    <footer className="app-status">
      <p role="status" data-testid="tracking-status" data-state={status}>{t[status]}</p>
      {backgroundStatus && <p role="alert" className="live-error" data-testid="background-status">{t[backgroundStatus]}</p>}
      {calibrated && <span className="app-status-note">{t.calibrated}</span>}
      {toast && <span className="app-status-note" role="status">{toast}</span>}
      <span className="app-status-fill" />
      <StatusMeters micLevel={micLevel} fps={fps} micOn={micState === 'micOn'} project={settings.project} language={language} />
      <span role="status" className={viewState === 'projectError' ? 'live-error' : 'app-status-project'}>{t[viewState]} · {settings.project}</span>
    </footer>
  </main>;
}
