"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV } from "@/lib/nav";
import { useSession } from "@/lib/session";

export function Sidebar() {
  const { user } = useSession();
  const pathname = usePathname();
  if (!user) return null;
  const entries = NAV[user.role] ?? [];

  return (
    <nav className="w-[228px] shrink-0 border-r border-border bg-card p-2.5">
      {entries.map((entry, i) => {
        if (entry.kind === "section") {
          return (
            <div key={i} className="px-3 pt-3.5 pb-1.5 text-[10px] tracking-widest text-[#54678C] uppercase">
              {entry.label}
            </div>
          );
        }
        const Icon = entry.icon;
        const active = pathname === entry.href || pathname.startsWith(entry.href + "/");
        return (
          <Link
            key={entry.id}
            href={entry.href}
            className={cn(
              "mb-0.5 flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--rcgm-navy3)] hover:text-foreground",
              active && "border-border bg-[var(--rcgm-navy3)] text-[var(--rcgm-gold-soft)]"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{entry.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
