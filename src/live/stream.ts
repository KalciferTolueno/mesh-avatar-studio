import { createAvatarView, neutralParameters } from './avatar-view';
import { viewSettings } from './settings';
import { LivePose } from './protocol';
import { receiveLighting, receiveLiveParameters } from './relay';
import { receivePhysics } from '../physics/settings';
import { receiveFrame } from './frame';
import { itemLayers, loadItems, receiveItems, type AvatarItem } from './items';
import { receiveBackground, showBackground, NO_BACKGROUND, type BackgroundImage } from './background';
import { announceStreamView } from './streamViews';
import './stream.css';

const settings = viewSettings(location.search);
document.documentElement.style.background = settings.background;
const canvas = document.querySelector<HTMLCanvasElement>('#avatar')!;
const pose = new LivePose(settings.project);
let avatarInstance: import('../engine').MeshAvatar | undefined;
const unsubscribeLighting = receiveLighting(settings.project, value => { settings.lighting = value; avatarInstance?.setLighting(value); });
// fork: live physics adjustments from the Live page (src/physics)
const unsubscribePhysics = receivePhysics(settings.project, value => { settings.physics = value; avatarInstance?.setPhysicsTuning(value); });
// fork: dragging / scrolling the avatar on the Live page moves it here too (src/live/frame.ts)
const unsubscribeFrame = receiveFrame(settings.project, value => { settings.frame = value; avatarInstance?.setFrame(value); });
// fork: accessories from the project folder, then live changes from the Live page (src/live/items.ts)
let items: AvatarItem[] | null = null;
const unsubscribeItems = receiveItems(settings.project, value => { items = value; void avatarInstance?.setItems(itemLayers(settings.project, value)); });
// fork: picture or video behind the avatar, from the URL and then live (src/live/background.ts)
let shownBackground: BackgroundImage = NO_BACKGROUND, hideBackground = () => {};
const setBackground = (value: BackgroundImage) => {
  if (value.file === shownBackground.file && value.fit === shownBackground.fit) return;
  hideBackground(); shownBackground = value; hideBackground = showBackground(canvas, settings.project, value);
};
if (settings.backgroundImage) setBackground(settings.backgroundImage);
const unsubscribeBackground = receiveBackground(settings.project, setBackground);
// fork: tells the Live page this OBS view is open (its status bar counts them)
const stopAnnouncing = announceStreamView(settings.project);
void loadItems(settings.project).then(value => { if (items) return; items = value; void avatarInstance?.setItems(itemLayers(settings.project, value)); });
const unsubscribe = receiveLiveParameters(data => pose.receive(data, performance.now()));
void createAvatarView(canvas, settings, (avatar, now, dt) => {
  const sampled = pose.sample(now, dt);
  canvas.dataset.live = sampled.active ? 'active' : 'idle';
  avatar.setAutoIdle(settings.idle && !sampled.active); avatar.setAutoMotion(settings.idle && !sampled.active);
  if (settings.idle) avatar.setParameters(sampled.params, sampled.weight);
  else {
    const params = { ...neutralParameters };
    for (const [key, value] of Object.entries(sampled.params)) params[key] = (params[key] ?? 0) * (1 - sampled.weight) + value * sampled.weight;
    avatar.setParameters(params);
  }
}).then(view => {
  avatarInstance = view.avatar;
  if (settings.frame) view.avatar.setFrame(settings.frame);
  if (items) void view.avatar.setItems(itemLayers(settings.project, items));
  if (settings.lighting) view.avatar.setLighting(settings.lighting);
  const destroy = () => { unsubscribe(); unsubscribeLighting(); unsubscribePhysics(); unsubscribeFrame(); unsubscribeItems(); unsubscribeBackground(); hideBackground(); stopAnnouncing(); avatarInstance = undefined; view.destroy(); };
  window.addEventListener('pagehide', destroy, { once: true });
  import.meta.hot?.dispose(destroy);
}).catch(() => { unsubscribe(); unsubscribeLighting(); unsubscribePhysics(); unsubscribeFrame(); unsubscribeItems(); unsubscribeBackground(); stopAnnouncing(); canvas.dataset.state = 'error'; });
