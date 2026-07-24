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

## 5. 兼容配方

配方固定包含 symmetry、rotationSpeed、motion、palette、shardScale、trail、density。
这是现有存储与播放器的兼容契约。按作品语义使用有意义的字段；其余字段
填合法中性值即可，不要让字段名称反向决定视觉。

## 6. 安全与性能

- 只允许导入 three、gsap、@kaleido/sdk。
- 禁止网络、动态 import、Cookie、持久化存储、Worker、父窗口与消息通道。
- Canvas 覆盖在视频上，默认保持透明；只有用户明确需要时才绘制不透明背景。
- render 中避免创建大对象、纹理、材质和 tween。限制活动对象数量。
- dispose 释放纹理、材质、几何体、renderer，并 kill GSAP timeline。

## 7. 工作流程

1. 首次生成先读 GUIDE；修改作品先读 effect.json 与 index.ts。
2. 从用户意图确定媒介、构图、运动与交互，不套固定视觉模板。
3. 写完整文件，执行 validate，修复到通过，再 refresh_preview。
4. 用简短中文说明作品呈现和可交互方式。
`;
