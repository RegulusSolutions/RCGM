"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { NotificationItem } from "@/lib/types";

const POLL_MS = 20_000;

export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await apiFetch<{ items: NotificationItem[]; unread_count: number }>(
        "/api/notifications?limit=30"
      );
      setItems(res.items);
      setUnreadCount(res.unread_count);
    } catch {
      // notification polling failures are non-fatal
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, load]);

  const markRead = useCallback(
    async (id: string) => {
      await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
      load();
    },
    [load]
  );

  const markAllRead = useCallback(async () => {
    await apiFetch("/api/notifications/read-all", { method: "POST" });
    load();
  }, [load]);

  return { items, unreadCount, markRead, markAllRead, reload: load };
}
