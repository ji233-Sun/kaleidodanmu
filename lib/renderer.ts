import type { DanmakuEvent, Recipe } from "./types";
import { mulberry32, pick } from "./random";

interface Shard {
  text: string;
  color: string;
  fontSize: number;
  born: number;
  life: number;
  angle0: number;
  radius0: number;
  drift: number;
  seed: number;
}

/**
 * 旧版兼容渲染器：把弹幕事件按配方渲染为对称动效。
 * 原型用 Canvas 2D；之后 WebGL/Three.js 图层在同一生命周期下扩展。
 */
export class KaleidoRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private recipe: Recipe;
  private shards: Shard[] = [];
  private raf = 0;
  private running = false;
  private playing = true;
  private rotation = 0;
  private lastFrame = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsClock = 0;
  onFps?: (fps: number) => void;

  constructor(canvas: HTMLCanvasElement, recipe: Recipe) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D not supported");
    this.ctx = ctx;
    this.recipe = recipe;
    this.resize();
  }

  setRecipe(recipe: Recipe) {
    this.recipe = recipe;
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
  }

  getFps() {
    return this.fps;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth, clientHeight } = this.canvas;
    this.canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  emit(event: DanmakuEvent) {
    const rand = mulberry32(event.seed);
    const maxR = Math.hypot(this.canvas.clientWidth, this.canvas.clientHeight) / 2;
    const cap = Math.floor(200 * this.recipe.density);
    if (this.shards.length >= cap) this.shards.splice(0, this.shards.length - cap + 1);
    const hex = "#" + event.color.toString(16).padStart(6, "0");
    this.shards.push({
      text: event.text,
      color:
        event.color === 0xffffff
          ? pick(rand, this.recipe.palette)
          : hex,
      fontSize: event.fontSize,
      born: performance.now(),
      life: 3600 + rand() * 2400,
      angle0: rand() * Math.PI * 2,
      radius0: this.recipe.motion === "orbit" ? maxR * (0.25 + rand() * 0.45) : maxR * 0.08,
      drift: 0.5 + rand(),
      seed: event.seed,
    });
  }

  clear() {
    this.shards = [];
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.ctx.clearRect(0, 0, w, h);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(64, now - this.lastFrame);
      this.lastFrame = now;
      this.fpsFrames++;
      this.fpsClock += dt;
      if (this.fpsClock >= 500) {
        this.fps = Math.round((this.fpsFrames * 1000) / this.fpsClock);
        this.fpsFrames = 0;
        this.fpsClock = 0;
        this.onFps?.(this.fps);
      }
      if (this.playing) {
        this.rotation += (this.recipe.rotationSpeed * Math.PI * 2 * dt) / 1000;
        this.draw(now);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private draw(now: number) {
    const { ctx } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(w, h) / 2;
    const { symmetry, motion, trail, shardScale } = this.recipe;

    // 拖影：以 destination-out 低透明度擦除，保留透明底（视频在 canvas 下层）
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0,0,0,${(1 - trail * 0.85).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";

    this.shards = this.shards.filter((s) => now - s.born < s.life);

    for (const s of this.shards) {
      const t = (now - s.born) / s.life;
      const fade = t < 0.12 ? t / 0.12 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      let r: number;
      let ang: number;
      if (motion === "spiral") {
        r = s.radius0 + maxR * 0.75 * t * s.drift;
        ang = s.angle0 + t * 2.2 * s.drift;
      } else if (motion === "burst") {
        r = s.radius0 + maxR * 0.85 * (1 - Math.pow(1 - t, 3)) * s.drift;
        ang = s.angle0;
      } else if (motion === "orbit") {
        r = s.radius0;
        ang = s.angle0 + t * 1.6 * s.drift;
      } else {
        // flow：从中心一侧穿向另一侧
        r = s.radius0 + maxR * 0.9 * t * s.drift;
        ang = s.angle0 + Math.sin(t * Math.PI) * 0.35;
      }
      const scale = shardScale * (0.75 + 0.45 * Math.sin(t * Math.PI));
      ctx.font = `700 ${Math.round(s.fontSize * scale)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < symmetry; i++) {
        const a = ang + this.rotation + (i * Math.PI * 2) / symmetry;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade * 0.92);
        ctx.translate(x, y);
        ctx.rotate(a + Math.PI / 2);
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, 0, 0);
        ctx.restore();
      }
    }
  }
}
