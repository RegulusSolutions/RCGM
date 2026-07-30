import { cn } from "@/lib/utils";

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-[18px] rounded-[10px] border border-border bg-card px-5 py-[18px]", className)}>
      {(title || actions) && (
        <div className="mb-3.5 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold tracking-wide text-[var(--rcgm-gold-soft)]">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
