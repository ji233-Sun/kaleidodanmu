import { NextResponse } from 'next/server'
import { EffectService } from '@/server/services/effect.service'

// 经 service → repository → data-source 分层访问数据库。
// POST 创建 / 鉴权 / 版本指针管理在后续阶段补齐。
export async function GET() {
  const effects = await EffectService.list()
  return NextResponse.json({ effects })
}
