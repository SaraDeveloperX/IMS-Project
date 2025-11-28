import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat") ?? "21.5");
  const lon = Number(searchParams.get("lon") ?? "39.2");

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code`;
  const r = await fetch(url, { next: { revalidate: 60 } });
  const j = await r.json();

  const windMs = Number(j?.current?.wind_speed_10m ?? 0);
  const current = {
    tempC: Number(j?.current?.temperature_2m ?? 0),
    windKts: windMs * 1.94384,
    windDeg: Number(j?.current?.wind_direction_10m ?? NaN),
    wcode: Number(j?.current?.weather_code ?? 0),
  };


  return Response.json({ current }, { headers: { "Cache-Control": "public, max-age=30" } });
}
