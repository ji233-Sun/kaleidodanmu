import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeHue =
  | "violet"
  | "fuchsia"
  | "cyan"
  | "amber"
  | "rose"
  | "lime";

const hues: Record<BadgeHue, string> = {
  violet: "bg-prism-violet/15 text-prism-violet border-prism-violet/30",
  fuchsia: "bg-prism-fuchsia/15 text-prism-fuchsia border-prism-fuchsia/30",
  cyan: "bg-prism-cyan/15 text-prism-cyan border-prism-cyan/30",
  amber: "bg-prism-amber/15 text-prism-amber border-prism-amber/30",
  rose: "bg-prism-rose/15 text-prism-rose border-prism-rose/30",
  lime: "bg-prism-lime/15 text-prism-lime border-prism-lime/30",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  hue?: BadgeHue;
}

/** 光谱色标签，带同色系微光 */
export function Badge({ hue = "violet", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        hues[hue],
        className,
      )}
      {...props}
    />
  );
}
