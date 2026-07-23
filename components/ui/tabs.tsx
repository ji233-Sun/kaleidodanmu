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

/** 玻璃底槽 + 光谱渐变指示 pill 的页签 */
export function Tabs({ items, defaultValue, className }: TabsProps) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const current = items.find((i) => i.value === active);

  return (
    <div className={className}>
      <div
        role="tablist"
        className="glass inline-flex items-center gap-1 rounded-full p-1"
      >
        {items.map((item) => (
          <button
            key={item.value}
            role="tab"
            aria-selected={item.value === active}
            onClick={() => setActive(item.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-300 cursor-pointer",
              item.value === active
                ? "bg-[linear-gradient(110deg,var(--color-prism-violet),var(--color-prism-fuchsia))] text-white shadow-[0_0_16px_-4px_var(--color-prism-fuchsia)]"
                : "text-mist hover:text-snow",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4 text-sm text-mist">
        {current?.content}
      </div>
    </div>
  );
}
