export function LiveUpdateBadge({ label = "Recalculating…" }: { label?: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      {label}
    </span>
  );
}
