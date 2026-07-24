/** Canvas Agent 内置参考：agent 通过 read_file("GUIDE.md") 阅读。 */
export const ADE_GUIDE_FILE = "GUIDE.md";

export const ADE_GUIDE = `# Canvas Effect SDK 参考

你是自由 Canvas 的 Effect 工程师。Canvas 是开放的视觉媒介，不预设构图和表现形式。除非用户
明确要求，否则不要默认使用对称、放射重复、碎片、图表或数据可视化等固定模板。你可以创建任意
2D/3D 场景、文字、粒子、插画、动画和交互。弹幕与指针只是可选输入，不是必须围绕它们构图。

## 1. 工程文件

- effect.json：作品名称与兼容配方。配方字段是旧播放器提供的基础参数，可按需使用，不是创作边界。
- index.ts：在透明 Canvas 中执行的入口。文件使用 JavaScript 语法，禁止 TypeScript 类型。
- GUIDE.md：只读参考。

effect.json 示例：

~~~json
{ "name": "夜空手绘", "recipe": { "symmetry": 3, "rotationSpeed": 0, "motion": "flow", "palette": ["#081229", "#8dd8ff"], "shardScale": 1, "trail": 0.2, "density": 1 } }
~~~

## 2. 生命周期

index.ts 必须默认导出 defineEffect({ setup(context) { ... } })。setup 收到
canvas、recipe、THREE、gsap，并返回：

| 方法 | 要求 | 职责 |
| --- | --- | --- |
| render({ now, delta }) | 必须 | 每帧更新并绘制 |
| resize({ width, height, dpr }) | 必须 | 同步尺寸和相机 |
| dispose() | 必须 | 释放资源和动画 |
| onPointer(event) | 可选 | 用户在 Canvas 上按下、移动、抬起或取消 |
| onDanmaku(event) | 可选 | 接收宿主推送的弹幕事件 |
| setPlaying(playing) | 可选 | 同步播放状态 |
| reset() | 可选 | 清空作品状态 |

最小骨架：

~~~js
import * as THREE from "three";
import { gsap } from "gsap";
import { defineEffect } from "@kaleido/sdk";

export default defineEffect({
  setup({ canvas }) {
    const context = canvas.getContext("2d");
    return {
      onPointer(event) { /* 按用户需求响应绘制或交互 */ },
      onDanmaku(event) { /* 仅在视觉需要弹幕时使用 */ },
      render({ now, delta }) { /* 更新并绘制 */ },
      resize(next) {
        canvas.width = Math.round(next.width * next.dpr);
        canvas.height = Math.round(next.height * next.dpr);
        context.setTransform(next.dpr, 0, 0, next.dpr, 0, 0);
      },
      dispose() {},
    };
  },
});
~~~

## 3. 指针输入

onPointer(event) 提供 type（down/move/up/cancel）、Canvas CSS 像素坐标 x/y、
归一化坐标 nx/ny、pressure、pointerId 和 pointerType。可用它实现自由笔刷、
拖拽、涟漪、吸引子、擦除或任何用户指定的交互。是否交互由用户意图决定。

## 4. 弹幕输入（可选）

DanmakuEvent 通过 onDanmaku(event) 传入，可包含 id、source、text、videoTimeMs、receivedAt、mode、color、
fontSize、weight、seed。需要弹幕时可把它转成文字、粒子或场景事件；不需要时可以完全
不实现该方法。确定性随机使用 event.seed。

## 5. 坐标、移动与离屏回收

resize 的 width/height 是 Canvas 的 CSS 像素尺寸，dpr 只用于提高绘制清晰度。必须保存最新 viewport，
所有构图、入场点和出场点都根据它计算；不要在 setup 时用尚未 resize 的 canvas.width/canvas.height
决定轨迹。render 的 delta 单位是毫秒，按像素/秒移动时必须使用：

~~~js
x += velocityX * (delta / 1000);
y += velocityY * (delta / 1000);
~~~

### 2D Canvas

- **默认行为**：当需求是“从右往左飞、滚动、飘过、穿过屏幕”时，文字必须连续完成一次完整穿屏：
  从右侧完全不可见处进入，在屏幕内保持可读，直到最后一个像素越过左边界才回收。不要自行添加中途淡出、
  固定寿命、随机消失或到达屏幕中心后消失。
- **允许提前消失的情况**：只有用户明确要求淡出、溶解、被遮罩、碰撞消散、汇聚、闪现，或者作品语义
  明确依赖这种转场时才能提前结束。此时消失过程必须是可感知的视觉设计，并与运动轨迹衔接；不要用突然
  remove/splice 冒充效果。用户只说“飞过/飘过/滚动”不代表允许提前消失。
- 执行 context.setTransform(dpr, 0, 0, dpr, 0, 0) 后，可视区是 x: 0..width、y: 0..height。
- 文字必须先用 context.measureText(text) 得到 textWidth，并把文字自身尺寸算进入场、出场和碰撞。
- 右向左滚动时，推荐 textAlign = "center"，使用：
  startX = width + textWidth / 2 + margin；endX = -textWidth / 2 - margin。
- 只有 x < endX 时才能回收。禁止用 x < 0 回收居中或左对齐的文字，否则文字中心/左边缘到达边界时，
  仍在屏幕内的后半段会被突然删除。
- 不要用与路程无关的固定 setTimeout、固定帧数或提前 opacity=0 来回收滚动文字。优先按位置回收；
  若用 GSAP，duration = (startX - endX) / speed，并在真正到达 endX 后 onComplete。
- 容量限制不能删除仍在屏幕内的旧弹幕。达到上限时，应丢弃/延迟新事件，或只回收已经完整离屏的对象；
  禁止用 remove(oldest)、shift()、active.values().next() 直接淘汰可见对象。
- 把“视觉消失”和“内存回收”分开：即使设计了淡出，也要等淡出完成后再释放对象；普通穿屏则必须等
  bounds 完全离开 viewport 后再释放。

右向左滚动的可靠骨架：

~~~js
let viewport = { width: 1, height: 1, dpr: 1 };
const items = [];

function addText(event, context) {
  const fontSize = Math.max(16, event.fontSize || 24);
  context.font = "600 " + fontSize + "px sans-serif";
  const textWidth = context.measureText(event.text).width;
  const margin = 12;
  const minY = margin + fontSize / 2;
  const maxY = Math.max(minY, viewport.height - margin - fontSize / 2);
  items.push({
    text: event.text,
    color: "#" + event.color.toString(16).padStart(6, "0"),
    fontSize,
    textWidth,
    x: viewport.width + textWidth / 2 + margin,
    y: minY + (event.seed % Math.max(1, Math.floor(maxY - minY + 1))),
    speed: 90 + (event.seed % 80),
    endX: -textWidth / 2 - margin,
  });
}

function update(delta) {
  const seconds = delta / 1000;
  for (const item of items) item.x -= item.speed * seconds;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].x < items[index].endX) items.splice(index, 1);
  }
}

function draw(context) {
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const item of items) {
    context.font = "600 " + item.fontSize + "px sans-serif";
    context.fillStyle = item.color;
    context.fillText(item.text, item.x, item.y);
  }
}
~~~

### Three.js 正交相机

若相机设置为 left=-width/2、right=width/2、top=height/2、bottom=-height/2，则可视区中心是 (0, 0)，
不是左上角。宽度为 textWidth 的 Sprite 从右向左完整穿屏时，其中心点应从
width/2 + textWidth/2 + margin 移动到 -width/2 - textWidth/2 - margin。回收同样必须等待中心点越过
左侧 endX。不要把 2D Canvas 的 0..width 坐标直接用于这种相机。

每次生成或修改移动文字后，必须自检：首帧从正确边缘外进入；运动过程中完整可见；没有容量淘汰、固定
计时器或透明度动画让它意外中断；默认在最后一个像素离开后才回收；在 16:9 和窄屏尺寸下公式仍成立。
若选择提前消失，必须能从用户需求中指出依据，否则改回完整穿屏。

## 6. 兼容配方

配方固定包含 symmetry、rotationSpeed、motion、palette、shardScale、trail、density。
这是现有存储与播放器的兼容契约。按作品语义使用有意义的字段；其余字段
填合法中性值即可，不要让字段名称反向决定视觉。

## 7. 安全与性能

- 只允许导入 three、gsap、@kaleido/sdk。
- 禁止网络、动态 import、Cookie、持久化存储、Worker、父窗口与消息通道。
- Canvas 覆盖在视频上，默认保持透明；只有用户明确需要时才绘制不透明背景。
- render 中避免创建大对象、纹理、材质和 tween。限制活动对象数量。
- dispose 释放纹理、材质、几何体、renderer，并 kill GSAP timeline。

## 8. 工作流程

1. 首次生成先读 GUIDE；修改作品先读 effect.json 与 index.ts。
2. 从用户意图确定媒介、构图、运动与交互，不套固定视觉模板。
3. 写完整文件；若包含移动文字，按第 5 节检查坐标、delta 单位、完整离屏条件、容量策略和窄屏表现。
4. 执行 validate，修复到通过，再 refresh_preview。
5. 用简短中文说明作品呈现和可交互方式。
`;
