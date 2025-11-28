import { NextRequest } from "next/server";

const OPEN_METEO_LAT = process.env.OPEN_METEO_LAT || "21.5";
const OPEN_METEO_LON = process.env.OPEN_METEO_LON || "39.2";
const RECO_BASE_URL  = process.env.RECO_BASE_URL  || "http://localhost:8000";

type FeatureRow = {
  sog: number;
  ws_t: number;  wg_t: number;  temp_t: number; prec_t: number;
  ws_t1: number; wg_t1: number; temp_t1: number; prec_t1: number;
  d_ws_1h: number; d_temp_1h: number;
  hour_of_day: number; weekday: number;
  lat: number; lon: number;
  dcog: number;
  nav_status?: number | null;
  windDeg?: number | null;
};

function toNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const MS_TO_KT = 1.94384;

async function runAlerts(params: {
  lat?: number;
  lon?: number;
  sog?: number;
  mmsi?: number;
  dcog?: number;
  windDeg?: number;
  nav_status?: number;
}) {
  try {
    const lat  = toNum(params.lat, Number(OPEN_METEO_LAT));
    const lon  = toNum(params.lon, Number(OPEN_METEO_LON));
    const sog  = toNum(params.sog, NaN);
    const mmsi = toNum(params.mmsi, NaN);

    const dcog       = toNum(params.dcog, 0);
    const windDeg0   = params.windDeg;
    const nav_status = params.nav_status;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      !Number.isFinite(sog) ||
      !Number.isFinite(mmsi)
    ) {
      console.log("[alerts] missing core fields", { lat, lon, sog, mmsi });
      return Response.json({ alerts: [] }, { status: 200 });
    }

    if (sog < 5) {
      console.log("[alerts] sog too low, skipping", { sog, mmsi });
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
    om.searchParams.set("forecast_days", "1");
    om.searchParams.set("timezone", "UTC");

    const wxRes = await fetch(om.toString(), { cache: "no-store" });
    if (!wxRes.ok) {
      console.log("[alerts] weather_fetch_failed", wxRes.status);
      return Response.json(
        { alerts: [], error: "weather_fetch_failed" },
        { status: 200 },
      );
    }
    const wx = await wxRes.json();

    const ws_t   = toNum(wx?.current?.wind_speed_10m, 0);
    const wg_t   = toNum(wx?.current?.wind_gusts_10m, ws_t);
    const temp_t = toNum(wx?.current?.temperature_2m, 25);
    const prec_t = toNum(wx?.current?.precipitation, 0);

    const windDir0 = toNum(
      wx?.current?.wind_direction_10m,
      windDeg0 ?? 0,
    );

    const i1      = 1;
    const ws_t1   = toNum(wx?.hourly?.wind_speed_10m?.[i1], ws_t);
    const wg_t1   = toNum(wx?.hourly?.wind_gusts_10m?.[i1], Math.max(ws_t1, wg_t));
    const temp_t1 = toNum(wx?.hourly?.temperature_2m?.[i1], temp_t);
    const prec_t1 = toNum(wx?.hourly?.precipitation?.[i1], prec_t);

    const ws0_kts = ws_t   * MS_TO_KT;
    const wg0_kts = wg_t   * MS_TO_KT;
    const ws1_kts = ws_t1  * MS_TO_KT;
    const wg1_kts = wg_t1  * MS_TO_KT;

    const d_ws_1h   = ws1_kts - ws0_kts;
    const d_temp_1h = temp_t1 - temp_t;

    const now  = new Date();
    const hour = now.getUTCHours();
    const wday = now.getUTCDay();

    const row: FeatureRow = {
      sog,
      ws_t: ws0_kts,
      wg_t: wg0_kts,
      temp_t,
      prec_t,
      ws_t1: ws1_kts,
      wg_t1: wg1_kts,
      temp_t1,
      prec_t1,
      d_ws_1h,
      d_temp_1h,
      hour_of_day: hour,
      weekday: wday,
      lat,
      lon,
      dcog,
      nav_status,
      windDeg: windDir0,
    };

    const bodyStr = JSON.stringify(row);
    console.log(
      "[alerts][request] ->",
      `${RECO_BASE_URL}/reco/predict`,
      bodyStr.slice(0, 300),
    );

    const reco = await fetch(`${RECO_BASE_URL}/reco/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bodyStr,
    });

    const text = await reco.text();
    console.log("[alerts][response] <-", reco.status, text.slice(0, 300));

    if (!reco.ok) {
      return Response.json(
        { alerts: [], error: "reco_unavailable", status: reco.status },
        { status: 200 },
      );
    }

    let out: any;
    try {
      out = JSON.parse(text);
    } catch {
      out = {};
    }

    const msg = String(out?.text || "").trim();

    if (!msg || /no significant changes/i.test(msg)) {
      console.log("[alerts] neutral message, no alert");
      return Response.json({ alerts: [] }, { status: 200 });
    }

    const alert = {
      id: `ML-${mmsi}-${Date.now()}`,
      ts: Date.now(),
      text: msg,
      lat,
      lon,
      mmsi,
    };

    console.log("[alerts] emitting alert", alert);

    return Response.json({ alerts: [alert] }, { status: 200 });
  } catch (e) {
    console.error("[alerts] error:", e);
    return Response.json(
      { alerts: [], error: "unexpected_error" },
      { status: 200 },
    );
  }
}

export async function GET(req: NextRequest) {
  console.log("[alerts] GET hit:", req.url);
  const url = new URL(req.url);
  return runAlerts({
    lat: Number(url.searchParams.get("lat")),
    lon: Number(url.searchParams.get("lon")),
    sog: Number(url.searchParams.get("sog")),
    mmsi: Number(url.searchParams.get("mmsi")),
    dcog: Number(url.searchParams.get("dcog")),
    windDeg: Number(url.searchParams.get("windDeg")),
    nav_status: Number(url.searchParams.get("nav")),
  });
}

export async function POST(req: NextRequest) {
  console.log("[alerts] POST hit");
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return runAlerts({
    lat: Number(body.lat),
    lon: Number(body.lon),
    sog: Number(body.sog),
    mmsi: Number(body.mmsi),
    dcog: Number(body.dcog),
    windDeg: Number(body.windDeg),
    nav_status: Number(body.nav_status),
  });
}
