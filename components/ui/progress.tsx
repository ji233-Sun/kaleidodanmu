import { cn } from "@/lib/cn";

export interface ProgressProps {
  /** 0 - 100 */
  value: number;
  className?: string;
}

/** 光谱渐变进度条，带流光动画 */
export function Progress({ value, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-void-700",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-prism-cyan),var(--color-prism-violet),var(--color-prism-fuchsia),var(--color-prism-amber))] bg-[length:200%_100%] animate-shimmer transition-[width] duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
