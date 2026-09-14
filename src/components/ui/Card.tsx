import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padding = "p-5",
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border-soft bg-surface shadow-[0_1px_2px_rgba(60,50,100,0.04),0_8px_24px_-12px_rgba(90,70,150,0.12)] ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-sm font-semibold text-text-strong tracking-tight ${className}`}>{children}</h3>;
}

export function CardSubtitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-text-muted mt-0.5 ${className}`}>{children}</p>;
}
