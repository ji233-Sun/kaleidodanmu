// 本地开发预览（仅 dev 使用，不参与 build.lib 打包）。
// 直接在页面里运行 Effect，注入 mock 弹幕、显示 FPS 与错误，并支持 Vite HMR。
import * as THREE from "three";
import { gsap } from "gsap";
import type { DanmakuEvent, EffectDefinition, EffectInstance } from "@kaleido/sdk";
import effectDef from "../src/index";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const recipe = {
  symmetry: 6,
  rotationSpeed: 0,
  motion: "flow" as const,
  palette: ["#081229", "#8dd8ff"],
  shardScale: 1,
  trail: 0.2,
  density: 1,
};

let effect: EffectInstance | null = null;
let raf = 0;
let last = performance.now();
let frames = 0;
let fpsAt = performance.now();

function viewport() {
  return {
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  };
}

function unmount() {
  cancelAnimationFrame(raf);
  raf = 0;
  try {
    effect?.dispose();
  } catch {
    /* ignore */
  }
  effect = null;
}

function mount(def: EffectDefinition) {
  unmount();
  try {
    effect = def.setup({ canvas, recipe, THREE, gsap });
    effect.resize(viewport());
    effect.setPlaying?.(true);
    hud.textContent = "运行中";
    last = performance.now();
    raf = requestAnimationFrame(loop);
  } catch (e) {
    hud.textContent = "setup 出错：" + (e instanceof Error ? e.message : String(e));
  }
}

function loop(now: number) {
  raf = requestAnimationFrame(loop);
  const delta = Math.min(64, now - last);
  last = now;
  if (!effect) return;
  try {
    effect.render({ now, delta });
  } catch (e) {
    hud.textContent = "render 出错：" + (e instanceof Error ? e.message : String(e));
    unmount();
    return;
  }
  frames += 1;
  if (now - fpsAt >= 500) {
    hud.textContent = "运行中 · " + Math.round((frames * 1000) / (now - fpsAt)) + " fps";
    frames = 0;
    fpsAt = now;
  }
}

const WORDS = ["万花筒", "弹幕来了", "666", "前方高能", "Canvas!", "主播牛", "哈哈哈哈", "打卡"];
let seed = 1;
const timer = setInterval(() => {
  if (!effect?.onDanmaku) return;
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  const event: DanmakuEvent = {
    id: "m" + seed,
    source: "live",
    text: WORDS[seed % WORDS.length],
    receivedAt: Date.now(),
    mode: "scroll",
    color: 0xffffff,
    fontSize: 28,
    weight: 400,
    seed,
  };
  try {
    effect.onDanmaku(event);
  } catch (e) {
    hud.textContent = "onDanmaku 出错：" + (e instanceof Error ? e.message : String(e));
  }
}, 500);

new ResizeObserver(() => {
  try {
    effect?.resize(viewport());
  } catch {
    /* ignore */
  }
}).observe(canvas);

mount(effectDef as EffectDefinition);

if (import.meta.hot) {
  import.meta.hot.accept("../src/index", (mod) => {
    if (mod) mount((mod as unknown as { default: EffectDefinition }).default);
  });
  import.meta.hot.dispose(() => {
    clearInterval(timer);
    unmount();
  });
}
