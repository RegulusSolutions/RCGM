import { cn } from "@/lib/utils";

export function StatCard({
  value,
  label,
  danger,
  onClick,
}: {
  value: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-[10px] border border-border bg-card px-[18px] py-4",
        onClick && "cursor-pointer",
        danger && "border-destructive"
      )}
    >
      <div className={cn("text-[26px] font-bold", danger ? "text-destructive" : "text-[var(--rcgm-gold-soft)]")}>
        {value}
      </div>
      <div className="mt-1 text-[11.5px] tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">{children}</div>;
}
