import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeHue =
  | "pink"
  | "blue"
  | "purple"
  | "orange"
  | "red"
  | "green";

const hues: Record<BadgeHue, string> = {
  pink: "bg-bili-pink-light text-bili-pink",
  blue: "bg-bili-blue-light text-bili-blue",
  purple: "bg-bili-purple-light text-bili-purple",
  orange: "bg-warning-light text-warning",
  red: "bg-error-light text-error",
  green: "bg-success-light text-success",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  hue?: BadgeHue;
}

/** B 站风格浅色底标签 */
export function Badge({ hue = "pink", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        hues[hue],
        className,
      )}
      {...props}
    />
  );
}
