"use client";
import { useEffect, useState } from "react";

type Alert = { id: string; title: string; text: string; level: string; createdAt: string };

export default function AlertsPanel() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch("/api/alerts");
        const j = await r.json();
        if (mounted) setAlerts(j.alerts || []);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Active Alerts</h3>
        <span className="text-sm opacity-70">{alerts.length} items</span>
      </div>

      {loading ? (
        <div className="text-sm opacity-70">Loading…</div>
      ) : alerts.length === 0 ? (
        <div className="text-sm opacity-70">No active alerts.</div>
      ) : (
        <ul className="space-y-3">
          {alerts.map(a => (
            <li key={a.id} className="rounded-lg p-3 bg-[#0F1D34]/50 border border-white/10">
              <div className="flex items-center justify-between">
                <div className="font-medium">{a.title}</div>
                <span className={`text-xs px-2 py-0.5 rounded
                  ${a.level === "HIGH" ? "bg-red-500/20 text-red-300" :
                    a.level === "MEDIUM" ? "bg-yellow-500/20 text-yellow-300" :
                    "bg-green-500/20 text-green-300"}`}>
                  {a.level}
                </span>
              </div>
              <div className="text-sm opacity-80">{a.text}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}