import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary/40 shadow-sm shadow-primary/20",
  secondary:
    "bg-primary-soft text-primary-dark hover:bg-primary-softer focus-visible:ring-primary/30",
  outline:
    "border border-border-soft bg-surface text-text-body hover:bg-surface-alt focus-visible:ring-primary/20",
  ghost: "text-text-body hover:bg-surface-alt focus-visible:ring-primary/20",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
