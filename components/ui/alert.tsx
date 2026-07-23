import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import type { BadgeHue } from "./badge";

const hues: Record<BadgeHue, { box: string; dot: string }> = {
  pink: { box: "border-bili-pink/40 bg-bili-pink-light", dot: "bg-bili-pink" },
  blue: { box: "border-bili-blue/40 bg-bili-blue-light", dot: "bg-bili-blue" },
  purple: {
    box: "border-bili-purple/40 bg-bili-purple-light",
    dot: "bg-bili-purple",
  },
  orange: { box: "border-warning/40 bg-warning-light", dot: "bg-warning" },
  red: { box: "border-error/40 bg-error-light", dot: "bg-error" },
  green: { box: "border-success/40 bg-success-light", dot: "bg-success" },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  hue?: BadgeHue;
  title: string;
}

/** 提示条：浅色底 + 左侧色条标记 */
export function Alert({
  hue = "blue",
  title,
  className,
  children,
  ...props
}: AlertProps) {
  const h = hues[hue];
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border-l-4 p-4",
        h.box,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", h.dot)}
      />
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
      </div>
    </div>
  );
}
