export function ComingSoon({ title, subtitle, note }: { title: string; subtitle?: string; note?: string }) {
  return (
    <div>
      <h1 className="text-[19px] font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 mb-5 text-[13px] text-muted-foreground">{subtitle}</p>}
      <div className="rounded-[10px] border border-dashed border-border p-6 text-center text-muted-foreground">
        <div className="mb-1.5 text-[15px] text-[var(--rcgm-gold-soft)]">Coming next</div>
        {note ?? "This screen is wired for a follow-up pass — the backend route is already live."}
      </div>
    </div>
  );
}
