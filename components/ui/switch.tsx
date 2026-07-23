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

/** B 站风格开关：开启时为品牌粉 */
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
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bili-pink",
        "disabled:opacity-50 disabled:pointer-events-none",
        on ? "bg-bili-pink" : "bg-[#c9ccd0]",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
          on && "translate-x-5",
        )}
      />
    </button>
  );
}
