// Fork addition (see FORK.md): breathing and blinking that keep the avatar alive while the
// camera tracks it, like VTube Studio's UseBreathing / UseBlinking.

export type BlinkMode = 'camera' | 'auto' | 'both';
export interface LifeOptions { breathing: number; blinkMode: BlinkMode }

const BLINK_CLOSE = 0.07, BLINK_HOLD = 0.04, BLINK_OPEN = 0.13;

export class LifeLayer {
  private phase = 0;
  private period = 3.8;
  private time = 0;
  private blinkAt = 2;
  private blinkStart = -1;
  private lastTracked = 0;
  private random: () => number;
  constructor(random: () => number = Math.random) { this.random = random; }
  /** Openness 0..1 of the generated blink at the current time. */
  private blink(): number {
    if (this.blinkStart < 0) return 1;
    const t = this.time - this.blinkStart;
    if (t < BLINK_CLOSE) return 1 - t / BLINK_CLOSE;
    if (t < BLINK_CLOSE + BLINK_HOLD) return 0;
    if (t < BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN) return (t - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN;
    this.blinkStart = -1;
    return 1;
  }
  private schedule() { this.blinkAt = this.time + 2.2 + this.random() * 3.8; }
  /** Tracked parameters with breathing and blinking added. */
  apply(params: Record<string, number>, dt: number, options: LifeOptions): Record<string, number> {
    const out = { ...params };
    this.time += Math.max(0, dt);
    // breathing: an uneven in-out cycle every 3–5 s; the head rides along a little
    this.phase += Math.max(0, dt) / this.period;
    if (this.phase >= 1) { this.phase -= 1; this.period = 3.2 + this.random() * 1.6; }
    const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.phase);
    const amount = Math.max(0, Math.min(1, options.breathing));
    out.breath = breath * amount;
    out.angleY = (out.angleY ?? 0) + breath * 1.5 * amount;
    // blinking: the camera's own blinks, generated ones, or generated ones as a backup
    const tracked = Math.min(out.eyeLOpen ?? 1, out.eyeROpen ?? 1);
    if (tracked < 0.3) this.lastTracked = this.time;
    if (options.blinkMode === 'camera') return out;
    const due = this.time >= this.blinkAt && (options.blinkMode === 'auto' || this.time - this.lastTracked > 4);
    if (due && this.blinkStart < 0) { this.blinkStart = this.time; this.schedule(); }
    else if (this.time >= this.blinkAt) this.schedule();
    const b = this.blink();
    for (const key of ['eyeLOpen', 'eyeROpen']) {
      const base = options.blinkMode === 'auto' ? Math.max(out[key] ?? 1, 1) : out[key] ?? 1;
      out[key] = Math.min(base, b * Math.max(1, base));
    }
    return out;
  }
}
