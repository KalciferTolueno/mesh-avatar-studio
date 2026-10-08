import { LightingControls, LightHandle, lightingText } from '../lighting/Controls';
import { loadLighting, saveLighting } from '../lighting/settings';
import { LivePhysics } from '../physics/LivePhysics';
import { LiveAnimations, LiveExpressions } from '../expressions/LiveExpressions';
import { ExpressionMixer } from '../expressions/presets';
import { AnimationPlayer } from '../expressions/animations';
import { LifeLayer } from '../expressions/life';
import { VowelDetector, VowelMouth } from '../expressions/vowels';
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

const OPTIONS_KEY = 'mesh-avatar-live-tracking';
// like VTube Studio's sample models: pitch ±20° -> ±30°, livelier brows, blush and wide eyes on
const EXPRESSION_DEFAULTS = { pitchBoost: 1.4, eyeWideGain: 1, browGain: 1.3, blushGain: 0.5, smileEyes: 1, breathing: 0.8, blinkMode: 'both' as const, voiceVowels: true, vowelSmooth: 0.5, vowelStrength: 0.85 };
const DEFAULT_OPTIONS: Required<TrackingOptions> = { mirror: true, sensitivity: 1, smoothing: 0.35, mouthSensitivity: 1.5, linkEyes: true, bodySensitivity: 1, screenMove: 1, limitSide: 1, limitUp: 1, limitDown: 1, limitIn: 1, limitOut: 1, limitLeanForward: 0.6, limitLeanBack: 0.6, ...EXPRESSION_DEFAULTS };
const MOVEMENT_DEFAULTS = { screenMove: 1, bodySensitivity: 1, limitSide: 1, limitUp: 1, limitDown: 1, limitIn: 1, limitOut: 1, limitLeanForward: 0.6, limitLeanBack: 0.6 };
// Tracking adjustments are a per-browser convenience; anything unreadable falls back to defaults.
function loadTrackingOptions(): Required<TrackingOptions> {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}');
    return Object.fromEntries(Object.entries(DEFAULT_OPTIONS).map(([key, value]) =>
      [key, typeof saved[key] === typeof value && (typeof value !== 'number' || Number.isFinite(saved[key])) ? saved[key] : value])) as Required<TrackingOptions>;
  } catch { return { ...DEFAULT_OPTIONS }; }
}

export function LiveApp() {
  const { language, setLanguage } = useI18n(), t = liveText[language];
  const [settings, setSettings] = useState(() => { const view = viewSettings(location.search); return { ...view, lighting: view.lighting ?? loadLighting(view.project), physics: view.physics ?? loadPhysics(view.project) }; });
  const [lightingOpen, setLightingOpen] = useState(false);
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
  const pose = useRef(new FacePose());
  const expressions = useRef(new ExpressionMixer());
  const animations = useRef(new AnimationPlayer());
  const life = useRef(new LifeLayer());
  const vowels = useRef(new VowelDetector());
  const vowelMouth = useRef(new VowelMouth());
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
      avatar.setAutoIdle(!sampled.tracking); avatar.setAutoMotion(!sampled.tracking);
      // fork: expressions toggled with keys sit on top of tracking (src/expressions)
      // and so do animations on keys (src/expressions/animations.ts)
      const mixer = expressions.current, player = animations.current; mixer.step(dt); player.step(dt);
      // breathing and blinking while tracking (src/expressions/life.ts); idle motion does it otherwise
      const tracked = sampled.tracking ? life.current.apply(sampled.params, dt, { breathing: control.options.breathing ?? 0.8, blinkMode: control.options.blinkMode ?? 'both' }) : sampled.params;
      // the microphone's vowels shape the drawn mouths while speaking (src/expressions/vowels.ts)
      const micOn = control.micState === 'micOn', level = micOn ? microphone.current?.level(control.gain) ?? 0 : 0;
      const spectrum = micOn && (control.options.voiceVowels ?? true) ? microphone.current?.spectrum() : null;
      const vowel = spectrum ? vowels.current.detect(spectrum.data, spectrum.binHz, level, dt) : null;
      const smooth = control.options.vowelSmooth ?? 0.5;
      const form = vowelMouth.current.step(vowel, dt, smooth, control.options.vowelStrength ?? 0.85);
      avatar.setMouthBlend(0.03 + 0.15 * smooth);
      avatar.setVoiceVowel(vowel);
      const voice: Record<string, number> = form === null ? {} : { mouthForm: form };
      if (sampled.tracking || !(mixer.any() || player.any() || form !== null)) avatar.setParameters({ ...mixer.apply(player.apply(tracked)), ...voice }, sampled.weight);
      else {
        // without the camera, only what they drive is set; idle motion keeps the rest alive
        const all = mixer.apply(player.apply(neutralParameters));
        avatar.setParameters({ ...Object.fromEntries([...new Set([...mixer.touched(), ...player.touched()])].map(key => [key, all[key]])), ...voice }, 1);
      }
      avatar.setSpeaking(micOn); avatar.setVoiceLevel(level);
    }, (avatar, now) => {
      if (controls.current.cameraState === 'running' || controls.current.micState === 'micOn' || expressions.current.any() || animations.current.any()) send(avatar.getParameters(), now);
    }).then(value => { if (cancelled) value.destroy(); else { view = value; avatarRef.current = value.avatar; value.avatar.setLighting(lightRef.current); setViewState('ready'); } }).catch(() => { if (!cancelled) setViewState('projectError'); });
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
  const changeLighting = (lighting: typeof settings.lighting) => setSettings(current => ({ ...current, lighting }));
  const cameraActive = cameraState === 'starting' || cameraState === 'running';
  const micActive = micState === 'micStarting' || micState === 'micOn';
  const url = streamUrl(settings, location.origin);
  const status = cameraState === 'running' ? tracking ? 'tracking' : 'lost' : cameraState;
  return <main className="live-app">
    {/* fork: Edit / Live switch and theme toggle (src/theme/ThemeControls.tsx); the back link keeps its name */}
    <header className="live-header"><div className="live-header-actions"><h1>Mesh Avatar Studio</h1>
      <ModeSwitch language={language} current="live" edit={<a href="/" aria-label={t.back}>{themeLabel(language)}</a>} /></div>
      <div className="live-header-actions"><ThemeToggle language={language} />
      <div className="live-languages">{(['es', 'en', 'ja', 'zh'] as const).map(lang => <button key={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)}>{({ es: 'Español', en: 'English', ja: '日本語', zh: '简体中文' })[lang]}</button>)}</div></div>
    </header>
    <div className="live-layout"><section className="live-view"><div className="live-preview checkerboard lighting-preview" style={{ backgroundColor: settings.background, backgroundImage: settings.background === 'transparent' ? undefined : 'none' }}>
      <canvas ref={canvas} data-testid="live-avatar" />
      {lightingOpen && <LightHandle value={settings.lighting} onChange={changeLighting} language={language} />}
    </div><p role="status" className={viewState === 'projectError' ? 'live-error' : ''}>{t[viewState]} · {settings.project}</p></section>
    <aside className="live-controls">
      <section><h2>{t.camera}</h2><label>{t.device}<select aria-label={t.camera} value={cameraId} disabled={cameraActive} onChange={event => setCameraId(event.target.value)}><option value="">{t.defaultDevice}</option>{devices.filter(device => device.kind === 'videoinput' && device.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${t.camera} ${i + 1}`}</option>)}</select></label>
        <div className="live-buttons"><button className="live-primary" disabled={!cameraActive && viewState !== 'ready'} onClick={() => {
          setCalibrated(false); pose.current.reset();
          if (cameraActive) camera.current?.stop(); else void camera.current?.start(cameraId).then(refreshDevices);
        }}>{cameraActive ? t.stop : t.start}</button><button disabled={!tracking} onClick={() => setCalibrated(pose.current.calibrate(performance.now()))}>{t.calibrate}</button></div>
        <p role="status" data-testid="tracking-status" data-state={status}>{t[status]}</p>
        {backgroundStatus && <p role="alert" className="live-error" data-testid="background-status">{t[backgroundStatus]}</p>}
        <small>{calibrated ? t.calibrated : t.calibrateHint}</small>
        <label className="live-check"><input type="checkbox" checked={options.mirror} onChange={event => setOptions(current => ({ ...current, mirror: event.target.checked }))} />{t.mirror}</label>
        <label>{t.sensitivity}<input type="range" min="0.25" max="2" step="0.05" value={options.sensitivity} onChange={event => setOptions(current => ({ ...current, sensitivity: Number(event.target.value) }))} /></label>
        <label>{t.mouthSensitivity}<input type="range" min="0.5" max="3" step="0.05" value={options.mouthSensitivity} onChange={event => setOptions(current => ({ ...current, mouthSensitivity: Number(event.target.value) }))} /></label>
        <label className="live-check"><input type="checkbox" checked={options.linkEyes} onChange={event => setOptions(current => ({ ...current, linkEyes: event.target.checked }))} />{t.linkEyes}</label>
        <label>{t.smoothing}<input type="range" min="0" max="1" step="0.05" value={options.smoothing} onChange={event => setOptions(current => ({ ...current, smoothing: Number(event.target.value) }))} /></label>
        <label className="live-check"><input type="checkbox" checked={showCamera} onChange={event => setShowCamera(event.target.checked)} />{t.cameraPreview}</label>
        <video ref={video} autoPlay muted playsInline className={showCamera ? 'camera-preview' : 'camera-preview camera-hidden'} style={{ transform: options.mirror ? 'scaleX(-1)' : undefined }} aria-label={t.cameraPreview} />
      </section>
      <section><h2>{t.microphone}</h2><label className="live-check"><input type="checkbox" checked={micActive} disabled={!micActive && viewState !== 'ready'} onChange={event => { if (event.target.checked) void microphone.current?.start(micId).then(refreshDevices); else microphone.current?.stop(); }} />{t.microphone}</label>
        <select aria-label={t.microphone} value={micId} disabled={micActive} onChange={event => setMicId(event.target.value)}><option value="">{t.defaultDevice}</option>{devices.filter(device => device.kind === 'audioinput' && device.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${t.microphone} ${i + 1}`}</option>)}</select>
        <label className="live-check"><input type="checkbox" checked={options.voiceVowels} onChange={event => setOptions(current => ({ ...current, voiceVowels: event.target.checked }))} />{t.voiceVowels}</label>
        {(['vowelSmooth', 'vowelStrength'] as const).map(key => <label key={key}>{t[key]}<input type="range" min="0" max="1" step="0.05" value={options[key]} disabled={!options.voiceVowels} onChange={event => setOptions(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
        <label>{t.gain}<input type="range" min="0.25" max="5" step="0.05" value={gain} onChange={event => setGain(Number(event.target.value))} /></label><small role="status">{t[micState]}</small>
      </section>
      <section><h2>{t.background}</h2><select aria-label={t.background} value={settings.background} onChange={event => setSettings(current => ({ ...current, background: backgroundColor(event.target.value) }))}>
        <option value="transparent">{t.transparent}</option><option value="#00ff00">{t.green}</option><option value="#0000ff">{t.blue}</option>{!['transparent', '#00ff00', '#0000ff'].includes(settings.background) && <option value={settings.background}>{t.custom}</option>}
      </select><label>{t.custom}<input type="color" value={settings.background === 'transparent' ? '#ffffff' : settings.background} onChange={event => setSettings(current => ({ ...current, background: event.target.value }))} /></label>
        <label>{t.fit}<select value={settings.fit} onChange={event => setSettings(current => ({ ...current, fit: event.target.value as 'contain' | 'cover' }))}><option value="contain">{t.contain}</option><option value="cover">{t.cover}</option></select></label>
        <div className="live-buttons"><button className="live-primary" onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopyState('copied')).catch(() => setCopyState('copyError')); }}>{t.obs}</button>
        <a className="live-open" href={url} target="_blank" rel="noreferrer">{t.openStream}</a></div>
        {copyState && <p role="status">{t[copyState]}</p>}<input className="obs-url" aria-label={t.obs} readOnly value={url} onFocus={event => event.target.select()} /><small>{t.obsHelp}</small>
      </section>
      {/* fork: expressions on keys, like VTube Studio's hotkeys (FORK.md 14) */}
      <LiveExpressions mixer={expressions} language={language} />
      <LiveAnimations player={animations} language={language} />
      {/* fork: everything that moves the avatar on screen, with its limits (FORK.md 11, 12) */}
      <details className="live-lighting live-movement" data-testid="movement-section" open>
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
      <details className="live-lighting" data-testid="lighting-section" onToggle={event => setLightingOpen(event.currentTarget.open)}>
        <summary><Icon name="light" />{lightingText[language].title}{settings.lighting.enabled && <span className="lighting-on">ON</span>}</summary>
        <LightingControls value={settings.lighting} onChange={changeLighting} language={language} />
      </details>
      {/* fork: physics adjustments (src/physics), also carried by the OBS URL */}
      <LivePhysics project={settings.project} value={settings.physics} onChange={physics => setSettings(current => ({ ...current, physics }))}
        avatar={avatarRef} ready={viewState === 'ready'} language={language} />
      <p className="live-privacy">{t.privacy}</p>
    </aside></div>
  </main>;
}
