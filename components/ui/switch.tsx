"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** 棱镜开关：开启时滑块呈现光谱渐变并带辉光 */
export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled,
  className,
}: SwitchProps) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;

  const toggle = () => {
    if (disabled) return;
    const next = !on;
    if (checked === undefined) setInner(next);
    onCheckedChange?.(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prism-cyan",
        "disabled:opacity-50 disabled:pointer-events-none",
        on
          ? "bg-[linear-gradient(90deg,var(--color-prism-cyan),var(--color-prism-violet),var(--color-prism-fuchsia))] shadow-[0_0_14px_-2px_var(--color-prism-violet)]"
          : "bg-void-700",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-300",
          on && "translate-x-5",
        )}
      />
    </button>
  );
}
