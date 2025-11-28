"use client";

import { useEffect } from "react";

type UseModelAlertsOptions = {
  url?: string;
  pollMs?: number;
  maxNm?: number;
  minSog?: number;
};

type AisSnapshotItem = {
  id: string;
  mmsi: number;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  name: string;
  last: number;
};

type WeatherSnapshot = {
  tempC: number;
  windKts: number;
  windDeg: number;
  wcode: number;
};

type AlertItem = {
  id: string;
  mmsi?: number;
  lat: number;
  lon: number;
  text: string;
  ts: number;
};

function toRad(x: number) {
  return (x * Math.PI) / 180;
}

function haversineNm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R_km = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const d_km = 2 * R_km * Math.asin(Math.sqrt(h));
  return d_km * 0.539957;
}

export default function useModelAlerts(opts: UseModelAlertsOptions) {
  const pollMs = opts.pollMs ?? 4000;
  const maxNm = opts.maxNm ?? 3;
  const minSog = opts.minSog ?? 0.5;
  const url = opts.url ?? "/api/reco";

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let ticking = false;

    async function tick() {
      if (cancelled || ticking) return;
      ticking = true;
      try {
        const ais: AisSnapshotItem[] =
          ((window as any).__AIS_LAST as AisSnapshotItem[]) || [];
        const wx: WeatherSnapshot | null =
          ((window as any).__WX_LAST as WeatherSnapshot) || null;
        const map: any = (window as any).__MAP_REF__ || null;

        if (!ais.length || !map) {
          ticking = false;
          return;
        }

        const center = map.getCenter();
        const cLat = center?.lat ?? 0;
        const cLon = center?.lng ?? 0;

        const candidates = ais
          .filter(
            (v) =>
              typeof v.lat === "number" &&
              typeof v.lon === "number" &&
              (v.sog ?? 0) >= minSog,
          )
          .map((v) => {
            const distNm = haversineNm(cLat, cLon, v.lat, v.lon);
            return { v, distNm };
          })
          .filter((x) => x.distNm <= maxNm)
          .sort((a, b) => a.distNm - b.distNm)
          .slice(0, 8);

        if (!candidates.length) {
          ticking = false;
          return;
        }

        const alertsOut: AlertItem[] = [];

        for (const { v } of candidates) {
          const params = new URLSearchParams();
          params.set("lat", String(v.lat));
          params.set("lon", String(v.lon));
          params.set("sog", String(v.sog ?? 0));
          params.set("mmsi", String(v.mmsi));
          if (typeof v.cog === "number") {
            params.set("cog", String(v.cog));
          }
          if (wx && typeof wx.windDeg === "number") {
            params.set("windDeg", String(wx.windDeg));
          }

          let resp: Response;
          try {
            resp = await fetch(`${url}?${params.toString()}`, {
              method: "GET",
              cache: "no-store",
            });
          } catch {
            continue;
          }
          if (!resp.ok) continue;

          let data: any;
          try {
            data = await resp.json();
          } catch {
            continue;
          }

          const alerts: AlertItem[] = Array.isArray(data?.alerts)
            ? data.alerts
            : [];

          for (const a of alerts) {
            alertsOut.push({
              id: a.id || `ml-${v.mmsi}-${Date.now()}`,
              mmsi: a.mmsi ?? v.mmsi,
              lat: a.lat ?? v.lat,
              lon: a.lon ?? v.lon,
              text: a.text ?? "",
              ts: a.ts ?? Date.now(),
            });
          }
        }

        if (alertsOut.length) {
          window.dispatchEvent(
            new CustomEvent("ims:alerts", { detail: alertsOut }),
          );
        }
      } finally {
        ticking = false;
      }
    }

    const id = setInterval(tick, pollMs);
    tick();

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs, maxNm, minSog, url]);
}
