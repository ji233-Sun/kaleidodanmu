import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import type { BadgeHue } from "./badge";

const hues: Record<BadgeHue, { border: string; dot: string }> = {
  violet: { border: "border-prism-violet/40", dot: "bg-prism-violet" },
  fuchsia: { border: "border-prism-fuchsia/40", dot: "bg-prism-fuchsia" },
  cyan: { border: "border-prism-cyan/40", dot: "bg-prism-cyan" },
  amber: { border: "border-prism-amber/40", dot: "bg-prism-amber" },
  rose: { border: "border-prism-rose/40", dot: "bg-prism-rose" },
  lime: { border: "border-prism-lime/40", dot: "bg-prism-lime" },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  hue?: BadgeHue;
  title: string;
}

/** 提示条：左侧棱形碎片标记 + 玻璃底 */
export function Alert({
  hue = "cyan",
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
        "glass flex gap-3 rounded-xl border-l-4 p-4",
        h.border,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]",
          h.dot,
        )}
      />
      <div>
        <p className="text-sm font-medium text-snow">{title}</p>
        {children && <div className="mt-1 text-sm text-mist">{children}</div>}
      </div>
    </div>
  );
}
