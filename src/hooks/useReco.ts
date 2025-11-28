"use client";

import { useEffect, useRef, useState } from "react";

type Reco = {
  vessel?: { mmsi: number; name: string; lat: number; lon: number; sog: number };
  probs: Record<string, number>;
  bins: Record<string, 0|1>;
  text: string;
};

const ZERO = {
  sog:0, ws_t:0, wg_t:0, temp_t:0, prec_t:0,
  ws_t1:0, wg_t1:0, temp_t1:0, prec_t1:0,
  d_ws_1h:0, d_temp_1h:0, hour_of_day:0, weekday:0,
  lat:0, lon:0, dcog:0
};

export default function useReco(pollMs = 8000) {
  const [reco, setReco] = useState<Reco | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    function onCtx(e: any) {
      const now = Date.now();
      if (now - lastRef.current < pollMs) return;
      lastRef.current = now;

      const ctx = e.detail as {
        ts: number;
        center: { lat: number; lon: number } | null;
        weather: { tempC: number; windKts: number; windDeg: number } | null;
        ais: Array<{ mmsi:number; name:string; lat:number; lon:number; sog:number; cog?:number }>;
      };

      const me = typeof localStorage !== "undefined"
        ? JSON.parse(localStorage.getItem("ims:captain:currentVessel") || "null")
        : null;

      let vessel = null as null | { mmsi:number; name:string; lat:number; lon:number; sog:number; cog?:number };
      if (me) vessel = ctx.ais.find(v => v.mmsi === me.mmsi) || null;
      if (!vessel && ctx.center && ctx.ais?.length) {
        const { lat, lon } = ctx.center;
        vessel = ctx.ais.map(v => ({ v, d: Math.hypot(v.lat - lat, v.lon - lon) }))
                        .sort((a,b)=>a.d-b.d)[0]?.v || null;
      }
      if (!vessel) return;

      const f = { ...ZERO };
      f.sog = Number(vessel.sog || 0);
      f.lat = Number(vessel.lat);
      f.lon = Number(vessel.lon);
      f.hour_of_day = new Date(ctx.ts).getUTCHours();
      f.weekday = new Date(ctx.ts).getUTCDay();
      if (ctx.weather) {
        f.ws_t   = ctx.weather.windKts;
        f.wg_t   = Math.max(ctx.weather.windKts*1.2, ctx.weather.windKts);
        f.temp_t = ctx.weather.tempC;
        f.prec_t = 0;
      }

      fetch("/api/reco", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(f) })
        .then(r => r.json())
        .then(data => {
          setReco({
            vessel: { mmsi: vessel!.mmsi, name: vessel!.name, lat: vessel!.lat, lon: vessel!.lon, sog: vessel!.sog },
            probs: data.probs || {},
            bins: data.bins || {},
            text: data.text || ""
          });

          window.dispatchEvent(new CustomEvent("ims:ui", {
            detail: { action:"badge", payload:{ lat: vessel!.lat, lon: vessel!.lon, text: String(data.text||"").replace(/[.،]+$/,"") } }
          }));

          window.dispatchEvent(new CustomEvent("ims:voice:say", { detail:{ text: data.text || "" } }));
        })
        .catch(()=>{});
    }

    window.addEventListener("ims:context", onCtx);
    return () => window.removeEventListener("ims:context", onCtx);
  }, [pollMs]);

  return reco;
}
