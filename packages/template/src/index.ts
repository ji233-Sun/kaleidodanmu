import * as THREE from "three";
import { gsap } from "gsap";
import { defineEffect, assetUrl, type DanmakuEvent, type EffectViewport } from "@kaleido/sdk";

// 资源引用约定：把文件放到本工程的 assets/ 目录，运行时用 assetUrl("相对路径") 取得可用 URL。
// 例如： const tex = new THREE.TextureLoader().load(assetUrl("bg.png"));
// 上传时 CLI 会收集 assets/** 并写入 Manifest；运行时把它们注入为 blob URL。
void assetUrl;

interface Item {
  sprite: THREE.Sprite;
  texture: THREE.Texture;
  material: THREE.SpriteMaterial;
  tl: ReturnType<typeof gsap.timeline>;
}

export default defineEffect({
  setup({ canvas }) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    camera.position.z = 5;

    let viewport: EffectViewport = { width: 1, height: 1, dpr: 1 };
    let playing = true;
    const items = new Set<Item>();

    function makeTextTexture(text: string, color: string, fontSize: number) {
      const pad = 16;
      const measure = document.createElement("canvas").getContext("2d")!;
      measure.font = `700 ${fontSize}px sans-serif`;
      const width = Math.ceil(measure.measureText(text).width) + pad * 2;
      const height = fontSize + pad * 2;
      const surface = document.createElement("canvas");
      surface.width = width * 2;
      surface.height = height * 2;
      const ctx = surface.getContext("2d")!;
      ctx.scale(2, 2);
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.fillText(text, pad, height / 2);
      const texture = new THREE.CanvasTexture(surface);
      texture.colorSpace = THREE.SRGBColorSpace;
      return { texture, width, height };
    }

    function remove(item: Item) {
      item.tl.kill();
      scene.remove(item.sprite);
      item.texture.dispose();
      item.material.dispose();
      items.delete(item);
    }

    function resetAll() {
      for (const item of Array.from(items)) remove(item);
    }

    function spawn(event: DanmakuEvent) {
      if (items.size > 40) return; // 容量上限：达到后丢弃新事件，不淘汰仍在屏幕内的旧对象
      const rgb = event.color === 0xffffff ? 0x8dd8ff : event.color;
      const color = "#" + rgb.toString(16).padStart(6, "0");
      const fontSize = Math.max(20, event.fontSize || 28);
      const { texture, width, height } = makeTextTexture(event.text, color, fontSize);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(width, height, 1);

      const startX = viewport.width / 2 + width / 2 + 8;
      const endX = -viewport.width / 2 - width / 2 - 8;
      const laneCount = Math.max(1, Math.floor((viewport.height - height) / (height + 8)));
      const lane = event.seed % laneCount;
      const y = viewport.height / 2 - height / 2 - lane * (height + 8) - 8;
      sprite.position.set(startX, y, 0);
      scene.add(sprite);

      const speed = 120 + (event.seed % 80); // 像素/秒
      const item: Item = { sprite, texture, material, tl: gsap.timeline({ paused: !playing }) };
      // 完整穿屏：按路程/速度计算时长，真正越过左边界后才回收
      item.tl.to(sprite.position, {
        x: endX,
        duration: (startX - endX) / speed,
        ease: "none",
        onComplete: () => remove(item),
      });
      items.add(item);
    }

    return {
      onDanmaku(event) {
        spawn(event);
      },
      render() {
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
        for (const item of items) item.tl.paused(!next);
      },
      reset() {
        resetAll();
      },
      dispose() {
        resetAll();
        renderer.dispose();
      },
    };
  },
});
