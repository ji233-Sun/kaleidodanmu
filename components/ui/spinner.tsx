import { cn } from "@/lib/cn";

export interface SpinnerProps {
  size?: number;
  className?: string;
}

/** B 站风格加载器：粉色圆弧旋转 */
export function Spinner({ size = 40, className }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      role="status"
      aria-label="加载中"
      className={cn("animate-spin", className)}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="var(--color-bili-pink-light)"
        strokeWidth="5"
      />
      <path
        d="M25 5 A20 20 0 0 1 45 25"
        fill="none"
        stroke="var(--color-bili-pink)"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}
