"use client";

import { useEffect, useReducer, useRef } from "react";

export default function useModelAlertCount(windowMs = 10 * 60 * 1000) {
  const ringRef = useRef<number[]>([]);
  const [v, bump] = useReducer((x) => (x + 1) & 0xffff, 0);

  useEffect(() => {
    function onModelAlerts(e: Event) {
      const ce = e as CustomEvent<any[]>;
      const now = Date.now();
      const items = Array.isArray(ce.detail) ? ce.detail : [];
      if (items.length) {
        ringRef.current.push(now);
        ringRef.current = ringRef.current.filter((t) => now - t <= windowMs);
        bump();
      }
    }
    window.addEventListener("ims:alerts", onModelAlerts as EventListener);
    return () => window.removeEventListener("ims:alerts", onModelAlerts as EventListener);
  }, [windowMs]);

  return ringRef.current.length;
}
