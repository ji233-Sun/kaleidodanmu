"use client";

import type { ReactNode } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
  Panel,
  Progress,
  Slider,
  Spinner,
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
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-ink-3">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-xs font-medium text-ink-2">{children}</p>;
}

function Logo() {
  return (
    <a href="#" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bili-pink text-sm font-bold text-white">
        弹
      </span>
      <span className="text-lg font-bold tracking-tight text-ink">
        KaleidoDanmu
      </span>
    </a>
  );
}

export default function Showcase() {
  return (
    <div className="min-h-screen bg-page font-sans text-ink">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-ink-2 sm:flex">
            <a href="#" className="font-medium text-bili-pink">
              组件
            </a>
            <a href="#" className="transition-colors hover:text-bili-pink">
              弹幕玩法
            </a>
            <a href="#" className="transition-colors hover:text-bili-pink">
              接入文档
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Input placeholder="搜索组件…" className="hidden w-44 md:block" />
            <Button size="sm">立即使用</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* 页面标题区 */}
        <Panel className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-ink">
                KaleidoDanmu 组件库
              </h1>
              <p className="mt-1 text-sm text-ink-2">
                仿哔哩哔哩视觉规范 —— 品牌粉主色、白色卡片、清爽的浅色界面。
              </p>
              <div className="mt-3 flex gap-2">
                <Badge hue="pink">组件化</Badge>
                <Badge hue="blue">Light-first</Badge>
                <Badge hue="green">Tailwind v4</Badge>
              </div>
            </div>
            <Spinner size={48} />
          </div>
        </Panel>

        <div className="space-y-8">
          {/* 按钮 */}
          <Section title="Button 按钮" desc="四种变体：主要 / 次要 / 描边 / 幽灵">
            <Panel className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">发送弹幕</Button>
                <Button variant="secondary">次要按钮</Button>
                <Button variant="outline">描边按钮</Button>
                <Button variant="ghost">幽灵按钮</Button>
                <Button variant="primary" disabled>
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
          <Section title="Panel 面板" desc="普通卡片与可悬浮卡片">
            <div className="grid gap-4 sm:grid-cols-2">
              <Panel>
                <p className="text-sm font-medium text-ink">普通卡片</p>
                <p className="mt-1 text-sm text-ink-2">
                  白色底、浅灰描边，适合承载表单与列表内容。
                </p>
              </Panel>
              <Panel hoverable>
                <p className="text-sm font-medium text-ink">可悬浮卡片</p>
                <p className="mt-1 text-sm text-ink-2">
                  hover 时浮起加深阴影，适合视频卡片等可点击区域。
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
                  <Input defaultValue="#fb7299" />
                </div>
              </div>
              <div>
                <Label>弹幕内容</Label>
                <Textarea placeholder="发条弹幕吧…" />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink">接收弹幕通知</span>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink">礼物特效</span>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-3">已禁用开关</span>
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
          <Section title="Badge 徽章" desc="可用于弹幕等级、标签等场景">
            <Panel className="flex flex-wrap gap-2">
              <Badge hue="pink">舰长</Badge>
              <Badge hue="purple">提督</Badge>
              <Badge hue="blue">UP 主</Badge>
              <Badge hue="orange">高能</Badge>
              <Badge hue="red">醒目留言</Badge>
              <Badge hue="green">新观众</Badge>
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
                    content:
                      "滚动弹幕、顶部弹幕、底部弹幕都会显示在这里。",
                  },
                  {
                    value: "gift",
                    label: "礼物",
                    content: "礼物与醒目留言列表，可接入打赏事件流。",
                  },
                  {
                    value: "stats",
                    label: "统计",
                    content:
                      "互动数据面板：弹幕量、在线人数、互动率趋势。",
                  },
                ]}
              />
            </Panel>
          </Section>

          {/* 反馈 */}
          <Section title="Feedback 反馈" desc="加载器、进度条与提示条">
            <Panel className="space-y-6">
              <div className="flex items-center gap-6">
                <Spinner size={48} />
                <Spinner size={32} />
                <Spinner size={20} />
                <span className="text-sm text-ink-3">加载中…</span>
              </div>
              <div className="space-y-3">
                <Progress value={32} />
                <Progress value={68} />
                <Progress value={95} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Alert hue="blue" title="连接成功">
                  已接入弹幕服务器，正在同步消息流。
                </Alert>
                <Alert hue="orange" title="弹幕密集">
                  当前弹幕密度过高，已自动开启限流模式。
                </Alert>
                <Alert hue="red" title="连接断开">
                  与弹幕服务器的连接已断开，正在尝试重连…
                </Alert>
                <Alert hue="green" title="任务完成">
                  本场直播的弹幕录制已保存完毕。
                </Alert>
              </div>
            </Panel>
          </Section>
        </div>

        <footer className="mt-12 text-center text-xs text-ink-3">
          KaleidoDanmu UI · 仿哔哩哔哩风格组件库
        </footer>
      </main>
    </div>
  );
}
