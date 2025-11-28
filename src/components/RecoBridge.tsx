"use client";

import { useEffect, useRef } from "react";

type Ctx = {
  ts: number;
  center: { lat: number; lon: number; zoom: number | null } | null;
  weather: ({ at: { lat: number; lon: number } } & {
    tempC: number; windKts: number; windDeg: number; wcode: number;
  }) | null;
  ais: Array<{
    id: string;
    mmsi: number;
    lat: number;
    lon: number;
    sog: number;
    cog: number;
    name: string;
    last: number;
  }>;
  alerts?: any[];
};

function buildFeatures(ctx: Ctx) {
  if (!ctx.weather || !ctx.ais || ctx.ais.length === 0) return null;

  let vessel: Ctx["ais"][number] | null = null;

  try {
    const me: any = (window as any).__CURRENT_VESSEL__ || null;
    if (me && typeof me.mmsi === "number") {
      vessel = ctx.ais.find((a) => a.mmsi === me.mmsi) || null;
    }
  } catch {}

  if (!vessel && ctx.center) {
    let best: { it: Ctx["ais"][number]; d: number } | null = null;
    for (const it of ctx.ais) {
      const dx = it.lon - ctx.center.lon;
      const dy = it.lat - ctx.center.lat;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) best = { it, d };
    }
    vessel = best?.it || ctx.ais[0];
  }
  if (!vessel) return null;

  const W = ctx.weather;
  const now = new Date();

  return {
    vessel,
    wx: {
      windDeg: W.windDeg,
    },
    time: {
      hour_of_day: now.getUTCHours(),
      weekday: now.getUTCDay(),
    },
  };
}

export default function RecoBridge({
  intervalMs = 60_000,
  minGapMs = 4_000,
}: { intervalMs?: number; minGapMs?: number }) {
  const lastRunRef = useRef(0);
  const lastCtxRef = useRef<Ctx | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onCtx = (e: any) => {
      lastCtxRef.current = e.detail as Ctx;
      trigger("ctx");
    };
    window.addEventListener("ims:context", onCtx);
    return () => window.removeEventListener("ims:context", onCtx);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => trigger("tick"), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [intervalMs]);

  async function trigger(_src: "ctx" | "tick") {
    const now = Date.now();
    if (now - lastRunRef.current < minGapMs) return;
    lastRunRef.current = now;

    const ctx = lastCtxRef.current;
    if (!ctx) return;

    const built = buildFeatures(ctx);
    if (!built) return;

    const { vessel, wx } = built;

    if ((vessel.sog ?? 0) < 5) return;

    try {
      const params = new URLSearchParams();
      params.set("lat", String(vessel.lat));
      params.set("lon", String(vessel.lon));
      params.set("sog", String(vessel.sog ?? 0));
      params.set("mmsi", String(vessel.mmsi));
      if (typeof vessel.cog === "number") {
        params.set("cog", String(vessel.cog));
      }
      if (wx && typeof wx.windDeg === "number") {
        params.set("windDeg", String(wx.windDeg));
      }

      const r = await fetch(`/api/reco?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!r.ok) {
        console.warn("[RecoBridge] /api/reco not ok:", r.status);
        return;
      }

      let data: any;
      try {
        data = await r.json();
      } catch (e) {
        console.warn("[RecoBridge] invalid JSON from /api/reco", e);
        return;
      }

      const alerts: any[] = Array.isArray(data?.alerts) ? data.alerts : [];
      if (!alerts.length) return;

      const src = alerts[0];
      const a = {
        id: src.id || `reco-${vessel.mmsi}-${now}`,
        mmsi: src.mmsi ?? vessel.mmsi,
        lat: src.lat ?? vessel.lat,
        lon: src.lon ?? vessel.lon,
        text: src.text ?? "",
        ts: src.ts ?? now,
      };

      (window as any).__LATEST_ALERTS = [a];
      window.dispatchEvent(new CustomEvent("ims:alerts", { detail: [a] }));

      const curr = lastCtxRef.current;
      if (curr) {
        const next = { ...curr, alerts: [a] };
        window.dispatchEvent(new CustomEvent("ims:context", { detail: next }));
        lastCtxRef.current = next;
      }
    } catch (e) {
      console.error("[RecoBridge] /api/reco failed", e);
    }
  }

  return null;
}
