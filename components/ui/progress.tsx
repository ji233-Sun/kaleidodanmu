import { cn } from "@/lib/cn";

export interface ProgressProps {
  /** 0 - 100 */
  value: number;
  className?: string;
}

/** B 站风格进度条：灰底粉色填充 */
export function Progress({ value, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-fill", className)}
    >
      <div
        className="h-full rounded-full bg-bili-pink transition-[width] duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
