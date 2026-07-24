import type { DanmakuEvent } from "./types";
import type { LiveFrame, VodDanmakuElem } from "@/types";
import { mulberry32, pick } from "./random";

/** 预置弹幕语料：接入后端后替换为真实弹幕流 */
const TEXTS = [
  "前方高能", "2333333", "AWSL", "awsl", "这画质绝了", "4K 60帧 纵享丝滑",
  "名场面预定", "一键三连", "再来亿遍", "弹幕护体", "经费在燃烧",
  "这也太流畅了", "每日一遍", "考古现场", "B站画质天花板", "泪目",
  "老板大气", "Canvas 特效绝了", "这也太炫了", "AI 生成的特效？！",
  "UP 主 yyds", "全员碎裂！", "镜像对称好美", "这配方我抄了",
  "kaleido nb", "见证历史", "前排围观", "火钳刘明", "妈妈问我为什么跪着看",
  "这弹幕会开花！", "导演加鸡腿", "暂停成功", "截图干嘛，愣着啊",
  "护眼模式已开启", "标准结局", "神反转", "演技在线", "配音绝了",
  "bgm 满分", "单曲循环预定", "上头了上头了", "DNA 动了", "爷青回",
  "全体起立", "气氛组就位", "这转场丝滑", "细节拉满", "二刷打卡",
  "三刷打卡", "每周必看", "宝藏 UP", "收藏比赞多系列", "学到了",
  "码住码住", "课代表呢", "省流：神作", "建议循环播放", "颅内高潮",
  "视听盛宴", "艺术品这是", "降维打击", "天花板级别", "再看亿遍",
];

const COLORS = [0xffffff, 0x00a1d6, 0xfb7299, 0x8b7cf6, 0xffd166, 0x7ee0a3];

function modeOf(mode: number): DanmakuEvent["mode"] {
  return mode === 5 ? "top" : mode === 4 ? "bottom" : "scroll";
}

/** Convert the VOD API wire shape into the runtime event contract. */
export function vodElemToEvent(elem: VodDanmakuElem): DanmakuEvent {
  return {
    id: elem.idStr || String(elem.id),
    source: "vod",
    text: elem.content,
    videoTimeMs: elem.progress,
    receivedAt: 0,
    mode: modeOf(elem.mode),
    color: elem.color,
    fontSize: elem.fontsize,
    weight: elem.weight,
    seed: elem.id >>> 0,
  };
}

/** Parse the simplified DANMU_MSG frame emitted by the live SSE endpoint. */
export function liveFrameToEvent(frame: LiveFrame): DanmakuEvent | null {
  if (frame.op !== 5 || frame.cmd !== "DANMU_MSG" || !Array.isArray(frame.info)) return null;
  const info = frame.info as unknown[];
  const meta = Array.isArray(info[0]) ? info[0] as unknown[] : [];
  const text = typeof info[1] === "string" ? info[1] : "";
  if (!text) return null;
  const seq = typeof meta[9] === "number" ? meta[9] : Date.now();
  return {
    id: `live-${seq}`,
    source: "live",
    text,
    receivedAt: Date.now(),
    mode: modeOf(typeof meta[1] === "number" ? meta[1] : 1),
    color: typeof meta[3] === "number" ? meta[3] : 0xffffff,
    fontSize: typeof meta[2] === "number" ? meta[2] : 25,
    weight: 0,
    seed: seq >>> 0,
  };
}

/**
 * 生成点播弹幕时间轴：同一 seed 生成同一批事件。
 * 之后会由 VodAdapter 从 DmSegMobileReply 转换而来。
 */
export function generateVodDanmaku(
  seed: number,
  durationMs: number,
  count = 220,
): DanmakuEvent[] {
  const rand = mulberry32(seed);
  const events: DanmakuEvent[] = [];
  for (let i = 0; i < count; i++) {
    // 弹幕在时间上呈“热点”分布：若干高峰期密度更高
    const t = rand();
    const hotspot = Math.floor(rand() * 5) / 5;
    const videoTimeMs = Math.floor(
      (t * 0.5 + hotspot * 0.5 + (rand() - 0.5) * 0.08) * durationMs,
    );
    const modeRoll = rand();
    events.push({
      id: `dm-${seed}-${i}`,
      source: "vod",
      text: pick(rand, TEXTS),
      videoTimeMs: Math.max(0, Math.min(durationMs - 1, videoTimeMs)),
      receivedAt: 0,
      mode: modeRoll < 0.86 ? "scroll" : modeRoll < 0.93 ? "top" : "bottom",
      color: pick(rand, COLORS),
      fontSize: rand() < 0.15 ? 30 : 22,
      weight: Math.floor(rand() * 10),
      seed: Math.floor(rand() * 1e9),
    });
  }
  events.sort((a, b) => (a.videoTimeMs ?? 0) - (b.videoTimeMs ?? 0));
  return events;
}

/** 直播流弹幕（固定种子伪实时推送，可复现） */
export function generateLiveDanmaku(seed: number, count = 160): DanmakuEvent[] {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const events: DanmakuEvent[] = [];
  let clock = 0;
  for (let i = 0; i < count; i++) {
    // 间隔 300-2600ms，偶发“突发流量”
    const burst = rand() < 0.12;
    clock += burst ? 60 + rand() * 240 : 300 + rand() * 2300;
    events.push({
      id: `live-${seed}-${i}`,
      source: "live",
      text: pick(rand, TEXTS),
      receivedAt: clock,
      mode: "scroll",
      color: pick(rand, COLORS),
      fontSize: rand() < 0.1 ? 30 : 22,
      weight: Math.floor(rand() * 10),
      seed: Math.floor(rand() * 1e9),
    });
  }
  return events;
}
