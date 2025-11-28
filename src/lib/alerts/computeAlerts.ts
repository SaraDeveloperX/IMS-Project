export type AlertItem = {
  id: string;
  ts: number;
  type: "CLOSE_PASS" | "SPEEDING" | "GEOFENCE" | "WEATHER";
  title: string;
  desc?: string;
  lat?: number;
  lon?: number;
  mmsiA?: number;
  mmsiB?: number;
  cpaNM?: number;
  tcpaSec?: number;
};

type AISTarget = {
  mmsi: number;
  lat?: number; lon?: number;
  sog?: number; cog?: number;
  name?: string;
  last?: number;
};

type WeatherLite = {
  windKts: number;
  windGustKts?: number;
  windDeg?: number;
  wcode?: number;
};

type BBox = [number, number, number, number];

type Cfg = {
  speedingKts?: number;
  minSpeedKts?: number;
  closePassNM?: number;
  maxTcpaSec?: number;
  minCpaNM?: number;
  severeWindKts?: number;
  windWarnKts?: number;
  gustDeltaWarn?: number;
  wxRingNm?: number;
  geofence?: { name: string; bbox: BBox }[];
  anchorMode?: boolean;
  anchorDriftWarnNm?: number;
  anchorDriftDangerNm?: number;
  routeTo?: { lat: number; lon: number; xtrackMaxNm?: number };
  aisStaleMs?: number;
  cooldownMs?: number;
};

const NM_PER_M = 1 / 1852;
const DEG2RAD = Math.PI / 180;
const KTS_TO_MPS = 1852 / 3600;
const Rm = 6371000;

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function distM(a: [number, number], b: [number, number]) {
  const dLat = (b[1] - a[1]) * DEG2RAD;
  const dLon = (b[0] - a[0]) * DEG2RAD;
  const lat1 = a[1] * DEG2RAD, lat2 = b[1] * DEG2RAD;
  const s = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * Rm * Math.asin(Math.sqrt(s));
}

function cpaTcpaMeters(
  p1: [number, number], v1ms: number, cog1deg: number,
  p2: [number, number], v2ms: number, cog2deg: number
) {
  const lon0 = (p1[0] + p2[0]) / 2;
  const lat0 = (p1[1] + p2[1]) / 2;
  const m_per_deg_lat =
    111132.954 - 559.822 * Math.cos(2*lat0*DEG2RAD) + 1.175 * Math.cos(4*lat0*DEG2RAD);
  const m_per_deg_lon = 111132.954 * Math.cos(lat0*DEG2RAD);

  const toXY = (pt:[number,number]) => ({
    x: (pt[0]-lon0) * m_per_deg_lon,
    y: (pt[1]-lat0) * m_per_deg_lat
  });

  const A = toXY(p1), B = toXY(p2);
  const v1 = { x: v1ms * Math.sin(cog1deg*DEG2RAD), y: v1ms * Math.cos(cog1deg*DEG2RAD) };
  const v2 = { x: v2ms * Math.sin(cog2deg*DEG2RAD), y: v2ms * Math.cos(cog2deg*DEG2RAD) };

  const rx = A.x - B.x, ry = A.y - B.y;
  const vx = v1.x - v2.x, vy = v1.y - v2.y;

  const rv2 = vx*vx + vy*vy;
  let tcpa = 0;
  if (rv2 > 1e-6) tcpa = - (rx*vx + ry*vy) / rv2;
  const dcpa = Math.sqrt( (rx + vx*tcpa)**2 + (ry + vy*tcpa)**2 );
  return { dcpa, tcpa };
}

const lastFiredAt = new Map<string, number>();
function shouldFire(key: string, now: number, coolMs: number) {
  const last = lastFiredAt.get(key) ?? 0;
  if (now - last < coolMs) return false;
  lastFiredAt.set(key, now);
  return true;
}

export function computeAlerts(
  targetsMap: Map<string, AISTarget> | Record<string, AISTarget>,
  weather: WeatherLite | undefined,
  cfg: Cfg
): AlertItem[] {
  const now = Date.now();
  const cooldownMs = cfg.cooldownMs ?? 60_000;

  const closePassNM = cfg.closePassNM ?? 0.5;
  const minCpaNM = cfg.minCpaNM ?? 0.05;
  const maxTcpaSec = cfg.maxTcpaSec ?? 15 * 60;

  const speedLimit = cfg.speedingKts ?? 18;
  const minSpeed = cfg.minSpeedKts;

  const windWarn = cfg.windWarnKts ?? 20;
  const severeWind = cfg.severeWindKts ?? 28;
  const gustWarn = cfg.gustDeltaWarn ?? 8;

  const anchorWarn = cfg.anchorDriftWarnNm ?? 0.05;
  const anchorDanger = cfg.anchorDriftDangerNm ?? 0.15;
  const aisStaleMs = cfg.aisStaleMs ?? 90_000;

  const res: AlertItem[] = [];
  const seenPairs = new Set<string>();

  const arr: AISTarget[] = targetsMap instanceof Map
    ? Array.from(targetsMap.values())
    : Object.values(targetsMap as any);

  const good = arr
    .map(t => ({
      ...t,
      lat: num(t.lat),
      lon: num(t.lon),
      sog: t.sog != null ? num(t.sog) : undefined,
      cog: t.cog != null ? num(t.cog) : undefined,
      last: t.last != null ? num(t.last) : undefined,
    }))
    .filter(t => Number.isFinite(t.lat) && Number.isFinite(t.lon));

  for (let i=0;i<good.length;i++) {
    const a = good[i];
    if (!Number.isFinite(a.sog) || !Number.isFinite(a.cog) || (a.sog as number) < 0.5) continue;

    for (let j=i+1;j<good.length;j++) {
      const b = good[j];
      if (!Number.isFinite(b.sog) || !Number.isFinite(b.cog) || (b.sog as number) < 0.5) continue;

      const keyPair = `${Math.min(a.mmsi,b.mmsi)}-${Math.max(a.mmsi,b.mmsi)}`;
      if (seenPairs.has(keyPair)) continue;
      seenPairs.add(keyPair);

      const { dcpa, tcpa } = cpaTcpaMeters(
        [a.lon!, a.lat!], (a.sog as number)*KTS_TO_MPS, a.cog!,
        [b.lon!, b.lat!], (b.sog as number)*KTS_TO_MPS, b.cog!
      );

      const cpaNM = dcpa * NM_PER_M;
      if (tcpa < 0 || tcpa > maxTcpaSec) continue;
      if (cpaNM > closePassNM || cpaNM < minCpaNM) continue;

      const staleA = Number.isFinite(a.last) && (now - (a.last as number) > aisStaleMs);
      const staleB = Number.isFinite(b.last) && (now - (b.last as number) > aisStaleMs);
      const staleNote = (staleA || staleB)
        ? ` (AIS stale: ${[
            staleA ? (a.name ?? a.mmsi) : null,
            staleB ? (b.name ?? b.mmsi) : null
          ].filter(Boolean).join(", ")})`
        : "";

      const coolKey = `CPA.${keyPair}`;
      if (!shouldFire(coolKey, now, cooldownMs)) continue;

      res.push({
        id: `CPA-${keyPair}-${now}`,
        ts: now,
        type: "CLOSE_PASS",
        title: "CPA risk detected",
        desc: `Predicted CPA ${cpaNM.toFixed(2)} NM in ${Math.round(tcpa)}s between ${a.name ?? a.mmsi} and ${b.name ?? b.mmsi}.${staleNote}`,
        lat: (a.lat!+b.lat!)/2,
        lon: (a.lon!+b.lon!)/2,
        mmsiA: a.mmsi, mmsiB: b.mmsi,
        cpaNM, tcpaSec: Math.round(tcpa),
      });
    }
  }

  for (const t of good) {
    if (Number.isFinite(t.sog)) {
      const sog = t.sog as number;
      if (sog > speedLimit) {
        const key = `SPD.high.${t.mmsi}`;
        if (shouldFire(key, now, cooldownMs)) {
          res.push({
            id: `SPD-${t.mmsi}-${now}`,
            ts: now,
            type: "SPEEDING",
            title: "Speed limit exceeded",
            desc: `${t.name ?? t.mmsi} at ${sog.toFixed(1)} kts (limit ${speedLimit} kn).`,
            lat: t.lat, lon: t.lon, mmsiA: t.mmsi,
          });
        }
      }
      if (minSpeed != null && sog < minSpeed) {
        const key = `SPD.low.${t.mmsi}`;
        if (shouldFire(key, now, cooldownMs)) {
          res.push({
            id: `SPDLOW-${t.mmsi}-${now}`,
            ts: now,
            type: "SPEEDING",
            title: "Unusually low speed",
            desc: `${t.name ?? t.mmsi} at ${sog.toFixed(1)} kts (< ${minSpeed} kn).`,
            lat: t.lat, lon: t.lon, mmsiA: t.mmsi,
          });
        }
      }
    }
  }

  for (const fence of (cfg.geofence ?? [])) {
    const [minLon, minLat, maxLon, maxLat] = fence.bbox;
    for (const t of good) {
      const inside = t.lon!>=minLon && t.lon!<=maxLon && t.lat!>=minLat && t.lat!<=maxLat;
      if (!inside) continue;
      const key = `GF.${fence.name}.${t.mmsi}`;
      if (!shouldFire(key, now, cooldownMs)) continue;
      res.push({
        id: `GF-${t.mmsi}-${now}`,
        ts: now,
        type: "GEOFENCE",
        title: `Inside ${fence.name}`,
        desc: `${t.name ?? t.mmsi} is inside ${fence.name}.`,
        lat: t.lat, lon: t.lon, mmsiA: t.mmsi,
      });
    }
  }

  if (cfg.anchorMode) {
    const anchorKey = "__ims_anchor_ref__";
    const g = globalThis as any;
    const me = pickMyVessel(good);
    if (me) {
      if (!g[anchorKey]) g[anchorKey] = { lat: me.lat!, lon: me.lon! };
      const ref = g[anchorKey] as { lat: number; lon: number };
      const dNm = distM([me.lon!, me.lat!], [ref.lon, ref.lat]) * NM_PER_M;
      const sog = me.sog ?? 0;

      if (sog < 1) {
        const level = dNm >= anchorDanger ? "danger" : dNm >= anchorWarn ? "warn" : null;
        if (level) {
          const key = `ANCHOR.${level}`;
          if (shouldFire(key, now, cooldownMs)) {
            res.push({
              id: `ANCHOR-${level}-${now}`,
              ts: now,
              type: "GEOFENCE",
              title: level === "danger" ? "Significant anchor drift" : "Anchor drift",
              desc: `Drift ${dNm.toFixed(2)} nm.`,
              lat: me.lat, lon: me.lon, mmsiA: me.mmsi,
            });
          }
        }
      }
    }
  }

  if (cfg.routeTo?.lat != null && cfg.routeTo?.lon != null) {
    const me = pickMyVessel(good);
    if (me) {
      const xtrack = distM([me.lon!, me.lat!], [cfg.routeTo.lon, cfg.routeTo.lat]) * NM_PER_M;
      const limit = cfg.routeTo.xtrackMaxNm ?? 0.3;
      if (xtrack > limit) {
        const key = `XTRACK.${me.mmsi}`;
        if (shouldFire(key, now, cooldownMs)) {
          res.push({
            id: `XTRACK-${me.mmsi}-${now}`,
            ts: now,
            type: "GEOFENCE",
            title: "Route deviation",
            desc: `Cross-track error ${xtrack.toFixed(2)} nm (limit ${limit} nm).`,
            lat: me.lat, lon: me.lon, mmsiA: me.mmsi,
          });
        }
      }
    }
  }

  if (weather && Number.isFinite(weather.windKts)) {
    const w = weather.windKts;
    const stormy = (weather.wcode ?? 0) >= 95;
    if (stormy) {
      const key = `WX.storm`;
      if (shouldFire(key, now, cooldownMs)) {
        res.push({
          id: `WX-STORM-${now}`,
          ts: now,
          type: "WEATHER",
          title: "Thunderstorm",
          desc: `Severe weather in area.`,
        });
      }
    }
    if (w >= severeWind) {
      const key = `WX.severe`;
      if (shouldFire(key, now, cooldownMs)) {
        res.push({
          id: `WX-SEV-${now}`,
          ts: now,
          type: "WEATHER",
          title: "Severe wind conditions",
          desc: `Wind ${w.toFixed(1)} kts.`,
        });
      }
    } else if (w >= windWarn) {
      const key = `WX.warn`;
      if (shouldFire(key, now, cooldownMs)) {
        res.push({
          id: `WX-WARN-${now}`,
          ts: now,
          type: "WEATHER",
          title: "Strong wind",
          desc: `Wind ${w.toFixed(1)} kts.`,
        });
      }
    }
    if (Number.isFinite(weather.windGustKts) && (weather.windGustKts! - w) >= gustWarn) {
      const key = `WX.gust`;
      if (shouldFire(key, now, cooldownMs)) {
        res.push({
          id: `WX-GUST-${now}`,
          ts: now,
          type: "WEATHER",
          title: "Gusty wind",
          desc: `Gusts up to ${weather.windGustKts!.toFixed(1)} kts.`,
        });
      }
    }
    if (cfg.wxRingNm) {
      const me = pickMyVessel(good);
      if (me) {
        const key = `WX.ring`;
        if (shouldFire(key, now, cooldownMs)) {
          res.push({
            id: `WX-RING-${now}`,
            ts: now,
            type: "WEATHER",
            title: `Weather ring ${cfg.wxRingNm} nm`,
            desc: `Center at vessel position.`,
            lat: me.lat, lon: me.lon, mmsiA: me.mmsi,
          });
        }
      }
    }
  }

  res.sort((a,b) => {
    const w = (t:AlertItem["type"]) =>
      t==="CLOSE_PASS"?3 : t==="SPEEDING"?2 : t==="GEOFENCE"?1 : 0;
    const d = w(b.type)-w(a.type);
    return d!==0 ? d : b.ts - a.ts;
  });

  return res.slice(0, 10);
}

function pickMyVessel(list: AISTarget[]) {
  let best: AISTarget | null = null;
  let score = -Infinity;
  const now = Date.now();
  for (const v of list) {
    const sog = Number.isFinite(v.sog) ? (v.sog as number) : 0;
    const freshness = Number.isFinite(v.last) ? Math.max(0, 1 - (now - (v.last as number))/120000) : 0.5;
    const s = sog * 2 + freshness;
    if (s > score) { score = s; best = v; }
  }
  return best;
}
