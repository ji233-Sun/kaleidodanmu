import { EffectDetail } from "@/components/square/effect-detail";

export default async function SquareEffectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  // key 保证切换作品 id 时整体 remount，客户端组件无需手动重置状态
  return <EffectDetail key={decoded} id={decoded} />;
}
