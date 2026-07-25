import * as THREE from "three";
import { defineEffect, assetUrl, type DanmakuEvent, type EffectViewport } from "kdanmu-sdk";

// ---------- 素材 ----------
// 僵尸改用随包 PNG（assets/zombie.png），演示静态资源链路；豌豆/汁液仍用内联 SVG。

const PEA_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <circle cx="14" cy="14" r="11" fill="#57c14f" stroke="#2f8a2b" stroke-width="2"/>
  <circle cx="10" cy="10" r="3.5" fill="#a9e89f"/>
  <path d="M22 8 Q26 4 25 10" stroke="#2f8a2b" stroke-width="2" fill="none"/>
</svg>`;

const SPLAT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <g fill="#6fd35f">
    <circle cx="24" cy="24" r="10"/>
    <circle cx="10" cy="18" r="4"/><circle cx="38" cy="16" r="5"/>
    <circle cx="14" cy="36" r="5"/><circle cx="36" cy="34" r="4"/>
    <circle cx="24" cy="8" r="4"/><circle cx="24" cy="40" r="3"/>
  </g>
  <circle cx="24" cy="24" r="5" fill="#c9f2b8"/>
</svg>`;

/**
 * 关键：canvas 必须一开始就是最终尺寸。精灵首帧上屏时 three 会按当时的 canvas
 * 尺寸分配 GPU 纹理（WebGL2 为不可变存储），之后再改 canvas 尺寸会导致
 * GL_INVALID_VALUE，贴图永远空白。图像异步加载完成后只重绘内容、不改尺寸。
 */
function imageTexture(src: string, width: number, height: number) {
  const surface = document.createElement("canvas");
  surface.width = width * 2;
  surface.height = height * 2;
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const ctx = surface.getContext("2d")!;
    ctx.drawImage(img, 0, 0, surface.width, surface.height);
    texture.needsUpdate = true;
  };
  img.src = src;
  return texture;
}

function svgTexture(svg: string, width: number, height: number) {
  return imageTexture(
    "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg))),
    width,
    height,
  );
}

const LANE_H = 110;
const ZOMBIE_W = 80;
const ZOMBIE_H = 100;
const PEA_SIZE = 28;
const HIT_DIST = 30;
const ZOMBIE_HP = 3;

interface Zombie {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  hpBar: THREE.Sprite;
  hpMat: THREE.SpriteMaterial;
  lane: number;
  x: number;
  speed: number;
  hp: number;
  state: "walk" | "dying";
  t: number; // 步行相位 / 死亡进度
  flash: number;
}

interface Bullet {
  pea: THREE.Sprite;
  text: THREE.Sprite;
  peaMat: THREE.SpriteMaterial;
  textMat: THREE.SpriteMaterial;
  textTex: THREE.Texture;
  lane: number;
  x: number; // 豌豆中心 x
  speed: number;
  totalW: number;
}

interface Splat {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  life: number;
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

    const zombieTex = imageTexture(assetUrl("zombie.png"), ZOMBIE_W, ZOMBIE_H);
    const peaTex = svgTexture(PEA_SVG, PEA_SIZE, PEA_SIZE);
    const splatTex = svgTexture(SPLAT_SVG, 48, 48);

    const zombies = new Set<Zombie>();
    const bullets = new Set<Bullet>();
    const splats = new Set<Splat>();
    let spawnTimer = 0;
    let rand = 12345;
    const nextRand = () => (rand = (rand * 1103515245 + 12345) & 0x7fffffff);

    const laneCount = () => Math.max(1, Math.floor((viewport.height - 20) / LANE_H));
    const laneY = (lane: number) => viewport.height / 2 - LANE_H / 2 - 10 - lane * LANE_H;

    function makeTextTexture(text: string, color: string, fontSize: number) {
      const pad = 12;
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

    function spawnZombie() {
      if (zombies.size >= 6) return;
      const lane = nextRand() % laneCount();
      const material = new THREE.SpriteMaterial({ map: zombieTex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(ZOMBIE_W, ZOMBIE_H, 1);
      const hpMat = new THREE.SpriteMaterial({ color: 0x55dd44, transparent: true, depthTest: false });
      const hpBar = new THREE.Sprite(hpMat);
      hpBar.scale.set(44, 5, 1);
      const z: Zombie = {
        sprite,
        material,
        hpBar,
        hpMat,
        lane,
        x: -viewport.width / 2 - ZOMBIE_W / 2,
        speed: 25 + (nextRand() % 20),
        hp: ZOMBIE_HP,
        state: "walk",
        t: nextRand() % 100,
        flash: 0,
      };
      scene.add(sprite);
      scene.add(hpBar);
      zombies.add(z);
    }

    function removeZombie(z: Zombie) {
      scene.remove(z.sprite);
      scene.remove(z.hpBar);
      z.material.dispose();
      z.hpMat.dispose();
      zombies.delete(z);
    }

    function removeBullet(b: Bullet) {
      scene.remove(b.pea);
      scene.remove(b.text);
      b.peaMat.dispose();
      b.textMat.dispose();
      b.textTex.dispose();
      bullets.delete(b);
    }

    function removeSplat(s: Splat) {
      scene.remove(s.sprite);
      s.material.dispose();
      splats.delete(s);
    }

    function addSplat(x: number, y: number) {
      const material = new THREE.SpriteMaterial({ map: splatTex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(48, 48, 1);
      sprite.position.set(x, y, 1);
      scene.add(sprite);
      splats.add({ sprite, material, life: 0 });
    }

    function spawn(event: DanmakuEvent) {
      if (bullets.size > 30) return;
      const rgb = event.color === 0xffffff ? 0xbde86f : event.color;
      const color = "#" + rgb.toString(16).padStart(6, "0");
      const fontSize = Math.max(20, event.fontSize || 28);
      const { texture, width, height } = makeTextTexture(event.text, color, fontSize);

      // 优先挑一个活着的僵尸所在车道，保证同一高度能撞上
      const walkers = Array.from(zombies).filter((z) => z.state === "walk");
      const lane = walkers.length
        ? walkers[event.seed % walkers.length].lane
        : event.seed % laneCount();

      const peaMat = new THREE.SpriteMaterial({ map: peaTex, transparent: true, depthTest: false });
      const pea = new THREE.Sprite(peaMat);
      pea.scale.set(PEA_SIZE, PEA_SIZE, 1);
      const textMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const text = new THREE.Sprite(textMat);
      text.scale.set(width, height, 1);

      const b: Bullet = {
        pea,
        text,
        peaMat,
        textMat,
        textTex: texture,
        lane,
        x: viewport.width / 2 + PEA_SIZE,
        speed: 150 + (event.seed % 90),
        totalW: PEA_SIZE + 6 + width,
      };
      const y = laneY(lane);
      pea.position.set(b.x, y, 0);
      text.position.set(b.x + PEA_SIZE / 2 + 6 + width / 2, y, 0);
      scene.add(pea);
      scene.add(text);
      bullets.add(b);
    }

    function step(delta: number) {
      const dt = delta / 1000;
      spawnTimer -= delta;
      if (spawnTimer <= 0) {
        spawnZombie();
        spawnTimer = 1800 + (nextRand() % 1500);
      }

      for (const z of Array.from(zombies)) {
        if (z.state === "walk") {
          z.t += dt;
          z.x += z.speed * dt;
          const y = laneY(z.lane) + Math.sin(z.t * 8) * 2;
          z.sprite.position.set(z.x, y, 0);
          z.material.rotation = Math.sin(z.t * 8) * 0.06;
          z.flash = Math.max(0, z.flash - dt);
          z.material.color.setHex(z.flash > 0 ? 0xff9999 : 0xffffff);
          z.hpBar.position.set(z.x, y + ZOMBIE_H / 2 + 8, 0);
          z.hpBar.scale.set(44 * (z.hp / ZOMBIE_HP), 5, 1);
          z.hpMat.color.setHex(z.hp > 2 ? 0x55dd44 : z.hp > 1 ? 0xffcc33 : 0xff5533);
          if (z.x > viewport.width / 2 + ZOMBIE_W) removeZombie(z);
        } else {
          z.t += dt;
          const p = Math.min(1, z.t / 0.7);
          z.material.rotation = (-Math.PI / 2) * p;
          z.material.opacity = 1 - p;
          z.hpMat.opacity = 0;
          z.sprite.position.y = laneY(z.lane) - p * 20;
          if (p >= 1) removeZombie(z);
        }
      }

      for (const b of Array.from(bullets)) {
        b.x -= b.speed * dt;
        const y = laneY(b.lane);
        b.pea.position.set(b.x, y, 0);
        b.text.position.set(b.x + PEA_SIZE / 2 + 6 + b.text.scale.x / 2, y, 0);
        if (b.x + b.totalW < -viewport.width / 2) {
          removeBullet(b);
          continue;
        }
        for (const z of zombies) {
          if (z.state !== "walk" || z.lane !== b.lane) continue;
          if (Math.abs(b.x - z.x) < HIT_DIST) {
            addSplat(b.x, y);
            removeBullet(b);
            z.hp -= 1;
            z.flash = 0.18;
            if (z.hp <= 0) {
              z.state = "dying";
              z.t = 0;
            }
            break;
          }
        }
      }

      for (const s of Array.from(splats)) {
        s.life += dt;
        const p = s.life / 0.35;
        if (p >= 1) {
          removeSplat(s);
          continue;
        }
        s.sprite.scale.setScalar(48 * (0.6 + p));
        s.material.opacity = 1 - p;
      }
    }

    function resetAll() {
      for (const z of Array.from(zombies)) removeZombie(z);
      for (const b of Array.from(bullets)) removeBullet(b);
      for (const s of Array.from(splats)) removeSplat(s);
      // 复位为完整刷怪间隔：清场后不能下一帧就立即生成新僵尸
      spawnTimer = 1800 + (nextRand() % 1500);
    }

    return {
      onDanmaku(event) {
        spawn(event);
      },
      render(frame) {
        if (playing) step(Math.min(64, frame.delta));
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
      },
      reset() {
        resetAll();
      },
      dispose() {
        resetAll();
        zombieTex.dispose();
        peaTex.dispose();
        splatTex.dispose();
        renderer.dispose();
      },
    };
  },
});
