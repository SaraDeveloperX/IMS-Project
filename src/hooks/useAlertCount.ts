"use client";

import { useEffect, useRef, useState } from "react";
import useAISviaSSE from "@/hooks/useAISviaSSE";

const TTL_MS   = 90_000;
const DEDUPE_MS = 15_000;
const MIN_SOG   = 1;
const MAX_NM    = 3;

type AlertItem = {
  id: string;
  mmsi?: number;
  lat: number;
  lon: number;
  text: string;
  ts: number;
};

function nmDistance(a: {lat:number;lon:number}, b:{lat:number;lon:number}) {
  const R = 3440.065;
  const toRad = (x:number)=> x*Math.PI/180;
  const dLat = toRad(b.lat-a.lat);
  const dLon = toRad(b.lon-a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(h)));
}

function textSeverity(t: string) {
  const s = (t || "").toLowerCase();
  let score = 0;
  if (s.includes("reduce speed")) score += 3;
  if (s.includes("gust")) score += 2;
  if (s.includes("wind")) score += 2;
  if (s.includes("rain") || s.includes("precip")) score += 1;
  if (s.includes("temperature")) score += 1;
  if (s.includes("within")) score += 1;
  return score;
}

export default function useAlertCount() {
  const { targets, version } = useAISviaSSE([-180, -85, 180, 85]);

  const poolRef = useRef<Map<string, AlertItem>>(new Map());

  const [count, setCount] = useState(0);

  useEffect(() => {
    const list =
      targets instanceof Map
        ? Array.from(targets.values())
        : Object.values(targets as any);
    const snap = list
      .filter((t: any) => Number.isFinite(t.lat) && Number.isFinite(t.lon))
      .map((t: any) => ({
        mmsi: t.mmsi,
        lat: t.lat as number,
        lon: t.lon as number,
        sog: Number(t.sog ?? 0),
        name: (t.name || `MMSI ${t.mmsi}`).trim(),
      }));
    try { (window as any).__AIS_LAST = snap; } catch {}
  }, [targets, version]);

  useEffect(() => {
    const onAlerts = (e: any) => {
      const now = Date.now();
      const items: AlertItem[] = (e?.detail as AlertItem[]) || [];
      const ais: any[] = (window as any).__AIS_LAST || [];

      const byMmsi = new Map<number, any>();
      for (const v of ais) if (typeof v.mmsi === "number") byMmsi.set(v.mmsi, v);

      for (const a of items) {
        const ts = a.ts ?? now;

        if (typeof a.mmsi !== "number") continue;
        const ship = byMmsi.get(a.mmsi);
        if (!ship) continue;

        if (Number(ship.sog ?? 0) < MIN_SOG) continue;
        const dist = nmDistance({lat:a.lat,lon:a.lon},{lat:ship.lat,lon:ship.lon});
        if (!Number.isFinite(dist) || dist > MAX_NM) continue;

        if (textSeverity(a.text || "") <= 0) continue;

        const latK = Math.round(a.lat * 1000);
        const lonK = Math.round(a.lon * 1000);
        const bucket = Math.floor(ts / DEDUPE_MS);
        const key = `${(a.text||"").trim()}|${a.mmsi}|${latK}|${lonK}|${bucket}`;

        poolRef.current.set(key, { ...a, id: key, ts });
      }

      for (const [k, v] of poolRef.current) {
        if (now - v.ts > TTL_MS) poolRef.current.delete(k);
      }

      setCount(poolRef.current.size);
    };

    window.addEventListener("ims:alerts", onAlerts);
    return () => window.removeEventListener("ims:alerts", onAlerts);
  }, []);

  return count;
}
