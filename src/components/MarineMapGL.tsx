"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import useAISviaSSE from "@/hooks/useAISviaSSE";
import { setCurrentVessel } from "@/lib/captain/currentVessel";
import useModelAlerts from "@/hooks/useModelAlerts";
import "maplibre-gl/dist/maplibre-gl.css";

type AISTarget = import("@/hooks/useAISviaSSE").AISTarget;

const DEFAULT_CENTER: [number, number] = [0.12, 49.48];
const DEFAULT_ZOOM = 8;
const DEFAULT_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

const MAP_VIEW_KEY = "ims:last-map-view";
function loadView(): { lat: number; lon: number; zoom: number } | null {
  try {
    return JSON.parse(sessionStorage.getItem(MAP_VIEW_KEY) || "null");
  } catch {
    return null;
  }
}
function saveView(lat: number, lon: number, zoom: number) {
  try {
    sessionStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ lat, lon, zoom }));
  } catch {}
}

const DEFAULT_SPEED_LIMIT_KTS = 18;
function getSpeedLimitKts(): number {
  try {
    const q =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const urlLimit = q ? Number(q.get("limit")) : NaN;
    if (Number.isFinite(urlLimit) && urlLimit > 0) {
      localStorage.setItem("ims:speed-limit-kts", String(urlLimit));
      return urlLimit;
    }
    const saved = Number(localStorage.getItem("ims:speed-limit-kts"));
    if (Number.isFinite(saved) && saved > 0) return saved;
  } catch {}
  return DEFAULT_SPEED_LIMIT_KTS;
}

type MarineMapGLProps = {
  children?: React.ReactNode;
  showStats?: boolean;
  className?: string;
  style?: React.CSSProperties;
  mapHeight?: string | number;
  radius?: number;
  statsPosition?: "bottom-left" | "top-right";
  bottomCenter?: React.ReactNode;
};

type Weather = { tempC: number; windKts: number; windDeg: number; wcode: number };

type AlertItem = {
  id: string;
  mmsi?: number;
  lat: number;
  lon: number;
  text: string;
  ts: number;
};

type AlertCluster = {
  key: string;
  text: string;
  count: number;
  centerLon: number;
  centerLat: number;
  diameterPx: number;
  mmsi?: number;
  members: AlertItem[];
};

type AlertSummaryRow = {
  text: string;
  count: number;
  center: { lon: number; lat: number };
  mmsi?: number;
  latestTs: number;
};

type RiskEvent = {
  id: string;
  type: "environment" | "traffic" | "mixed";
  severity: "low" | "medium" | "high";
  etaMinutes?: number;
  summary: string;
  area?: { lat: number; lon: number; radiusNm?: number };
  targetMmsi?: number;
  confidence?: number;
};

const ALERT_TTL_MS = 90_000;
const MERGE_DISTANCE_PX = 70;
const DEDUPE_WINDOW_MS = 15_000;

const ALERT_COOLDOWN_MS = 120_000;
const MIN_SOG_FOR_OPS = 5;
const MIN_SEVERITY = 3;

const NEAR_NM = 0.5;
const SOG_MIN_MOVING = 0.2;
const BOUNDS_PAD = 0.08;

function getAisSnap(): Array<{
  mmsi: number;
  lat: number;
  lon: number;
  sog: number;
  name?: string;
  id?: string;
}> {
  return ((window as any).__AIS_LAST || []) as any[];
}
function getSogForMmsi(m?: number) {
  if (!m) return null;
  const v = getAisSnap().find((x) => x.mmsi === m);
  return v?.sog ?? null;
}
function textSeverity(t: string) {
  const s = (t || "").toLowerCase();
  let score = 0;
  if (s.includes("convective gusts") || s.includes("gusts")) score += 2;
  if (s.includes("wind expected") || s.includes("wind increase")) score += 2;
  if (s.includes("precipitation") || s.includes("rain")) score += 1;
  if (s.includes("temperature expected to fall") || s.includes("temperature"))
    score += 1;
  if (s.includes("within 60") || s.includes("within 1 hour")) score += 1;
  if (s.includes("reduce speed")) score += 1;
  return score;
}

function toRad(x: number) {
  return (x * Math.PI) / 180;
}
function haversineNm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R_km = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat),
    lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const d_km = 2 * R_km * Math.asin(Math.sqrt(h));
  return d_km * 0.539957;
}

function getPaddedBounds(map: any) {
  const b = map.getBounds();
  const dx = (b.getEast() - b.getWest()) * BOUNDS_PAD;
  const dy = (b.getNorth() - b.getSouth()) * BOUNDS_PAD;

  const west = b.getWest() - dx;
  const east = b.getEast() + dx;
  const south = b.getSouth() - dy;
  const north = b.getNorth() + dy;

  return {
    contains({ lng, lat }: { lng: number; lat: number }) {
      return lng >= west && lng <= east && lat >= south && lat <= north;
    },
  };
}

function resolveNearestVessel(lat: number, lon: number) {
  let best: any = null,
    bestNm = Infinity;
  const ais = getAisSnap();
  for (const v of ais) {
    if (typeof v.lat !== "number" || typeof v.lon !== "number") continue;
    const nm = haversineNm(lat, lon, v.lat, v.lon);
    if (nm < bestNm) {
      bestNm = nm;
      best = v;
    }
  }
  return best ? { vessel: best, distNm: bestNm } : null;
}

function summarizeAlertsForContext(
  pool: Map<string, AlertItem>,
): AlertSummaryRow[] {
  const byText = new Map<string, AlertItem[]>();
  for (const a of pool.values()) {
    const k = (a.text || "").trim();
    if (!byText.has(k)) byText.set(k, []);
    byText.get(k)!.push(a);
  }

  const rows: AlertSummaryRow[] = Array.from(byText.entries()).map(
    ([text, items]) => {
      const mmsiSet = new Set<number>();
      const geoSet = new Set<string>();

      for (const it of items) {
        if (typeof it.mmsi === "number") {
          mmsiSet.add(it.mmsi);
        } else {
          geoSet.add(
            `${Math.round(it.lat * 1000)},${Math.round(it.lon * 1000)}`,
          );
        }
      }

      const count = (mmsiSet.size > 0 ? mmsiSet.size : geoSet.size) || 0;
      const centerLon = items.reduce((s, x) => s + x.lon, 0) / items.length;
      const centerLat = items.reduce((s, x) => s + x.lat, 0) / items.length;
      const firstMmsi =
        mmsiSet.size === 1 ? Array.from(mmsiSet)[0] : undefined;

      return {
        text,
        count,
        center: { lon: centerLon, lat: centerLat },
        mmsi: firstMmsi,
        latestTs: Math.max(...items.map((x) => x.ts || 0)),
      };
    },
  );

  rows.sort((a, b) => b.count - a.count || b.latestTs - a.latestTs);
  return rows.slice(0, 10);
}

function buildRisksFromSummary(rows: AlertSummaryRow[]): RiskEvent[] {
  const risks: RiskEvent[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const score = textSeverity(row.text || "");
    const count = row.count;

    let type: RiskEvent["type"] = "mixed";
    const s = row.text.toLowerCase();
    if (
      s.includes("wind") ||
      s.includes("gust") ||
      s.includes("rain") ||
      s.includes("precip")
    ) {
      type = "environment";
    } else if (
      s.includes("close pass") ||
      s.includes("cpa") ||
      s.includes("traffic")
    ) {
      type = "traffic";
    }

    let severity: RiskEvent["severity"] = "low";
    const sevBase = score + (count >= 3 ? 1 : 0);
    if (sevBase >= 5) severity = "high";
    else if (sevBase >= 3) severity = "medium";

    const id = `risk-${i}-${row.latestTs}`;

    risks.push({
      id,
      type,
      severity,
      summary: row.text,
      etaMinutes: 30,
      area: {
        lat: row.center.lat,
        lon: row.center.lon,
        radiusNm: 1.0,
      },
      targetMmsi: row.mmsi,
      confidence: Math.min(0.95, 0.4 + 0.1 * score + 0.05 * count),
    });
  }

  return risks;
}

export default function MarineMapGL({
  children,
  showStats = true,
  className,
  style,
  mapHeight = "calc(100vh - 120px)",
  radius = 16,
  statsPosition = "bottom-left",
  bottomCenter,
}: MarineMapGLProps) {
  const searchParams = useSearchParams();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const glRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const fittedRef = useRef<boolean>(false);

  const popupRef = useRef<any>(null);
  const popupShipIdRef = useRef<string | null>(null);
  const popupLockedRef = useRef<boolean>(false);

  const alertPoolRef = useRef<Map<string, AlertItem>>(new Map());
  const clusterMarkersRef = useRef<Map<string, any>>(new Map());
  const lastShownRef = useRef<Map<string, number>>(new Map());

  const pingRef = useRef<HTMLElement | null>(null);

  const [weather, setWeather] = useState<Weather | null>(null);
  const [wxPos, setWxPos] = useState<{ lat: number; lon: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const throttleRef = useRef<number>(0);
  const contextThrottleRef = useRef<number>(0);

  const { targets, version } = useAISviaSSE(DEFAULT_BBOX);

  useModelAlerts({ url: "/api/reco", pollMs: 4000, maxNm: 3, minSog: 0.5 });

  const { entries, withPos } = useMemo(() => {
    const list: [string, AISTarget][] =
      targets instanceof Map
        ? Array.from(targets.entries())
        : (Object.entries(targets as any) as [string, AISTarget][]);
    const withPos = list.filter(
      ([, t]) => typeof t.lon === "number" && typeof t.lat === "number",
    );
    return { entries: list, withPos };
  }, [targets, version]);

  const [activeAlertText, setActiveAlertText] = useState<string | null>(null);
  const [activeAlertCenter, setActiveAlertCenter] = useState<{
    lon: number;
    lat: number;
  } | null>(null);
  const [alertCounter, setAlertCounter] = useState<number>(0);

  useEffect(() => {
    const snap = withPos.map(([id, t]) => ({
      id,
      mmsi: t.mmsi,
      lat: t.lat!,
      lon: t.lon!,
      sog: t.sog ?? 0,
      cog: t.cog ?? 0,
      name: (t.name || `MMSI ${t.mmsi}`).trim(),
      last: t.last ?? Date.now(),
    }));
    (window as any).__AIS_LAST = snap;
    (window as any).__aisTargetsSnapshot = snap;

    const now = Date.now();
    if (now - contextThrottleRef.current > 800) {
      contextThrottleRef.current = now;
      dispatchContext();
    }
  }, [withPos, version]);

  function dispatchContext() {
    try {
      const map = mapRef.current;
      const center = map ? map.getCenter() : null;
      const zoom = map ? map.getZoom() : null;

      const alertSummary = summarizeAlertsForContext(alertPoolRef.current);
      const risks = buildRisksFromSummary(alertSummary);

      const ctx = {
        ts: Date.now(),
        center: center
          ? {
              lat: +center.lat.toFixed(5),
              lon: +center.lng.toFixed(5),
              zoom: zoom != null ? +zoom.toFixed(2) : null,
            }
          : null,
        weather: weather && wxPos ? { at: wxPos, ...weather } : null,
        ais: (window as any).__AIS_LAST || [],
        alerts: alertSummary,
        risks,
      };

      window.dispatchEvent(new CustomEvent("ims:context", { detail: ctx }));
    } catch {}
  }

  const forceClosePopup = () => {
    try {
      popupRef.current?.remove();
    } catch {}
    popupShipIdRef.current = null;
    popupLockedRef.current = false;
  };

  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      if (!containerRef.current || mapRef.current) return;

      const maplibregl = (await import("maplibre-gl")).default;
      glRef.current = maplibregl;

      const deepLat = Number(searchParams?.get("lat") || "");
      const deepLon = Number(searchParams?.get("lon") || "");
      const deepZoom = Number(searchParams?.get("zoom") || "");
      const hasDeep = Number.isFinite(deepLat) && Number.isFinite(deepLon);

      const stored = loadView();

      const initialCenter: [number, number] = hasDeep
        ? [deepLon, deepLat]
        : stored
        ? [stored.lon, stored.lat]
        : DEFAULT_CENTER;

      const initialZoom = hasDeep ? deepZoom || 11 : stored?.zoom ?? DEFAULT_ZOOM;

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style:
          "https://api.maptiler.com/maps/ocean/style.json?key=WexSoUSaYxJFxEbBGiXO",
        center: initialCenter,
        zoom: initialZoom,
        attributionControl: true,
      });
      (window as any).__MAP_REF__ = map;

      map.addControl(new maplibregl.NavigationControl(), "bottom-right");

      ensurePopupCss();
      ensurePingCss();
      ensureAlertCss();

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 12,
        className: "ims-popup",
        maxWidth: "320px",
      });

      const ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current!);

      const fetchWeatherForCenter = () => {
        const now = Date.now();
        if (now - throttleRef.current < 800) return;
        throttleRef.current = now;

        const c = map.getCenter();
        const lat = Number(c.lat.toFixed(4));
        const lon = Number(c.lng.toFixed(4));
        const z = Number(map.getZoom().toFixed(2));
        setWxPos({ lat, lon });
        saveView(lat, lon, z);

        try {
          abortRef.current?.abort();
        } catch {}
        const ac = new AbortController();
        abortRef.current = ac;

        fetch(`/api/weather?lat=${lat}&lon=${lon}`, {
          signal: ac.signal,
          cache: "no-store",
        })
          .then((r) => r.json())
          .then((d) => {
            if (d?.current) {
              const cur = d.current as Weather;
              setWeather(cur);
              try {
                (window as any).__WX_LAST = cur;
              } catch {}
            }
            setTimeout(dispatchContext, 0);
          })
          .catch(() => {});
      };

      map.on("load", fetchWeatherForCenter);
      map.on("moveend", () => {
        fetchWeatherForCenter();
        dispatchContext();
        recomputeAndRenderClusters();
      });

      const canvas = map.getCanvas();
      const onCanvasClick = (ev: MouseEvent) => {
        if (popupLockedRef.current) return;
        if (ev.target instanceof HTMLCanvasElement) {
          forceClosePopup();
          closeActivePanel();
        }
      };
      canvas.addEventListener("click", onCanvasClick, true);

      const onKeydown = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          forceClosePopup();
          closeActivePanel();
        }
      };
      window.addEventListener("keydown", onKeydown);

      const onAlerts = (e: any) => {
        const items: AlertItem[] = (e?.detail as AlertItem[]) || [];
        const now = Date.now();

        for (const a of items) {
          const ts = a.ts ?? now;

          if (!isInView(a.lon, a.lat, true)) continue;

          const sev = textSeverity(a.text || "");
          if (sev < MIN_SEVERITY) continue;

          let ok = false;

          if (a.mmsi != null) {
            const sog = getSogForMmsi(a.mmsi);
            if (sog != null && sog < SOG_MIN_MOVING) {
              continue;
            }
            if (sog != null && sog < MIN_SOG_FOR_OPS) {
              continue;
            }
            const v = getAisSnap().find((x) => x.mmsi === a.mmsi);
            const nm = v ? haversineNm(a.lat, a.lon, v.lat, v.lon) : Infinity;
            if (nm <= NEAR_NM) ok = true;
          } else {
            const nearest = resolveNearestVessel(a.lat, a.lon);
            if (!nearest) continue;
            const sog = nearest.vessel?.sog ?? 0;
            if (sog < SOG_MIN_MOVING) continue;
            if (nearest.distNm <= NEAR_NM) ok = true;
          }

          if (!ok) continue;

          const latK = Math.round(a.lat * 1000);
          const lonK = Math.round(a.lon * 1000);
          const keyBase = `${(a.text || "").trim()}|${
            a.mmsi ?? "na"
          }|${latK}|${lonK}`;
          const lastTs = lastShownRef.current.get(keyBase) || 0;
          if (now - lastTs < ALERT_COOLDOWN_MS) continue;
          lastShownRef.current.set(keyBase, now);

          const bucket = Math.floor(ts / DEDUPE_WINDOW_MS);
          const dedupeKey = `${keyBase}|${bucket}`;
          alertPoolRef.current.set(dedupeKey, { ...a, id: dedupeKey, ts });
        }

        for (const [k, v] of alertPoolRef.current) {
          if (now - v.ts > ALERT_TTL_MS) alertPoolRef.current.delete(k);
        }

        recomputeAndRenderClusters();
        setTimeout(dispatchContext, 0);
      };
      window.addEventListener("ims:alerts", onAlerts);

      const onUi = (e: any) => {
        const { action, payload } = e.detail || {};
        try {
          if (
            action === "zoomTo" &&
            payload?.lat != null &&
            payload?.lon != null
          ) {
            map.flyTo({
              center: [payload.lon, payload.lat],
              zoom: payload.zoom ?? Math.max(map.getZoom(), 11),
              speed: 0.9,
            });
          } else if (
            action === "ping" &&
            payload?.lat != null &&
            payload?.lon != null
          ) {
            const el = document.createElement("div");
            el.className = "ims-ping";
            const marker = new glRef.current.Marker({
              element: el,
              anchor: "center",
            })
              .setLngLat([payload.lon, payload.lat])
              .addTo(map);
            setTimeout(() => {
              try {
                marker.remove();
              } catch {}
            }, 3500);
          } else if (action === "focusAlert" && payload?.text) {
            const list = summarizeAlertsForContext(alertPoolRef.current);
            const found = list.find((x) => x.text === payload.text);
            if (found) {
              map.flyTo({
                center: [found.center.lon, found.center.lat],
                zoom: Math.max(map.getZoom(), 11.5),
                speed: 0.9,
              });
            }
          } else if (action === "setMyVessel" && payload?.mmsi) {
            const ais: any[] = (window as any).__AIS_LAST || [];
            const v = ais.find((x) => x.mmsi === Number(payload.mmsi));
            if (v) {
              setCurrentVessel({
                mmsi: v.mmsi,
                name: (v.name || `MMSI ${v.mmsi}`).trim(),
                lat: v.lat,
                lon: v.lon,
              });
              map.flyTo({
                center: [v.lon, v.lat],
                zoom: 12.3,
                speed: 0.9,
              });
            }
          }
        } catch {}
      };
      window.addEventListener("ims:ui", onUi);

      const pruneId = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [k, v] of alertPoolRef.current) {
          if (now - v.ts > ALERT_TTL_MS) {
            alertPoolRef.current.delete(k);
            changed = true;
          }
        }
        if (changed) {
          recomputeAndRenderClusters();
          setTimeout(dispatchContext, 0);
        }
      }, 5_000);

      mapRef.current = map;

      cleanup = () => {
        window.removeEventListener("ims:alerts", onAlerts);
        window.removeEventListener("keydown", onKeydown);
        try {
          canvas.removeEventListener("click", onCanvasClick, true);
        } catch {}
        try {
          window.removeEventListener("ims:ui", onUi);
        } catch {}
        ro.disconnect();
        clearInterval(pruneId);

        try {
          popupRef.current?.remove();
        } catch {}
        popupRef.current = null;
        popupShipIdRef.current = null;
        popupLockedRef.current = false;

        for (const m of markersRef.current.values())
          try {
            m.remove();
          } catch {}
        markersRef.current.clear();

        for (const m of clusterMarkersRef.current.values())
          try {
            m.remove();
          } catch {}
        clusterMarkersRef.current.clear();

        try {
          map.remove();
        } catch {}
        mapRef.current = null;
        glRef.current = null;
        try {
          abortRef.current?.abort();
        } catch {}
      };
    })();

    return () => cleanup();
  }, [searchParams]);

  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!map || !gl) return;
    const latStr = searchParams.get("lat");
    const lonStr = searchParams.get("lon");
    if (!latStr || !lonStr) return;
    const lat = Number(latStr);
    const lon = Number(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const zoom = Number(searchParams.get("zoom")) || 11;

    try {
      map.flyTo({
        center: [lon, lat],
        zoom,
        essential: true,
        speed: 0.8,
        curve: 1.4,
      });
    } catch {}
    try {
      if (pingRef.current) {
        (pingRef.current as any).remove?.();
        pingRef.current = null;
      }
      const el = document.createElement("div");
      el.className = "ims-ping";
      const marker = new gl.Marker({ element: el, anchor: "center" })
        .setLngLat([lon, lat])
        .addTo(map);
      pingRef.current = el;
      setTimeout(() => {
        try {
          marker.remove();
        } catch {}
        if (pingRef.current === el) pingRef.current = null;
      }, 4000);
    } catch {}
  }, [searchParams]);

  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!map || !gl) return;

    try {
      const still = new Set<string>();

      for (const [id, t] of withPos) {
        const speed = t.sog ?? 0;
        const size = speed > 18 ? 30 : speed > 10 ? 26 : 22;
        const fill =
          speed > 18 ? "#FF6B6B" : speed > 10 ? "#4DA3FF" : "#A7D0FF";

        let marker = markersRef.current.get(id);
        if (!marker) {
          const el = document.createElement("div");
          el.className = "ims-marker";
          el.style.width = "44px";
          el.style.height = "44px";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.transform = "translate(-50%, -50%)";
          el.style.cursor = "pointer";
          el.style.touchAction = "manipulation";
          (el.style as any).zIndex = "5000";

          const icon = document.createElement("div");
          icon.innerHTML = shipSVG({ size, fill });
          el.appendChild(icon);

          const stop = (ev: Event) => ev.stopPropagation();
          el.addEventListener("mousedown", stop, { capture: true });
          el.addEventListener("touchstart", stop, {
            passive: true,
            capture: true,
          });

          let hoverTimer: any = null;
          let longPressTimer: any = null;

          const openPopup = () => {
            popupShipIdRef.current = id;
            popupRef.current
              ?.setLngLat([t.lon!, t.lat!])
              ?.setHTML(vesselPopupHtml(t))
              ?.addTo(map);
            popupLockedRef.current = true;
            setTimeout(() => {
              popupLockedRef.current = false;
            }, 200);
          };

          el.addEventListener(
            "click",
            (ev) => {
              ev.stopPropagation();
              openPopup();
            },
            { capture: true },
          );
          el.addEventListener("mouseenter", () => {
            if (hoverTimer) clearTimeout(hoverTimer);
            hoverTimer = setTimeout(openPopup, 180);
          });
          el.addEventListener("mouseleave", () => {
            if (hoverTimer) {
              clearTimeout(hoverTimer);
              hoverTimer = null;
            }
          });
          el.addEventListener(
            "touchstart",
            () => {
              if (longPressTimer) clearTimeout(longPressTimer);
              longPressTimer = setTimeout(openPopup, 250);
            },
            { passive: true, capture: true },
          );
          el.addEventListener("touchend", () => {
            if (longPressTimer) {
              clearTimeout(longPressTimer);
              longPressTimer = null;
            }
          });
          (el as any).tabIndex = 0;
          el.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPopup();
            }
          });

          marker = new gl.Marker({ element: el, anchor: "center" })
            .setLngLat([t.lon!, t.lat!])
            .addTo(map);
          markersRef.current.set(id, marker);
        } else {
          marker.setLngLat([t.lon!, t.lat!]);
          if (popupShipIdRef.current === id) {
            popupRef.current
              ?.setLngLat([t.lon!, t.lat!])
              ?.setHTML(vesselPopupHtml(t));
          }
        }

        const svg = marker.getElement().querySelector("svg") as
          | HTMLElement
          | null;
        const body = marker
          .getElement()
          .querySelector("path[data-body]") as HTMLElement | null;
        if (svg && typeof t.cog === "number")
          (svg.style as any).rotate = `${t.cog}deg`;
        if (body) (body as any).setAttribute("fill", fill);
        if (svg) {
          (svg.style as any).width = `${size}px`;
          (svg.style as any).height = `${size}px`;
        }

        still.add(id);
      }

      for (const [id, m] of markersRef.current) {
        if (!still.has(id)) {
          if (popupShipIdRef.current === id)
            try {
              popupRef.current?.remove();
            } catch {}
          try {
            m.remove();
          } catch {}
          markersRef.current.delete(id);
        }
      }
    } catch (e) {
      console.error("AIS markers update failed:", e);
    }
  }, [version, withPos]);

  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!map || !gl || fittedRef.current) return;

    const stored = loadView();
    const hasDeep =
      Number.isFinite(Number(searchParams?.get("lat"))) &&
      Number.isFinite(Number(searchParams?.get("lon")));
    if (hasDeep || stored) return;

    const coords = withPos.map(
      ([, t]) => [t.lon!, t.lat!] as [number, number],
    );
    if (coords.length >= 1) {
      const bounds = new gl.LngLatBounds();
      for (const c of coords) bounds.extend(c);
      try {
        map.fitBounds(bounds, { padding: 40, duration: 1200, maxZoom: 12 });
        fittedRef.current = true;
      } catch {}
    }
  }, [version, withPos, searchParams]);

  function isInView(lon: number, lat: number, padded = false) {
    const map = mapRef.current;
    if (!map) return true;
    if (padded) {
      const pb = getPaddedBounds(map);
      return pb.contains({ lng: lon, lat });
    }
    const b = map.getBounds();
    return b.contains({ lng: lon, lat });
  }

  function closeActivePanel() {
    setActiveAlertText(null);
    setActiveAlertCenter(null);
  }

  function recomputeAndRenderClusters() {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!map || !gl) return;

    const alerts = Array.from(alertPoolRef.current.values());
    const byText = new Map<string, AlertItem[]>();
    for (const a of alerts) {
      const k = (a.text || "").trim();
      if (!byText.has(k)) byText.set(k, []);
      byText.get(k)!.push(a);
    }

    const clusters: AlertCluster[] = [];
    for (const [text, items] of byText) {
      const pts = items.map((it) => ({ it, p: map.project([it.lon, it.lat]) }));
      const groups: { members: typeof pts }[] = [];

      for (const pt of pts) {
        let placed = false;
        for (const g of groups) {
          const cx =
            g.members.reduce((s, m) => s + m.p.x, 0) / g.members.length;
          const cy =
            g.members.reduce((s, m) => s + m.p.y, 0) / g.members.length;
          const dx = pt.p.x - cx;
          const dy = pt.p.y - cy;
          const dist = Math.hypot(dx, dy);
          if (dist <= MERGE_DISTANCE_PX) {
            g.members.push(pt);
            placed = true;
            break;
          }
        }
        if (!placed) groups.push({ members: [pt] });
      }

      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const n = g.members.length;

        const cx =
          g.members.reduce((s, m) => s + m.p.x, 0) / g.members.length;
        const cy =
          g.members.reduce((s, m) => s + m.p.y, 0) / g.members.length;

        let r = 18;
        for (const m of g.members) {
          const d = Math.hypot(m.p.x - cx, m.p.y - cy);
          if (d + 18 > r) r = d + 18;
        }
        const diameterPx = Math.max(36, Math.min(160, Math.round(r * 2)));
        const ll = map.unproject({ x: cx, y: cy });
        const members = g.members.map((x) => x.it);

        const mmsiSet = new Set<number>();
        const geoSet = new Set<string>();
        for (const m of members) {
          if (typeof m.mmsi === "number") {
            mmsiSet.add(m.mmsi);
          } else {
            geoSet.add(
              `${Math.round(m.lat * 1000)},${Math.round(m.lon * 1000)}`,
            );
          }
        }
        const uniqueCount = (mmsiSet.size > 0 ? mmsiSet.size : geoSet.size) || 0;

        let onlyMmsi: number | undefined = undefined;
        if (mmsiSet.size === 1) {
          onlyMmsi = Array.from(mmsiSet)[0];
        }

        clusters.push({
          key: `${text}#${i}`,
          text,
          count: uniqueCount,
          centerLon: ll.lng,
          centerLat: ll.lat,
          diameterPx,
          mmsi: onlyMmsi,
          members,
        });
      }
    }

    for (const m of clusterMarkersRef.current.values())
      try {
        m.remove();
      } catch {}
    clusterMarkersRef.current.clear();

    for (const c of clusters) {
      const el = document.createElement("div");
      el.className = "ims-alert";
      el.style.width = `${c.diameterPx}px`;
      el.style.height = `${c.diameterPx}px`;
      el.style.cursor = "pointer";
      el.title = "Alert";
      (el.style as any).zIndex = "7000";
      el.style.pointerEvents = "auto";
      el.style.touchAction = "manipulation";

      if (c.count > 1) {
        const badge = document.createElement("div");
        badge.textContent = String(c.count);
        badge.style.position = "absolute";
        badge.style.right = "6px";
        badge.style.top = "6px";
        badge.style.padding = "2px 6px";
        badge.style.borderRadius = "999px";
        badge.style.fontSize = "11px";
        badge.style.fontWeight = "900";
        badge.style.color = "#EAF2FF";
        badge.style.background = "rgba(160,20,20,0.6)";
        badge.style.border = "1px solid rgba(255,180,180,0.75)";
        badge.style.pointerEvents = "auto";
        el.appendChild(badge);
      }

      const stop = (ev: Event) => ev.stopPropagation();
      el.addEventListener("mousedown", stop, { capture: true });
      el.addEventListener("touchstart", stop, {
        passive: true,
        capture: true,
      });

      const openPanel = () => {
        setActiveAlertText(c.text);
        setActiveAlertCenter({ lon: c.centerLon, lat: c.centerLat });
        popupLockedRef.current = true;
        setTimeout(() => {
          popupLockedRef.current = false;
        }, 200);
        try {
          mapRef.current?.flyTo({
            center: [c.centerLon, c.centerLat],
            zoom: Math.max(mapRef.current?.getZoom?.() ?? 10, 11.2),
            speed: 0.8,
            curve: 1.3,
          });
        } catch {}
      };

      el.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          openPanel();
        },
        { capture: true },
      );

      let longTimer: any = null;
      el.addEventListener(
        "touchstart",
        () => {
          if (longTimer) clearTimeout(longTimer);
          longTimer = setTimeout(openPanel, 260);
        },
        { passive: true },
      );
      el.addEventListener("touchend", () => {
        if (longTimer) {
          clearTimeout(longTimer);
          longTimer = null;
        }
      });

      const marker = new glRef.current.Marker({ element: el, anchor: "center" })
        .setLngLat([c.centerLon, c.centerLat])
        .addTo(mapRef.current);

      clusterMarkersRef.current.set(c.key, marker);
    }

    setAlertCounter(clusters.length);
  }

  return (
    <div
      className={className}
      style={{ position: "relative", ...(style ?? {}) }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: typeof mapHeight === "number" ? `${mapHeight}px` : mapHeight,
          borderRadius: radius,
          overflow: "hidden",
        }}
      />

      <WeatherCard weather={weather} pos={wxPos} />
      <AlertBell count={alertCounter} />

      {activeAlertText && activeAlertCenter && (
        <AlertPanel
          text={activeAlertText}
          onClose={() => setActiveAlertText(null)}
        />
      )}

      {showStats && <Stats entries={entries.length} position={statsPosition} />}

      {bottomCenter && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 12,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>{bottomCenter}</div>
        </div>
      )}

      {children}
    </div>
  );
}

function AlertBell({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      aria-label="Alerts"
      title="Alerts"
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        zIndex: 21,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 14,
        color: "#EAF2FF",
        background:
          "linear-gradient(180deg, rgba(20,35,61,0.55) 0%, rgba(11,18,32,0.55) 100%)",
        border: "1px solid rgba(255,120,120,0.45)",
        boxShadow:
          "0 8px 22px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)",
        backdropFilter: "blur(10px)",
        fontWeight: 800,
        fontSize: 12,
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      <span aria-hidden style={{ display: "inline-flex" }}>
        {bellSVG(16)}
      </span>
      <span style={{ opacity: 0.9 }}>Alerts</span>
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(255,120,120,0.18)",
          border: "1px solid rgba(255,120,120,0.55)",
          fontWeight: 900,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function AlertPanel({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "absolute",
        right: 12,
        top: 56,
        width: 360,
        maxWidth: "calc(100% - 24px)",
        zIndex: 22,
        color: "#EAF2FF",
        background:
          "linear-gradient(180deg, rgba(20,35,61,0.55) 0%, rgba(11,18,32,0.55) 100%)",
        border: "1px solid rgba(255,120,120,0.45)",
        boxShadow:
          "0 14px 40px rgba(0,0,0,0.40), inset 0 0 0 1px rgba(255,255,255,0.06)",
        backdropFilter: "blur(10px)",
        borderRadius: 16,
        padding: 14,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 900,
            letterSpacing: 0.4,
          }}
        >
          {warningSVG(16)}
          <span>Alert</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            color: "#EAF2FF",
            padding: "6px 8px",
            fontWeight: 800,
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          height: 1,
          margin: "8px 0 10px",
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
        }}
      />

      <div
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: 1.45,
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function WeatherCard({
  weather,
  pos,
}: {
  weather: Weather | null;
  pos: { lat: number; lon: number } | null;
}) {
  if (!weather || !pos) return null;
  const dir = degToCompass(weather.windDeg);
  const nice = wxCodeToText(weather.wcode);

  const box: React.CSSProperties = {
    position: "absolute",
    left: 12,
    top: 12,
    zIndex: 11,
    padding: "10px 12px",
    minWidth: 180,
    borderRadius: 14,
    color: "#EAF2FF",
    background:
      "linear-gradient(180deg, rgba(20,35,61,0.55) 0%, rgba(11,18,32,0.55) 100%)",
    border: "1px solid rgba(126,196,255,0.25)",
    boxShadow:
      "0 8px 22px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)",
    backdropFilter: "blur(10px)",
    fontSize: 12,
  };

  const pill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 10,
    background:
      "linear-gradient(180deg, rgba(126,196,255,0.20), rgba(78,164,255,0.18))",
    border: "1px solid rgba(126,196,255,0.35)",
    fontWeight: 700,
    fontSize: 11,
    lineHeight: 1,
  };

  return (
    <div style={box}>
      <div style={{ fontWeight: 800, marginBottom: 4, opacity: 0.95 }}>
        Weather
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={pill}>{Math.round(weather.tempC)}°C</div>
        <div style={pill}>
          {weather.windKts.toFixed(1)} kts • {dir}
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{nice}</div>
    </div>
  );
}

function degToCompass(deg: number) {
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const ix = Math.round(((deg % 360) / 22.5) as number) % 16;
  return dirs[ix];
}
function wxCodeToText(code: number) {
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Mainly clear";
  if (code === 3) return "Cloudy";
  if (code >= 95) return "Thunderstorm";
  return "—";
}

function Stats({
  entries,
  position = "bottom-left",
}: {
  entries: number;
  position?: "bottom-left" | "top-right";
}) {
  const base: React.CSSProperties = {
    position: "absolute",
    padding: 12,
    borderRadius: 16,
    zIndex: 10,
    background:
      "linear-gradient(180deg, rgba(20,35,61,0.55) 0%, rgba(11,18,32,0.55) 100%)",
    border: "1px solid rgba(126,196,255,0.25)",
    boxShadow:
      "0 10px 30px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)",
    backdropFilter: "blur(10px)",
    color: "#EAF2FF",
    minWidth: 240,
  };
  const posStyle: React.CSSProperties =
    position === "bottom-left"
      ? { left: 12, bottom: 12 }
      : { right: 12, top: 12 };

  const totalPill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 12,
    lineHeight: 1,
    background:
      "linear-gradient(180deg, rgba(126,196,255,0.20), rgba(78,164,255,0.18))",
    border: "1px solid rgba(126,196,255,0.35)",
  };

  return (
    <div style={{ ...base, ...posStyle }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div aria-hidden>{aisRadarSVG(18)}</div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 0.4,
              opacity: 0.95,
            }}
          >
            AIS status
          </div>
        </div>
        <div style={totalPill}>
          <span aria-hidden style={{ display: "inline-flex" }}>
            {aisCounterSVG(14)}
          </span>
          <span style={{ opacity: 0.9 }}>total</span>
          <span style={{ fontWeight: 900 }}>{entries}</span>
        </div>
      </div>
    </div>
  );
}

function aisRadarSVG(size = 18) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="AIS">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7CC4FF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4EA4FF" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#g)" opacity="0.35" />
      <path
        d="M12 2 A10 10 0 0 1 22 12"
        stroke="#7CC4FF"
        strokeWidth="1.2"
        fill="none"
        opacity="0.9"
      />
      <path
        d="M12 5 A7 7 0 0 1 19 12"
        stroke="#7CC4FF"
        strokeWidth="1.2"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M12 8 A4 4 0 0 1 16 12"
        stroke="#7CC4FF"
        strokeWidth="1.2"
        fill="none"
        opacity="0.55"
      />
      <circle cx="12" cy="12" r="2" fill="#7CC4FF" />
    </svg>
  );
}
function aisCounterSVG(size = 14) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label="Total">
      <rect
        x="2"
        y="4"
        width="16"
        height="12"
        rx="3"
        fill="rgba(126,196,255,0.22)"
        stroke="rgba(126,196,255,0.7)"
      />
      <path
        d="M5 10h3M9 10h6"
        stroke="#7CC4FF"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function bellSVG(size = 16) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3a5 5 0 0 1 5 5v2.6c0 .6.2 1.2.6 1.7l1 1.2c.7.8.1 2.1-.9 2.1H5.3c-1 0-1.6-1.3-.9-2.1l1-1.2c.4-.5.6-1.1.6-1.7V8a5 5 0 0 1 5-5Z"
        fill="#FFD2D2"
      />
      <path
        d="M9 18c.5 1.2 1.7 2 3 2s2.5-.8 3-2"
        fill="none"
        stroke="#FFC2C2"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function warningSVG(size = 16) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3 2 20h20L12 3Z"
        fill="rgba(255,120,120,.22)"
        stroke="rgba(255,120,120,.7)"
        strokeWidth="1.3"
      />
      <path
        d="M12 8v6"
        stroke="#FFC6C6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.5" r="1.2" fill="#FFC6C6" />
    </svg>
  );
}
function miniShipSVG(size = 16) {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 L22 16 L16 30 L10 16 Z" fill="#4EA4FF" stroke="#2E79CC" stroke-width="1.2"/>
    </svg>
  `;
}
function shipSVG({
  size = 24,
  fill = "#A7D0FF",
}: {
  size?: number;
  fill?: string;
}) {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 32 32">
    <defs>
      <filter id="halo" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <path d="M16 16 L16 3 A13 13 0 0 1 28 16 Z" fill="rgba(80,160,255,0.15)"/>
    <path data-body d="M16 2 L22 16 L16 30 L10 16 Z"
          fill="${fill}" stroke="#2E79CC" stroke-width="1.2" filter="url(#halo)"/>
  </svg>`;
}

function vesselPopupHtml(t: AISTarget) {
  const limit = (() => {
    try {
      return getSpeedLimitKts();
    } catch {
      return DEFAULT_SPEED_LIMIT_KTS;
    }
  })();

  const sog = t.sog ?? null;
  const isSpeeding = sog != null && sog >= limit;
  const over = sog != null ? Math.max(0, sog - limit) : 0;

  const sogTxt = sog != null ? `${sog.toFixed(1)} kn` : "—";
  const cogTxt = t.cog != null ? `${Math.round(t.cog)}°` : "—";
  const name = (t.name && t.name.trim()) || `MMSI ${t.mmsi}`;

  const pill = isSpeeding
    ? `<span style="
          display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:10px;
          background:rgba(255,120,120,0.16);border:1px solid rgba(255,120,120,0.55);
          color:#FFECEC;font-weight:850;line-height:1;">⚠︎ Speeding • +${over.toFixed(
            1,
          )} kn</span>`
    : `<span style="
          display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:10px;
          background:rgba(126,196,255,0.16);border:1px solid rgba(126,196,255,0.45);
          color:#EAF2FF;font-weight:800;line-height:1;">✓ Within limit</span>`;

  const sogValue = isSpeeding
    ? `<span style="color:#FFD2D2;font-weight:900">${sogTxt}</span>
       <span style="opacity:.75;margin-left:6px;font-weight:700">(limit: ${limit} kn)</span>`
    : `<span style="color:#EAF2FF;font-weight:800">${sogTxt}</span>
       <span style="opacity:.65;margin-left:6px">(limit: ${limit} kn)</span>`;

  return `
    <div id="ims-popup-root" style="
      font:600 12px/1.35 system-ui,-apple-system,Segoe UI,Roboto;
      color:#EAF2FF;
      background:linear-gradient(180deg,rgba(20,35,61,0.55) 0%, rgba(11,18,32,0.55) 100%);
      border:1px solid rgba(126,196,255,0.25);
      box-shadow:0 10px 30px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06);
      backdrop-filter:blur(10px);
      border-radius:16px; padding:12px 14px; min-width:260px;">
      
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${miniShipSVG(16)}
          <div style="font-weight:800;letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(name)}
          </div>
        </div>
        ${pill}
      </div>

      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);margin:6px 0 10px;"></div>

      <div style="display:grid;grid-template-columns:auto 1fr;row-gap:8px;column-gap:12px;font-weight:700;">
        <div style="opacity:.8;">SOG</div><div>${sogValue}</div>
        <div style="opacity:.8;">COG</div><div>${cogTxt}</div>
        <div style="opacity:.8;">MMSI</div><div>${t.mmsi}</div>
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) =>
    m === "&"
      ? "&amp;"
      : m === "<"
      ? "&lt;"
      : m === ">"
      ? "&gt;"
      : m === '"'
      ? "&quot;"
      : "&#39;",
  );
}

function ensurePopupCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ims-popup-style")) return;
  const style = document.createElement("style");
  style.id = "ims-popup-style";
  style.textContent = `
    .ims-popup { z-index: 99999 !important; }
    .ims-popup .maplibregl-popup-content { background: transparent !important; box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }
    .ims-popup .maplibregl-popup-tip { display: none !important; }
    .ims-popup .maplibregl-popup-close-button {
      position: absolute !important;
      top: 5px !important;
      right: 10px !important;
      background: none !important;
      border: none !important;
      color: #EAF2FF !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      cursor: pointer;
      opacity: 0.7;
      text-shadow: 0 0 4px rgba(0,0,0,0.5);
      transition: opacity 0.2s ease, transform 0.15s ease;
      z-index: 100000 !important;
    }
    .ims-popup .maplibregl-popup-close-button:hover { opacity: 1; transform: scale(1.15); }
    .ims-marker { -webkit-tap-highlight-color: transparent; }
  `;
  document.head.appendChild(style);
}
function ensurePingCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ims-ping-style")) return;
  const style = document.createElement("style");
  style.id = "ims-ping-style";
  style.textContent = `
    .ims-ping {
      width: 14px; height: 14px; border-radius: 9999px; background: #7CC4FF;
      box-shadow: 0 0 0 0 rgba(124,196,255,0.6);
      transform: translate(-50%, -50%); animation: ims-ping-anim 1.6s ease-out infinite;
      border: 2px solid #EAF6FF;
    }
    @keyframes ims-ping-anim {
      0% { box-shadow: 0 0 0 0 rgba(124,196,255,0.60); opacity: 1; }
      70% { box-shadow: 0 0 0 24px rgba(124,196,255,0.00); opacity: .9; }
      100% { box-shadow: 0 0 0 0 rgba(124,196,255,0.00); opacity: 0.8; }
    }
  `;
  document.head.appendChild(style);
}
function ensureAlertCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ims-alert-style")) return;
  const style = document.createElement("style");
  style.id = "ims-alert-style";
  style.textContent = `
    .ims-alert {
      border-radius: 9999px;
      transform: translate(-50%, -50%);
      background: radial-gradient(closest-side, rgba(255,120,120,.40), rgba(255,120,120,.18) 60%, rgba(255,120,120,0) 70%);
      box-shadow: 0 0 0 0 rgba(255,120,120,.55);
      animation: ims-alert-pulse 1.8s ease-out infinite;
      border: 2px solid rgba(255,220,220,0.9);
      z-index: 7000;
      pointer-events: auto;
    }
    @keyframes ims-alert-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(255,120,120,.55);   opacity: .95; }
      70%  { box-shadow: 0 0 0 32px rgba(255,120,120,0); opacity: .92; }
      100% { box-shadow: 0 0 0 0 rgba(255,120,120,0);   opacity: .90; }
    }
  `;
  document.head.appendChild(style);
}
