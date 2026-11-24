"use client";

import { useCallback, useEffect, useState } from "react";
import { applyLive, subscribeLive } from "@/lib/live";
import { fetchEvents } from "@/lib/eventApi";
import { Event } from "@/lib/eventTypes";

interface UseEventsResult {
  events: Event[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  applyLocalUpdate: (event: Event) => void;
  removeLocal: (eventId: string) => void;
}

export function useEvents(): UseEventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchEvents();
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "イベント取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    return subscribeLive(
      "events",
      (event, row) => setEvents((prev) => applyLive(prev, event, row, "end")),
      () => {
        fetchEvents().then(setEvents).catch(() => {});
      }
    );
  }, []);

  const applyLocalUpdate = useCallback((event: Event) => {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === event.id);
      return exists
        ? prev.map((e) => (e.id === event.id ? event : e))
        : [...prev, event];
    });
  }, []);

  const removeLocal = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  return { events, loading, error, reload, applyLocalUpdate, removeLocal };
}
