import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** hover 时浮起并加深阴影，适合可点击卡片 */
  hoverable?: boolean;
}

/** B 站风格白色卡片容器 */
export function Panel({ hoverable, className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-card p-6 shadow-sm",
        hoverable &&
          "cursor-pointer transition-shadow hover:shadow-md hover:-translate-y-0.5 duration-200",
        className,
      )}
      {...props}
    />
  );
}
