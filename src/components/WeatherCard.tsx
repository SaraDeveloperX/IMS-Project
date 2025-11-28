"use client";
import { useEffect, useState } from "react";

type Weather = {
  tempC: number | null;
  windKts: number | null;
  windDeg: number | null;
  wcode: number | null;
};

export default function WeatherCard() {
  const [data, setData] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);

  const lat = 21.5;
  const lon = 39.2;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      const j = await res.json();
      setData(j.current);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="bg-[#14233D]/60 text-white/70 px-4 py-2 rounded-lg text-sm backdrop-blur-md border border-white/10">
      Loading weather…
    </div>
  );

  if (!data) return (
    <div className="bg-[#14233D]/60 text-red-400 px-4 py-2 rounded-lg text-sm backdrop-blur-md border border-white/10">
      Weather data unavailable
    </div>
  );

  return (
    <div className="bg-[#14233D]/60 text-white px-4 py-3 rounded-xl text-sm font-medium backdrop-blur-md border border-white/10 flex flex-col gap-1 min-w-[180px]">
      <div className="text-[13px] text-white/70">🌤 Current Weather</div>
      <div className="text-lg font-semibold text-white">
        {data.tempC?.toFixed(1)}°C
      </div>
      <div className="text-white/80">
        💨 Wind: {data.windKts?.toFixed(1)} kt ({data.windDeg}°)
      </div>
    </div>
  );
}