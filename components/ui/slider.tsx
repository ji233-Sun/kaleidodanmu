"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface SliderProps {
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  /** 在右侧显示当前数值 */
  showValue?: boolean;
  onValueChange?: (value: number) => void;
  className?: string;
}

/** 光谱轨道滑块（样式见 globals.css 的 .kaleido-range） */
export function Slider({
  defaultValue = 50,
  min = 0,
  max = 100,
  step = 1,
  showValue,
  onValueChange,
  className,
}: SliderProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <input
        type="range"
        className="kaleido-range w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          setValue(v);
          onValueChange?.(v);
        }}
      />
      {showValue && (
        <span className="w-10 shrink-0 text-right font-mono text-xs text-mist tabular-nums">
          {value}
        </span>
      )}
    </div>
  );
}
