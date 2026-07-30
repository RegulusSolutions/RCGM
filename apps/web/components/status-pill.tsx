import { cn } from "@/lib/utils";
import type { PillTone, TripStatus } from "@/lib/types";
import { STATUS_META } from "@/lib/types";

const TONE_CLASSES: Record<PillTone, string> = {
  green: "bg-[#173B2C] text-[#3FBF7F]",
  amber: "bg-[#3D3217] text-[#E8B339]",
  blue: "bg-[#1B2C50] text-[#5B8DEF]",
  grey: "bg-[#232F49] text-[var(--rcgm-ink-dim)]",
  red: "bg-[#3D1F1F] text-[#E25555]",
  gold: "bg-[#3A2F12] text-[var(--rcgm-gold-soft)]",
};

export function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap",
        TONE_CLASSES[tone]
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: TripStatus }) {
  const meta = STATUS_META[status] ?? { label: status, pill: "grey" as PillTone };
  return <Pill tone={meta.pill}>{meta.label}</Pill>;
}
