import type * as Three from "three";
import type { gsap as gsapInstance } from "gsap";
import type { DanmakuEvent, Recipe } from "@/lib/types";

export interface EffectViewport {
  width: number;
  height: number;
  dpr: number;
}

export interface EffectFrame {
  now: number;
  delta: number;
}

export interface EffectSetupContext {
  canvas: HTMLCanvasElement;
  recipe: Recipe;
  THREE: typeof Three;
  gsap: typeof gsapInstance;
}

export interface EffectInstance {
  onDanmaku(event: DanmakuEvent): void;
  render(frame: EffectFrame): void;
  resize(viewport: EffectViewport): void;
  setPlaying?(playing: boolean): void;
  reset?(): void;
  dispose(): void;
}

export interface EffectDefinition {
  setup(context: EffectSetupContext): EffectInstance;
}

export type RuntimeCommand =
  | { type: "load"; source: string; recipe: Recipe; playing: boolean }
  | { type: "danmaku"; event: DanmakuEvent }
  | { type: "playing"; playing: boolean }
  | { type: "reset" };

export type RuntimeEvent =
  | { type: "ready" }
  | { type: "fps"; value: number }
  | { type: "error"; message: string };

const IMPORT_PATTERNS = [
  /^\s*import\s+\*\s+as\s+THREE\s+from\s+["']three["'];?\s*$/gm,
  /^\s*import\s+\{\s*gsap\s*\}\s+from\s+["']gsap["'];?\s*$/gm,
  /^\s*import\s+\{\s*defineEffect\s*\}\s+from\s+["']@kaleido\/sdk["'];?\s*$/gm,
];

const FORBIDDEN_SOURCE = [
  { pattern: /\bfetch\s*\(/, label: "fetch" },
  { pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
  { pattern: /\bWebSocket\b/, label: "WebSocket" },
  { pattern: /\bEventSource\b/, label: "EventSource" },
  { pattern: /\bsendBeacon\b/, label: "sendBeacon" },
  { pattern: /\bimport\s*\(/, label: "动态 import" },
  { pattern: /\bdocument\.cookie\b/, label: "Cookie" },
  { pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/, label: "持久化存储" },
  { pattern: /\b(?:Worker|SharedWorker)\b/, label: "Worker" },
  { pattern: /\bwindow\.(?:parent|top|opener)\b/, label: "父页面访问" },
  { pattern: /\bpostMessage\s*\(/, label: "消息通道访问" },
];

/**
 * 对 Agent 生成的入口做静态边界校验。真正执行仍发生在无同源权限的 iframe 中。
 */
export function validateEffectSource(source: string): void {
  if (!source.trim()) throw new Error("index.ts 不能为空");
  if (source.length > 20_000) throw new Error("index.ts 不能超过 20000 字符");

  for (const { pattern, label } of FORBIDDEN_SOURCE) {
    if (pattern.test(source)) throw new Error(`index.ts 不允许使用 ${label}`);
  }

  let body = source;
  for (const pattern of IMPORT_PATTERNS) body = body.replace(pattern, "");
  if (/\bimport\s/.test(body)) {
    throw new Error("index.ts 只能导入 three、gsap 和 @kaleido/sdk");
  }
  if (!/export\s+default\s+defineEffect\s*\(/.test(body)) {
    throw new Error("index.ts 必须默认导出 defineEffect(...) ");
  }
  if (!/\bsetup\s*\(/.test(body) || !/\bonDanmaku\s*\(/.test(body)) {
    throw new Error("Effect 必须实现 setup() 和 onDanmaku() 生命周期");
  }
  if (/\bexport\s+(?!default\s+defineEffect)/.test(body)) {
    throw new Error("index.ts 只允许一个默认导出");
  }
}

/** 将受限 ESM 入口转换成 iframe 内可执行的工厂函数体。 */
export function transformEffectSource(source: string): string {
  validateEffectSource(source);
  let body = source;
  for (const pattern of IMPORT_PATTERNS) body = body.replace(pattern, "");
  return body.replace(/export\s+default\s+/, "return ");
}

/**
 * ADE 新工程的可执行入口。配方由上下文注入，弹幕通过 onDanmaku 单向进入。
 */
export const DEFAULT_EFFECT_SOURCE = `import * as THREE from "three";
import { gsap } from "gsap";
import { defineEffect } from "@kaleido/sdk";

export default defineEffect({
  setup({ canvas, recipe }) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    camera.position.z = 2;
    const active = new Set();
    let viewport = { width: 1, height: 1, dpr: 1 };
    let playing = true;

    function colorFor(event) {
      if (event.color !== 0xffffff) return "#" + event.color.toString(16).padStart(6, "0");
      return recipe.palette[event.seed % recipe.palette.length];
    }

    function createLabel(event) {
      const surface = document.createElement("canvas");
      const context = surface.getContext("2d");
      const fontSize = Math.max(18, event.fontSize * recipe.shardScale);
      context.font = "700 " + fontSize + "px sans-serif";
      const width = Math.ceil(context.measureText(event.text).width + 32);
      surface.width = Math.min(1024, width * 2);
      surface.height = Math.ceil((fontSize + 24) * 2);
      context.scale(2, 2);
      context.font = "700 " + fontSize + "px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.shadowColor = colorFor(event);
      context.shadowBlur = 7;
      context.fillStyle = colorFor(event);
      context.fillText(event.text, surface.width / 4, surface.height / 4);
      const texture = new THREE.CanvasTexture(surface);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        blending: THREE.NormalBlending,
      });
      return { texture, material, width: surface.width / 2, height: surface.height / 2 };
    }

    function remove(item) {
      item.timeline.kill();
      scene.remove(item.group);
      item.texture.dispose();
      item.material.dispose();
      active.delete(item);
    }

    function reset() {
      for (const item of Array.from(active)) remove(item);
      renderer.clear();
    }

    return {
      onDanmaku(event) {
        const baseCap = viewport.width < 480 ? 4 : 8;
        const cap = Math.max(3, Math.floor(baseCap * recipe.density));
        if (active.size >= cap) remove(active.values().next().value);

        const label = createLabel(event);
        const group = new THREE.Group();
        const symmetry = Math.max(3, Math.min(12, recipe.symmetry));
        const state = {
          radius: recipe.motion === "orbit" ? Math.min(viewport.width, viewport.height) * 0.24 : 52,
          angle: (event.seed % 6283) / 1000,
          opacity: 0,
          scale: 0.55,
        };
        for (let index = 0; index < symmetry; index += 1) {
          const sprite = new THREE.Sprite(label.material);
          sprite.userData.offset = (index * Math.PI * 2) / symmetry;
          sprite.scale.set(label.width, label.height, 1);
          group.add(sprite);
        }
        scene.add(group);

        const item = { group, material: label.material, texture: label.texture, state, timeline: null };
        const distance = Math.hypot(viewport.width, viewport.height) * 0.48;
        const direction = recipe.rotationSpeed < 0 ? -1 : 1;
        item.timeline = gsap.timeline({
          paused: !playing,
          onComplete: () => remove(item),
        });
        item.timeline
          .to(state, { opacity: 0.72, scale: 0.92, duration: 0.22, ease: "power2.out" })
          .to(state, {
            radius: recipe.motion === "orbit" ? state.radius : distance,
            angle: state.angle + direction * Math.PI * (recipe.motion === "burst" ? 0.18 : 1.5),
            duration: 3.2,
            ease: recipe.motion === "burst" ? "power3.out" : "none",
          }, 0)
          .to(state, { opacity: 0, scale: 1.08, duration: 0.7, ease: "power2.in" }, 2.5);
        active.add(item);
      },
      render({ delta }) {
        const spin = recipe.rotationSpeed * Math.PI * 2 * (delta / 1000);
        for (const item of active) {
          item.group.rotation.z += spin;
          item.material.opacity = item.state.opacity;
          const viewportScale = Math.min(1, viewport.width / 640);
          for (const sprite of item.group.children) {
            const angle = item.state.angle + sprite.userData.offset;
            sprite.position.set(
              Math.cos(angle) * item.state.radius,
              Math.sin(angle) * item.state.radius,
              0,
            );
            sprite.scale.set(
              (item.material.map.image.width / 2) * item.state.scale * viewportScale,
              (item.material.map.image.height / 2) * item.state.scale * viewportScale,
              1,
            );
            sprite.material.rotation = angle + Math.PI / 2;
          }
        }
        renderer.render(scene, camera);
      },
      resize(next) {
        viewport = next;
        renderer.setPixelRatio(next.dpr);
        renderer.setSize(next.width, next.height, false);
        camera.left = -next.width / 2;
        camera.right = next.width / 2;
        camera.top = next.height / 2;
        camera.bottom = -next.height / 2;
        camera.updateProjectionMatrix();
      },
      setPlaying(next) {
        playing = next;
        for (const item of active) item.timeline.paused(!next);
      },
      reset,
      dispose() {
        reset();
        renderer.dispose();
      },
    };
  },
});
`;
