import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";

const VARIANT_CLASSES: Record<Variant, string> = {
  // Hover/focus darkening is handled globally (globals.css) via a brightness
  // filter on every button, so variants don't each need their own hover bg.
  primary: "bg-primary text-white border-primary-dark focus-visible:ring-primary/40 shadow-sm shadow-primary/20",
  secondary: "bg-primary-soft text-primary-dark border-primary/30 focus-visible:ring-primary/30",
  outline: "border-border-soft bg-surface text-text-body focus-visible:ring-primary/20",
  ghost: "border-border-soft text-text-body focus-visible:ring-primary/20",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-[filter,background-color] focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
