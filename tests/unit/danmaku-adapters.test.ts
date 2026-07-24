import { describe, expect, it } from 'vitest'
import { liveFrameToEvent, vodElemToEvent } from '@/lib/danmaku'

describe('danmaku API adapters', () => {
  it('converts DmSegMobileReply element to VOD runtime event', () => {
    const event = vodElemToEvent({
      id: 12,
      idStr: '12',
      progress: 3456,
      mode: 5,
      fontsize: 30,
      color: 0xfb7299,
      midHash: 'abc',
      content: '前方高能',
      ctime: 0,
      weight: 8,
      pool: 0,
    })
    expect(event).toMatchObject({
      id: '12',
      source: 'vod',
      text: '前方高能',
      videoTimeMs: 3456,
      mode: 'top',
      fontSize: 30,
    })
  })

  it('converts live DANMU_MSG frame and ignores control frames', () => {
    expect(liveFrameToEvent({ op: 8, cmd: 'AUTH_REPLY' })).toBeNull()
    const event = liveFrameToEvent({
      op: 5,
      cmd: 'DANMU_MSG',
      info: [[0, 1, 25, 0xffffff, 'hello', 0, 0, 0, 0, 9], 'hello', [1]],
    })
    expect(event).toMatchObject({ id: 'live-9', source: 'live', text: 'hello', mode: 'scroll' })
  })
})
