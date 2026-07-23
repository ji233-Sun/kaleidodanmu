import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const fieldClass =
  "w-full rounded-xl glass px-4 py-2.5 text-sm text-snow placeholder:text-mist/60 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-prism-violet/60 " +
  "focus-visible:shadow-[0_0_18px_-4px_var(--color-prism-violet)] transition-shadow";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(fieldClass, "min-h-24 resize-y", className)}
      {...props}
    />
  );
}
