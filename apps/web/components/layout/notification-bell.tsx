"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { fmtDT } from "@/lib/format";

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const { items, unreadCount, markRead, markAllRead } = useNotifications(enabled);
  const router = useRouter();

  if (!enabled) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="icon" className="relative border-border text-muted-foreground" />
        }
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Notifications
          </span>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-[11px] text-[var(--rcgm-gold-soft)] hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">No notifications</div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.is_read) markRead(n.id);
                if (n.trip_id) router.push(`/trips/${n.trip_id}`);
              }}
              className="block w-full border-b border-border/60 px-3 py-2.5 text-left text-[12.5px] last:border-b-0 hover:bg-accent"
            >
              <span className={n.is_read ? "text-muted-foreground" : "text-foreground font-medium"}>
                {n.message}
              </span>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground">{fmtDT(n.created_at)}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
