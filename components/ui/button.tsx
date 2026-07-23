import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "prism" | "glass" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  // 光谱渐变填充，hover 时流光移动 + 辉光增强
  prism:
    "text-white bg-[linear-gradient(110deg,var(--color-prism-cyan),var(--color-prism-violet)_45%,var(--color-prism-fuchsia))] bg-[length:180%_100%] bg-left hover:bg-right transition-[background-position,box-shadow] duration-500 shadow-[0_0_20px_-6px_var(--color-prism-violet)] hover:shadow-[0_0_30px_-4px_var(--color-prism-fuchsia)]",
  // 磨砂玻璃
  glass: "glass text-snow hover:bg-white/10 transition-colors",
  // 棱镜碎片描边
  outline: "prism-border text-snow hover:brightness-125 transition",
  // 无边界弱样式
  ghost: "text-mist hover:text-snow hover:bg-white/5 transition-colors",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "prism",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium select-none cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prism-cyan",
        "disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
