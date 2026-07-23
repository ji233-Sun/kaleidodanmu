import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** 使用棱镜碎片描边替代普通玻璃描边 */
  prism?: boolean;
}

/** 玻璃拟态容器，可选万花筒锥形渐变描边 */
export function Panel({ prism, className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-2xl p-6",
        prism ? "prism-border backdrop-blur-md" : "glass",
        className,
      )}
      {...props}
    />
  );
}
