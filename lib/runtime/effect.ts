// Effect 生命周期与运行时协议类型现由 @kaleido/sdk 统一定义；这里 re-export 以保持既有导入路径。
export type {
  EffectViewport,
  EffectFrame,
  EffectPointerEvent,
  EffectSetupContext,
  EffectInstance,
  EffectDefinition,
  RuntimeCommand,
  RuntimeEvent,
  RuntimeAsset,
} from "@kaleido/sdk";

import { LIMITS } from "@/types/manifest";

/** 允许的裸依赖说明符；其余（相对路径、URL、其他包）一律拒绝。 */
export const ALLOWED_SPECIFIERS = ["three", "gsap", "@kaleido/sdk"] as const;

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

/** 提取所有 `... from "x"` 与副作用 `import "x"` 的模块说明符。 */
function extractSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const re of [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) specs.push(match[1]);
  }
  return specs;
}

/**
 * 对 Effect 入口做静态安全校验。入口是真 ESM（ADE 原始源或 CLI 打包产物均可）。
 * 结构正确性（默认导出 + setup()）由运行时加载后检查，这里只负责安全边界：
 * 体积、禁用 API、以及裸依赖白名单。运行时最终防线是 iframe 沙箱 + CSP。
 */
export function validateEffectSource(source: string): void {
  if (!source.trim()) throw new Error("入口不能为空");
  if (source.length > LIMITS.maxEntryBytes) {
    throw new Error(`入口不能超过 ${LIMITS.maxEntryBytes} 字节`);
  }
  for (const { pattern, label } of FORBIDDEN_SOURCE) {
    if (pattern.test(source)) throw new Error(`入口不允许使用 ${label}`);
  }
  for (const spec of extractSpecifiers(source)) {
    if (!ALLOWED_SPECIFIERS.includes(spec as (typeof ALLOWED_SPECIFIERS)[number])) {
      throw new Error(`入口只能导入 ${ALLOWED_SPECIFIERS.join("、")}，检测到：${spec}`);
    }
  }
}

/**
 * 把入口里的裸依赖 import 重写为运行时可加载的 vendor URL（配合 blob + 原生 import()）。
 * 只重写白名单说明符；validateEffectSource 已保证不存在其它导入。
 */
export function rewriteEffectImports(source: string, vendor: Record<string, string>): string {
  return source.replace(
    /\b(from|import)(\s*)(["'])(three|gsap|@kaleido\/sdk)\3/g,
    (_full, keyword: string, ws: string, quote: string, name: string) =>
      `${keyword}${ws}${quote}${vendor[name] ?? name}${quote}`,
  );
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
        // 容量压力不能让仍在播放的旧对象突然消失；本次新事件直接丢弃。
        if (active.size >= cap) return;

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
