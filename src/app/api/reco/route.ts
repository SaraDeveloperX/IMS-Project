import { NextRequest } from "next/server";

const OPEN_METEO_LAT = process.env.OPEN_METEO_LAT || "21.5";
const OPEN_METEO_LON = process.env.OPEN_METEO_LON || "39.2";
const RECO_BASE_URL  = process.env.RECO_BASE_URL  || "http://localhost:8000";

type TimeStep = {
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  ws_t: number;
  wg_t: number;
  temp_t: number;
  prec_t: number;
  ws_t1: number;
  wg_t1: number;
  temp_t1: number;
  prec_t1: number;
  d_ws_1h: number;
  d_temp_1h: number;
  dcog: number;
  dsog: number;
  hour_of_day: number;
  weekday: number;
};

const WINDOW = 8;
const MS_TO_KT = 1.94384;

function toNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeJson<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function runReco(params: {
  lat?: number;
  lon?: number;
  sog?: number;
  mmsi?: number;
  cog?: number;
  dcog?: number;
  windDeg?: number;
}) {
  try {
    const lat  = toNum(params.lat, Number(OPEN_METEO_LAT));
    const lon  = toNum(params.lon, Number(OPEN_METEO_LON));
    const sog  = toNum(params.sog, NaN);
    const mmsi = toNum(params.mmsi, NaN);
    const cog  = toNum(params.cog, 0);
    const dcog = toNum(params.dcog, 0);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(sog) ||
      !Number.isFinite(mmsi)
    ) {
      return Response.json({ alerts: [] }, { status: 200 });
    }

    if (sog < 5) {
      return Response.json({ alerts: [] }, { status: 200 });
    }

    const om = new URL("https://api.open-meteo.com/v1/forecast");
    om.searchParams.set("latitude", String(lat));
    om.searchParams.set("longitude", String(lon));
    om.searchParams.set(
      "current",
      "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,weather_code,wind_direction_10m",
    );
    om.searchParams.set(
      "hourly",
      "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,wind_direction_10m",
    );
    om.searchParams.set("forecast_days", "2");
    om.searchParams.set("timezone", "UTC");

    const wxRes = await fetch(om.toString(), { cache: "no-store" });
    if (!wxRes.ok) {
      return Response.json(
        { alerts: [], error: "weather_fetch_failed" },
        { status: 200 },
      );
    }
    const wx = await wxRes.json();

    const hourlyTimes: string[] = wx?.hourly?.time || [];
    const wsArr: number[] = wx?.hourly?.wind_speed_10m || [];
    const wgArr: number[] = wx?.hourly?.wind_gusts_10m || [];
    const tArr: number[] = wx?.hourly?.temperature_2m || [];
    const pArr: number[] = wx?.hourly?.precipitation || [];

    if (!hourlyTimes.length) {
      return Response.json(
        { alerts: [], error: "no_hourly_weather" },
        { status: 200 },
      );
    }

    const now = new Date();
    const nowIsoHour = now.toISOString().slice(0, 13);

    let baseIdx = 0;
    for (let i = 0; i < hourlyTimes.length; i++) {
      const t = hourlyTimes[i];
      if (typeof t === "string" && t.startsWith(nowIsoHour)) {
        baseIdx = i;
        break;
      }
    }

    if (baseIdx + WINDOW >= hourlyTimes.length) {
      return Response.json(
        { alerts: [], error: "not_enough_hours" },
        { status: 200 },
      );
    }

    const steps: TimeStep[] = [];

    for (let k = 0; k < WINDOW; k++) {
      const i = baseIdx + k;
      const i1 = Math.min(i + 1, hourlyTimes.length - 1);

      const ws0_ms = toNum(wsArr[i], 0);
      const wg0_ms = toNum(wgArr[i], ws0_ms);
      const t0     = toNum(tArr[i], 25);
      const p0     = toNum(pArr[i], 0);

      const ws1_ms = toNum(wsArr[i1], ws0_ms);
      const wg1_ms = toNum(wgArr[i1], Math.max(ws1_ms, wg0_ms));
      const t1     = toNum(tArr[i1], t0);
      const p1     = toNum(pArr[i1], p0);

      const ws0_kts = ws0_ms * MS_TO_KT;
      const wg0_kts = wg0_ms * MS_TO_KT;
      const ws1_kts = ws1_ms * MS_TO_KT;
      const wg1_kts = wg1_ms * MS_TO_KT;

      const d_ws_1h   = ws1_kts - ws0_kts;
      const d_temp_1h = t1 - t0;

      const ts          = new Date(hourlyTimes[i] || now);
      const hour_of_day = ts.getUTCHours();
      const weekday     = ts.getUTCDay();

      steps.push({
        lat,
        lon,
        sog,
        cog,
        heading: cog,
        ws_t: ws0_kts,
        wg_t: wg0_kts,
        temp_t: t0,
        prec_t: p0,
        ws_t1: ws1_kts,
        wg_t1: wg1_kts,
        temp_t1: t1,
        prec_t1: p1,
        d_ws_1h,
        d_temp_1h,
        dcog,
        dsog: 0,
        hour_of_day,
        weekday,
      });
    }

    const bodyToSend = { steps };

    console.log(
      "[reco][request] ->",
      RECO_BASE_URL,
      JSON.stringify(bodyToSend).slice(0, 300),
    );

    const reco = await fetch(`${RECO_BASE_URL}/predict-window`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyToSend),
    });

    const text = await reco.text();
    console.log("[reco][response] <-", reco.status, text.slice(0, 300));

    if (!reco.ok) {
      return Response.json(
        { alerts: [], error: "reco_unavailable", status: reco.status },
        { status: 200 },
      );
    }

    const out = safeJson<any>(text) || {};

    const recommendations: string[] = Array.isArray(out?.recommendations)
      ? out.recommendations
      : [];

    const alertsFlags: Record<string, number> =
      (out?.alerts as Record<string, number>) || {};

    const hasAnyAlert = Object.values(alertsFlags).some((v) => v === 1);

    const textAlert =
      (recommendations && recommendations[0]) ||
      (hasAnyAlert
        ? "Model indicates elevated short-term risk in this area."
        : "");

    if (!textAlert) {
      return Response.json({ alerts: [] }, { status: 200 });
    }

    const alert = {
      id: `ML-${mmsi}-${Date.now()}`,
      ts: Date.now(),
      text: String(textAlert).trim(),
      lat,
      lon,
      mmsi,
    };

    return Response.json({ alerts: [alert] }, { status: 200 });
  } catch (e) {
    console.error("[reco alerts] error:", e);
    return Response.json(
      { alerts: [], error: "unexpected_error" },
      { status: 200 },
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return runReco({
    lat: Number(url.searchParams.get("lat")),
    lon: Number(url.searchParams.get("lon")),
    sog: Number(url.searchParams.get("sog")),
    mmsi: Number(url.searchParams.get("mmsi")),
    cog: Number(url.searchParams.get("cog")),
    dcog: Number(url.searchParams.get("dcog")),
    windDeg: Number(url.searchParams.get("windDeg")),
  });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  return runReco({
    lat: Number(body.lat),
    lon: Number(body.lon),
    sog: Number(body.sog),
    mmsi: Number(body.mmsi),
    cog: Number(body.cog),
    dcog: Number(body.dcog),
    windDeg: Number(body.windDeg),
  });
}
