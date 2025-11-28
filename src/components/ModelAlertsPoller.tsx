"use client";

import { useEffect, useRef } from "react";

const POLL_MS = 25000;
const FALLBACK = { lat: 21.5, lon: 39.2 };

export default function ModelAlertsPoller(){
  const ref = useRef<number|undefined>(undefined);

  useEffect(()=>{
    const getCenter=()=>{
      try{
        const map:any=(window as any).__MAP_REF__;
        if(map?.getCenter){
          const c=map.getCenter();
          return { lat:Number(c.lat), lon:Number(c.lng) };
        }
      }catch{}
      return FALLBACK;
    };

    const tick = async ()=>{
      const {lat,lon}=getCenter();
      const sog=6;
      try{
        const r=await fetch(`/api/reco?lat=${lat}&lon=${lon}&sog=${sog}`,{cache:"no-store"});
        const j=await r.json();
        const list=Array.isArray(j?.alerts)? j.alerts : [];
        window.dispatchEvent(new CustomEvent("ims:alerts",{ detail:list }));
      }catch{}
    };

    tick();
    ref.current = window.setInterval(tick, POLL_MS);

    return ()=> { if(ref.current) clearInterval(ref.current); };
  },[]);

  return null;
}
