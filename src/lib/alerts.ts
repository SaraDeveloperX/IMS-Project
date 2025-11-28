import type { AISTarget } from "@/hooks/useAISviaSSE";

export type Alert = {
  id: string;
  title: string;
  description?: string;
  time: string;
  area?: string;
  source: "AIS" | "Weather";
  severity: "critical" | "warning" | "info";
};

export function makeWeatherAlerts(wx: any): Alert[] {
  if (!wx) return [];
  const alerts: Alert[] = [];
  const now = new Date().toLocaleTimeString();

  if (wx.windKts > 25) {
    alerts.push({
      id: "wx-wind",
      title: "Strong Winds",
      description: `Winds ${wx.windKts.toFixed(1)} kt from ${degToCompass(wx.windDeg)}.`,
      time: now,
      area: wx.location || "Current Area",
      source: "Weather",
      severity: "warning",
    });
  }

  if (wx.visibility && wx.visibility < 2) {
    alerts.push({
      id: "wx-vis",
      title: "Low Visibility",
      description: `Visibility reduced to ${wx.visibility.toFixed(1)} NM.`,
      time: now,
      area: wx.location || "Current Area",
      source: "Weather",
      severity: "warning",
    });
  }

  return alerts;
}

export function makeAISAlerts(targets: Map<string, AISTarget>): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toLocaleTimeString();

  for (const [id, t] of targets) {
    if (!t || !t.sog || !t.cog || !t.lat || !t.lon) continue;

    if (t.sog > 18) {
      alerts.push({
        id: `ais-${id}`,
        title: "High-Speed Vessel",
        description: `${t.name || "Unknown ship"} moving at ${t.sog.toFixed(1)} kt.`,
        time: now,
        source: "AIS",
        severity: "critical",
      });
    }
  }

  return alerts;
}

export function combineAlerts(aisAlerts: Alert[], wxAlerts: Alert[]): Alert[] {
  return [...aisAlerts, ...wxAlerts].sort((a, b) =>
    a.severity === "critical" && b.severity !== "critical" ? -1 : 1
  );
}

function degToCompass(deg: number): string {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}
