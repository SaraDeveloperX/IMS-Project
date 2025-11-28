"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  BarElement,
  LineElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import "chartjs-adapter-date-fns";

import useAISviaSSE, { type AISTarget } from "@/hooks/useAISviaSSE";
import { computeAlerts, type AlertItem } from "@/lib/alerts/computeAlerts";

ChartJS.register(
  BarElement,
  LineElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  Tooltip,
  Legend
);

const DEFAULT_BBOX: [number, number, number, number] = [-180, -85, 180, 85];
const SPEED_LIMIT_KTS = 18;

type WeatherLite = {
  tempC: number;
  windKts: number;
  windDeg: number;
  wcode: number;
};

type Tick = AlertItem & { ts: number };

function cardClass(extra?: string) {
  return [
    "rounded-2xl",
    "border",
    "border-white/15",
    "bg-gradient-to-b",
    "from-white/8",
    "to-white/5",
    "shadow-[0_10px_35px_rgba(0,0,0,0.40)]",
    extra || "",
  ].join(" ");
}

function finite(n: any): n is number {
  return Number.isFinite(Number(n));
}

function normalizeTargets(
  targets: Map<string, AISTarget> | Record<string, AISTarget>,
  version: number
): AISTarget[] {
  const list: AISTarget[] =
    targets instanceof Map ? Array.from(targets.values()) : Object.values(targets as any);

  return list.map((t: any) => ({
    ...t,
    sog: finite(t?.sog) ? Number(t.sog) : undefined,
    lat: finite(t?.lat) ? Number(t.lat) : undefined,
    lon: finite(t?.lon) ? Number(t.lon) : undefined,
    name: typeof t?.name === "string" ? t.name.trim() : t?.name,
    last: finite(t?.last) ? Number(t.last) : undefined,
  }));
}

export default function OperatorAnalytics({ className }: { className?: string }) {
  const { targets, version } = useAISviaSSE(DEFAULT_BBOX);

  const [weather, setWeather] = useState<WeatherLite | null>(null);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch(`/api/weather?lat=21.5&lon=39.2`, { cache: "no-store" });
        const j = await r.json();
        if (alive && j?.current) setWeather(j.current);
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const arr = useMemo(() => normalizeTargets(targets as any, version), [targets, version]);

  const fleetCount = useMemo(
    () => arr.filter((t) => finite(t.lat) && finite(t.lon)).length,
    [arr]
  );
  const avgSpeed = useMemo(() => {
    const speeds = arr.map((t) => (finite(t.sog) ? (t.sog as number) : 0)).filter((v) => v > 0);
    if (!speeds.length) return 0;
    return speeds.reduce((s, v) => s + v, 0) / speeds.length;
  }, [arr]);
  const speedingCount = useMemo(
    () => arr.filter((t) => finite(t.sog) && (t.sog as number) > SPEED_LIMIT_KTS).length,
    [arr]
  );

  const ringRef = useRef<Tick[]>([]);
  const [ringVersion, setRingVersion] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      const cfg = {
        speedingKts: SPEED_LIMIT_KTS,
        closePassNM: 0.5,
        minCpaNM: 0.05,
        maxTcpaSec: 15 * 60,
        severeWindKts: 28,
        windWarnKts: 20,
        gustDeltaWarn: 8,
        cooldownMs: 0,
      } as const;

      const alerts = computeAlerts(targets as any, weather ?? undefined, cfg as any);
      const now = Date.now();

      for (const a of alerts) {
        ringRef.current.push({ ...a, ts: a.ts || now });
      }

      ringRef.current = ringRef.current.filter(
        (x) => now - (x.ts || now) <= 60 * 60 * 1000
      );

      setRingVersion((v) => (v + 1) & 0xffff);
    }, 10_000);

    return () => clearInterval(id);
  }, [targets, weather]);

  const alertsLast60 = useMemo(() => ringRef.current.length, [ringVersion]);

  const alertsTimeline = useMemo(() => {
    const now = Date.now();
    const bucketMs = 2 * 60 * 1000;
    const start = now - 60 * 60 * 1000;

    const buckets: { t: number; v: number }[] = [];
    for (let t = start; t <= now; t += bucketMs) buckets.push({ t, v: 0 });

    for (const x of ringRef.current) {
      const ix = Math.min(
        buckets.length - 1,
        Math.max(0, Math.floor(((x.ts || now) - start) / bucketMs))
      );
      buckets[ix].v += 1;
    }
    return buckets;
  }, [ringVersion]);

  const alertsByType = useMemo(() => {
    const base = {
      CLOSE_PASS: 0,
      SPEEDING: 0,
      GEOFENCE: 0,
      WEATHER: 0,
    } as Record<AlertItem["type"], number>;
    for (const a of ringRef.current) {
      base[a.type] = (base[a.type] || 0) + 1;
    }
    return base;
  }, [ringVersion]);

  const speedBands = useMemo(() => {
    const bands = [
      { label: "0–5", min: 0, max: 5, count: 0 },
      { label: "5–10", min: 5, max: 10, count: 0 },
      { label: "10–15", min: 10, max: 15, count: 0 },
      { label: "15–20", min: 15, max: 20, count: 0 },
      { label: "20+", min: 20, max: Infinity, count: 0 },
    ];
    for (const t of arr) {
      const sog = finite(t.sog) ? (t.sog as number) : 0;
      for (const b of bands) {
        if (sog >= b.min && sog < b.max) {
          b.count += 1;
          break;
        }
      }
    }
    return bands;
  }, [arr]);

  const top10 = useMemo(() => {
    return arr
      .filter((t) => finite(t.sog) && finite(t.lat) && finite(t.lon))
      .sort((a, b) => b.sog! - a.sog!)
      .slice(0, 10);
  }, [arr]);

  const alertsLineData = {
    datasets: [
      {
        label: "Alerts / min (2-min buckets)",
        data: alertsTimeline.map((b) => ({ x: b.t, y: b.v / 2 })),
        fill: true,
        tension: 0.32,
        borderWidth: 2,
        pointRadius: 0,
        backgroundColor: "rgba(255,224,140,0.20)",
        borderColor: "rgba(255,224,140,0.95)",
      },
    ],
  };
  const alertsLineOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        type: "time",
        time: { unit: "minute", displayFormats: { minute: "HH:mm" } },
        grid: { color: "rgba(255,255,255,0.06)" },
        ticks: { color: "rgba(255,255,255,0.80)", maxRotation: 0 },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255,255,255,0.06)" },
        ticks: { color: "rgba(255,255,255,0.80)" },
      },
    },
  };

  const speedDistData = {
    labels: speedBands.map((b) => b.label),
    datasets: [
      {
        label: "Vessels",
        data: speedBands.map((b) => b.count),
        borderWidth: 0,
        backgroundColor: "rgba(124,196,255,0.80)",
      },
    ],
  };
  const speedDistOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "rgba(255,255,255,0.85)" },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "rgba(255,255,255,0.85)" },
      },
    },
  };

  const alertsTypeData = {
    labels: ["CPA / Close pass", "Speeding", "Geofence", "Weather"],
    datasets: [
      {
        label: "Alerts (last 60 min)",
        data: [
          alertsByType.CLOSE_PASS,
          alertsByType.SPEEDING,
          alertsByType.GEOFENCE,
          alertsByType.WEATHER,
        ],
        borderWidth: 0,
        backgroundColor: [
          "rgba(255,122,122,0.85)",
          "rgba(255,215,130,0.90)",
          "rgba(140,235,175,0.90)",
          "rgba(150,205,255,0.90)",
        ],
      },
    ],
  };
  const alertsTypeOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "rgba(255,255,255,0.88)" },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "rgba(255,255,255,0.88)" },
      },
    },
  };

  const topLabels = top10.map((t) =>
    t.name && t.name !== `MMSI ${t.mmsi}` ? t.name : `MMSI ${t.mmsi}`
  );
  const topData = {
    labels: topLabels,
    datasets: [
      {
        label: "Speed (kts)",
        data: top10.map((t) => t.sog ?? 0),
        borderWidth: 0,
        backgroundColor: top10.map((t) =>
          (t.sog ?? 0) > SPEED_LIMIT_KTS
            ? "rgba(255,122,122,0.90)"
            : "rgba(124,196,255,0.85)"
        ),
      },
    ],
  };
  const topOpts: any = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "rgba(255,255,255,0.88)" },
      },
      y: {
        grid: { color: "rgba(255,255,255,0.03)" },
        ticks: { color: "rgba(255,255,255,0.92)" },
      },
    },
  };

  return (
    <div className={className}>
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4 mb-5">
        <div className={cardClass("px-4 pt-3 pb-4")}>
          <div className="text-[13px] font-semibold text-white/90 mb-2">
            Live fleet snapshot
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <div className="text-white/60 text-[11px]">Active vessels</div>
              <div className="text-[20px] font-semibold mt-0.5">
                {fleetCount}
              </div>
            </div>
            <div>
              <div className="text-white/60 text-[11px]">Avg speed</div>
              <div className="text-[20px] font-semibold mt-0.5">
                {avgSpeed.toFixed(1)} <span className="text-[11px]">kts</span>
              </div>
            </div>
            <div>
              <div className="text-white/60 text-[11px]">Speeding &gt; {SPEED_LIMIT_KTS} kn</div>
              <div className="text-[20px] font-semibold mt-0.5">
                {speedingCount}
              </div>
            </div>
            <div>
              <div className="text-white/60 text-[11px]">Alerts (last 60 min)</div>
              <div className="text-[20px] font-semibold mt-0.5">
                {alertsLast60}
              </div>
            </div>
          </div>

          {weather && (
            <div className="mt-3 text-[11px] text-white/70">
              Weather anchor · {Math.round(weather.tempC)}°C ·{" "}
              {weather.windKts.toFixed(1)} kts
            </div>
          )}
        </div>

        <div className={cardClass("h-[200px]")}>
          <div className="px-4 pt-3 pb-2 text-[13px] font-semibold text-white/90 flex items-center justify-between">
            <span>Model / rule alerts (last 60 min)</span>
            <span className="text-[11px] text-white/60">2-min buckets</span>
          </div>
          <div className="px-3 pb-3 h-[150px]">
            <Line data={alertsLineData} options={alertsLineOpts} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
        <div className={cardClass("h-[210px]")}>
          <div className="px-4 pt-3 pb-2 text-[13px] font-semibold text-white/90">
            Speed distribution (live)
          </div>
          <div className="px-3 pb-3 h-[160px]">
            <Bar data={speedDistData} options={speedDistOpts} />
          </div>
        </div>

        <div className={cardClass("h-[210px]")}>
          <div className="px-4 pt-3 pb-2 text-[13px] font-semibold text-white/90">
            Alerts by type (last 60 min)
          </div>
          <div className="px-3 pb-3 h-[160px]">
            <Bar data={alertsTypeData} options={alertsTypeOpts} />
          </div>
        </div>
      </div>

      <div className={cardClass("h-[260px]")}>
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-white/90">
            Top-10 fastest vessels (live)
          </div>
          <div className="text-[11px] text-white/60">
            Bars in red are currently above {SPEED_LIMIT_KTS} kn
          </div>
        </div>
        <div className="px-3 pb-3 h-[210px]">
          <Bar data={topData} options={topOpts} />
        </div>
      </div>
    </div>
  );
}
