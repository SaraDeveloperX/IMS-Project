// src/lib/recoClient.ts
type AisLite = { mmsi?: number; lat: number; lon: number; sog?: number; cog?: number; name?: string };

type FeatureRow = {
  sog: number; ws_t: number; wg_t: number; temp_t: number; prec_t: number;
  ws_t1: number; wg_t1: number; temp_t1: number; prec_t1: number;
  d_ws_1h: number; d_temp_1h: number;
  hour_of_day: number; weekday: number;
  lat: number; lon: number; dcog: number;
};

type RecoOut = { probs: Record<string, number>; bins: Record<string, number>; text: string };

// ➊ دالة تجيب الطقس من Open-Meteo لوقتين: الآن و+1h
async function fetchOpenMeteo(lat: number, lon: number) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", String(lat));
  u.searchParams.set("longitude", String(lon));
  u.searchParams.set("current", "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation");
  u.searchParams.set("hourly", "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation");
  u.searchParams.set("windspeed_unit", "kn");
  u.searchParams.set("timezone", "UTC");

  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) return null;
  const d = await r.json();

  const c = d.current;
  const H = d.hourly;
  if (!H || !H.time) return null;
  const idxNext = Math.min(1, H.time.length - 1); // بعد ساعة فقط

  const now = {
    ws: c.wind_speed_10m ?? 0,
    wg: c.wind_gusts_10m ?? c.wind_speed_10m ?? 0,
    temp: c.temperature_2m ?? 0,
    prec: c.precipitation ?? 0,
  };
  const next1h = {
    ws: H.wind_speed_10m[idxNext] ?? now.ws,
    wg: H.wind_gusts_10m[idxNext] ?? now.wg,
    temp: H.temperature_2m[idxNext] ?? now.temp,
    prec: H.precipitation[idxNext] ?? 0,
  };
  return { now, next1h };
}

// ➋ نحسب الفروق ونبني FeatureRow لتمريره للمودل
function buildRow(v: AisLite, wx: any): FeatureRow {
  const dt = new Date();
  return {
    sog: v.sog ?? 0,
    ws_t: wx.now.ws, wg_t: wx.now.wg, temp_t: wx.now.temp, prec_t: wx.now.prec,
    ws_t1: wx.next1h.ws, wg_t1: wx.next1h.wg, temp_t1: wx.next1h.temp, prec_t1: wx.next1h.prec,
    d_ws_1h: wx.next1h.ws - wx.now.ws,
    d_temp_1h: wx.next1h.temp - wx.now.temp,
    hour_of_day: dt.getUTCHours(),
    weekday: dt.getUTCDay(),
    lat: v.lat, lon: v.lon, dcog: v.cog ?? 0,
  };
}

// ➌ نحول ناتج المودل إلى تنبيهات للخريطة
function toAlertItems(row: FeatureRow, out: RecoOut, mmsi?: number) {
  const items: any[] = [];
  const ts = Date.now();
  const add = (id: string, text: string) =>
    items.push({ id: `${id}-${mmsi ?? "na"}-${ts}`, mmsi, lat: row.lat, lon: row.lon, text, ts });

  if (out.bins["lbl_gusts_ge_25kt"])
    add("gust", `Forecast alert — convective gusts possible within 1 hour, peaking near ${Math.max(row.wg_t, row.wg_t1).toFixed(1)} kt.`);

  if (out.bins["lbl_wind_up_12kt_1h"] && (row.ws_t1 - row.ws_t) > 5)
    add("wind", `Forecast alert — wind expected to increase within 1 hour: ${row.ws_t.toFixed(1)}→${row.ws_t1.toFixed(1)} kt (≥12 kt rise likely).`);

  if (out.bins["lbl_temp_drop_3c_1h"])
    add("temp", `Forecast alert — air temperature expected to fall within 1 hour: ${row.temp_t.toFixed(1)}→${row.temp_t1.toFixed(1)} °C (≥3 °C drop).`);

  if (out.bins["lbl_precip_start_1h"])
    add("prec", `Forecast alert — precipitation onset likely within the next hour.`);

  if (out.bins["lbl_recommend_reduce_speed"])
    add("spd", `Advisory — consider reducing speed; current SOG ${row.sog.toFixed(1)} kt with developing weather expected within 1 hour.`);

  return items;
}

// ➍ الدالة الرئيسية: تجلب الطقس + تبني المدخلات + تنادي المودل + ترسل التنبيهات للخريطة
export async function runRecoForVessel(v: AisLite) {
  const wx = await fetchOpenMeteo(v.lat, v.lon);
  if (!wx) return;

  const row = buildRow(v, wx);
  const r = await fetch("/api/reco", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(row),
    cache: "no-store",
  });
  if (!r.ok) return;
  const out = (await r.json()) as RecoOut;

  const items = toAlertItems(row, out, v.mmsi);
  if (items.length) {
    window.dispatchEvent(new CustomEvent("ims:alerts", { detail: items }));
  }
}
