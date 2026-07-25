"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * 固定视口高度内的主滚动容器。
 *
 * <body> 设为 h-full + overflow-hidden，不再整页滚动；页面内容在本容器内滚动，
 * 滚动条只出现在导航栏下方，不再从顶部贯穿覆盖 header。
 *
 * 路由切换时回到顶部，复刻浏览器整页滚动时「导航即回顶」的默认体验。
 * studio / effect-runtime 自管高度与滚动，本容器对它们不产生外层滚动条。
 */
export function ScrollContainer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {children}
    </div>
  );
}
