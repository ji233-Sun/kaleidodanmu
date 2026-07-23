import { cn } from "@/lib/cn";

const SHARDS = [
  "var(--color-prism-cyan)",
  "var(--color-prism-violet)",
  "var(--color-prism-fuchsia)",
  "var(--color-prism-rose)",
  "var(--color-prism-amber)",
  "var(--color-prism-lime)",
  "var(--color-prism-cyan)",
  "var(--color-prism-violet)",
];

export interface KaleidoSpinnerProps {
  size?: number;
  className?: string;
}

/** 万花筒加载器：八片光谱碎片缓缓旋转 */
export function KaleidoSpinner({ size = 40, className }: KaleidoSpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="status"
      aria-label="加载中"
      className={cn("animate-kaleido-spin", className)}
    >
      {SHARDS.map((color, i) => (
        <path
          key={i}
          d="M50 50 L50 6 A44 44 0 0 1 81.1 18.9 Z"
          fill={color}
          opacity={0.95 - i * 0.09}
          transform={`rotate(${i * 45} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="9" fill="var(--color-void-950)" />
      <circle cx="50" cy="50" r="4" fill="#fff" opacity="0.9" />
    </svg>
  );
}
