"use client";

import { useEffect, useReducer } from "react";

export type ModelAlertTick = {
  ts: number;
  type: string;
};

let ring: ModelAlertTick[] = [];
let maxWindowMs = 60 * 60 * 1000;
let listenerInitialized = false;

const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {}
  }
}

function ensureListener() {
  if (listenerInitialized) return;
  listenerInitialized = true;

  if (typeof window === "undefined") return;

  window.addEventListener(
    "ims:alerts",
    ((e: Event) => {
      const ce = e as CustomEvent<any[]>;
      const now = Date.now();
      const items = Array.isArray(ce.detail) ? ce.detail : [];

      const newTicks: ModelAlertTick[] = items.map((a: any) => ({
        ts: Number(a?.ts) || now,
        type: String(a?.type ?? "MODEL"),
      }));

      if (!newTicks.length) return;

      ring = [...ring, ...newTicks];
      ring = ring.filter((x) => now - x.ts <= maxWindowMs);

      notifySubscribers();
    }) as EventListener
  );
}

export default function useModelAlertsHistory(windowMs = 60 * 60 * 1000) {
  const [, force] = useReducer((x) => (x + 1) & 0xffff, 0);

  useEffect(() => {
    maxWindowMs = Math.max(maxWindowMs, windowMs);
    ensureListener();

    const cb = () => force();
    subscribers.add(cb);

    return () => {
      subscribers.delete(cb);
    };
  }, [windowMs]);

  return ring;
}
