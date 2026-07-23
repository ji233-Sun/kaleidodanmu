import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  // 品牌粉填充
  primary:
    "bg-bili-pink text-white shadow-sm hover:bg-bili-pink-hover transition-colors",
  // 白底灰边，hover 变粉
  secondary:
    "border border-line bg-white text-ink-2 hover:border-bili-pink hover:text-bili-pink transition-colors",
  // 粉色描边
  outline:
    "border border-bili-pink text-bili-pink hover:bg-bili-pink-light transition-colors",
  // 无边界弱样式
  ghost: "text-ink-2 hover:bg-fill hover:text-bili-pink transition-colors",
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
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium select-none cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bili-pink",
        "disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
