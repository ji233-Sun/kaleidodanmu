"use client";

import type { ReactNode } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
  KaleidoSpinner,
  Panel,
  Progress,
  Slider,
  Switch,
  Tabs,
  Textarea,
} from "@/components/ui";

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-snow">{title}</h2>
        {desc && <p className="mt-1 text-sm text-mist">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-medium text-mist">{children}</p>;
}

export default function Showcase() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-void-950 font-sans text-snow">
      {/* 背景装饰：镜筒深处的光谱光斑 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-150 w-150 rounded-full bg-[conic-gradient(from_0deg,var(--color-prism-violet),var(--color-prism-cyan),var(--color-prism-fuchsia),var(--color-prism-violet))] opacity-20 blur-3xl animate-kaleido-spin" />
        <div className="absolute -right-40 top-1/3 h-125 w-125 rounded-full bg-[conic-gradient(from_180deg,var(--color-prism-amber),var(--color-prism-rose),var(--color-prism-lime),var(--color-prism-amber))] opacity-15 blur-3xl animate-kaleido-spin-rev" />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 py-16">
        {/* 头部 */}
        <header className="mb-16 flex flex-col items-center text-center">
          <KaleidoSpinner size={72} />
          <h1 className="mt-6 text-4xl font-bold tracking-tight">
            <span className="text-prism">KaleidoDanmu UI</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-mist">
            万花筒主题组件库 ——
            深邃镜筒底色、棱镜光谱、玻璃拟态与碎片描边。
          </p>
          <div className="mt-5 flex gap-2">
            <Badge hue="violet">组件化</Badge>
            <Badge hue="cyan">Dark-first</Badge>
            <Badge hue="amber">Tailwind v4</Badge>
          </div>
        </header>

        <div className="space-y-14">
          {/* 按钮 */}
          <Section title="Button 按钮" desc="四种变体：光谱填充 / 玻璃 / 棱镜描边 / 幽灵">
            <Panel className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="prism">发送弹幕</Button>
                <Button variant="glass">玻璃按钮</Button>
                <Button variant="outline">棱镜描边</Button>
                <Button variant="ghost">幽灵按钮</Button>
                <Button variant="prism" disabled>
                  不可用
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">小号</Button>
                <Button size="md">中号</Button>
                <Button size="lg">大号</Button>
              </div>
            </Panel>
          </Section>

          {/* 面板 */}
          <Section title="Panel 面板" desc="普通玻璃面板与棱镜碎片描边面板">
            <div className="grid gap-4 sm:grid-cols-2">
              <Panel>
                <p className="text-sm text-snow">玻璃面板</p>
                <p className="mt-1 text-sm text-mist">
                  磨砂质感，适合承载表单与列表内容。
                </p>
              </Panel>
              <Panel prism>
                <p className="text-sm text-snow">棱镜描边面板</p>
                <p className="mt-1 text-sm text-mist">
                  锥形渐变碎片描边，用于需要强调的区域。
                </p>
              </Panel>
            </div>
          </Section>

          {/* 表单 */}
          <Section title="Form 表单控件" desc="输入框、开关与滑块">
            <Panel className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>昵称</Label>
                  <Input placeholder="输入你的弹幕昵称…" />
                </div>
                <div>
                  <Label>弹幕颜色</Label>
                  <Input defaultValue="#8b5cf6" />
                </div>
              </div>
              <div>
                <Label>弹幕内容</Label>
                <Textarea placeholder="发条弹幕吧…" />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-snow">接收弹幕通知</span>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-snow">礼物特效</span>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-mist">已禁用开关</span>
                    <Switch disabled defaultChecked />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>弹幕透明度</Label>
                    <Slider defaultValue={80} showValue />
                  </div>
                  <div>
                    <Label>弹幕速度</Label>
                    <Slider defaultValue={35} showValue />
                  </div>
                </div>
              </div>
            </Panel>
          </Section>

          {/* 徽章 */}
          <Section title="Badge 徽章" desc="六色光谱，可用于弹幕等级、标签等场景">
            <Panel className="flex flex-wrap gap-2">
              <Badge hue="violet">舰长</Badge>
              <Badge hue="fuchsia">提督</Badge>
              <Badge hue="cyan">UP 主</Badge>
              <Badge hue="amber">高能</Badge>
              <Badge hue="rose">醒目留言</Badge>
              <Badge hue="lime">新观众</Badge>
            </Panel>
          </Section>

          {/* 页签 */}
          <Section title="Tabs 页签">
            <Panel>
              <Tabs
                items={[
                  {
                    value: "all",
                    label: "全部弹幕",
                    content: "滚动弹幕、顶部弹幕、底部弹幕都会显示在这里。",
                  },
                  {
                    value: "gift",
                    label: "礼物",
                    content: "礼物与醒目留言列表，可接入打赏事件流。",
                  },
                  {
                    value: "stats",
                    label: "统计",
                    content: "互动数据面板：弹幕量、在线人数、互动率趋势。",
                  },
                ]}
              />
            </Panel>
          </Section>

          {/* 反馈 */}
          <Section title="Feedback 反馈" desc="加载器、进度条与提示条">
            <Panel className="space-y-6">
              <div className="flex items-center gap-6">
                <KaleidoSpinner size={56} />
                <KaleidoSpinner size={36} />
                <KaleidoSpinner size={24} />
                <span className="text-sm text-mist">万花筒加载中…</span>
              </div>
              <div className="space-y-3">
                <Progress value={32} />
                <Progress value={68} />
                <Progress value={95} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Alert hue="cyan" title="连接成功">
                  已接入弹幕服务器，正在同步消息流。
                </Alert>
                <Alert hue="amber" title="弹幕密集">
                  当前弹幕密度过高，已自动开启限流模式。
                </Alert>
                <Alert hue="rose" title="连接断开">
                  与弹幕服务器的连接已断开，正在尝试重连…
                </Alert>
                <Alert hue="lime" title="任务完成">
                  本场直播的弹幕录制已保存完毕。
                </Alert>
              </div>
            </Panel>
          </Section>
        </div>

        <footer className="mt-16 text-center text-xs text-mist/60">
          KaleidoDanmu UI · 万花筒主题组件库
        </footer>
      </div>
    </div>
  );
}
