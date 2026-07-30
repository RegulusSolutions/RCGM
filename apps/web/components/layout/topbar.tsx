"use client";

import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/types";

export function Topbar() {
  const { user, logout } = useSession();
  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.role] + (user.view_mode ? " · view-mode" : "");
  const tenantLabel = user.role === "SUPER_ADMIN" ? "Regulus Platform" : user.tenant_name ? `${user.tenant_name} · ${user.tenant_code}` : "—";

  return (
    <header className="sticky top-0 z-50 flex h-[58px] items-center gap-3.5 border-b border-border bg-card px-4">
      <div
        className="flex h-[34px] w-[34px] items-center justify-center rounded-lg font-serif text-[17px] font-bold text-[#15203A]"
        style={{ background: "linear-gradient(135deg,var(--rcgm-gold),var(--rcgm-gold2))" }}
      >
        J
      </div>
      <div className="text-[15px] leading-tight font-semibold tracking-wide">
        RCGM
        <span className="block text-[11px] font-normal tracking-widest text-[var(--rcgm-gold-soft)] uppercase">
          Regulus Casino Guest Manager
        </span>
      </div>
      <div className="ml-2 rounded-full border border-border bg-[var(--rcgm-navy3)] px-3.5 py-1 text-xs text-[var(--rcgm-gold-soft)]">
        {tenantLabel}
      </div>
      <div className="flex-1" />
      <NotificationBell enabled={!!user.tenant_id} />
      <div className="text-right text-[12.5px]">
        <div className="font-semibold">{user.name}</div>
        <div className="text-[11px] text-muted-foreground">{roleLabel}</div>
      </div>
      <Button variant="outline" size="sm" className="border-border text-muted-foreground" onClick={logout}>
        Sign out
      </Button>
    </header>
  );
}
