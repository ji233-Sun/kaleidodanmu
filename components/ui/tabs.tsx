"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  className?: string;
}

/** B 站风格页签：粉色高亮文字 + 下划线指示条 */
export function Tabs({ items, defaultValue, className }: TabsProps) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const current = items.find((i) => i.value === active);

  return (
    <div className={className}>
      <div role="tablist" className="flex items-center gap-6 border-b border-line">
        {items.map((item) => {
          const isActive = item.value === active;
          return (
            <button
              key={item.value}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(item.value)}
              className={cn(
                "relative pb-2.5 text-sm transition-colors cursor-pointer",
                isActive
                  ? "font-semibold text-bili-pink"
                  : "text-ink-2 hover:text-ink",
              )}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-bili-pink" />
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="mt-4 text-sm leading-6 text-ink-2">
        {current?.content}
      </div>
    </div>
  );
}
