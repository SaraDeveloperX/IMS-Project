"use client";

import { useEffect, useRef, useState } from "react";

type AlertItem = {
  id: string;
  mmsi: number;
  lat?: number;
  lon?: number;
  text: string;
  ts: number;
};

type VesselLite = {
  mmsi: number;
  name?: string;
  sog?: number;
  cog?: number;
  lat?: number;
  lon?: number;
};

export default function OverlayAlerts() {
  const [alert, setAlert] = useState<AlertItem | null>(null);
  const [vessel, setVessel] = useState<VesselLite | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    ensureCss();
    const onAlerts = (e: any) => {
      const list = (e?.detail as AlertItem[]) || [];
      const a = list[0];
      if (!a) return;

      let found: VesselLite | null = null;
      try {
        const snap: any[] = (window as any).__AIS_LAST || [];
        if (Array.isArray(snap) && a.mmsi) {
          const match = snap.find((x) => Number(x.mmsi) === Number(a.mmsi));
          if (match) {
            found = {
              mmsi: match.mmsi,
              name: (match.name || `MMSI ${match.mmsi}`).trim(),
              sog: match.sog,
              cog: match.cog,
              lat: match.lat,
              lon: match.lon,
            };
          }
        }
      } catch {}

      if (!found) {
        found = {
          mmsi: a.mmsi,
          name: `MMSI ${a.mmsi}`,
          lat: a.lat,
          lon: a.lon,
        };
      }

      if (mountedRef.current) {
        setAlert(a);
        setVessel(found);
      }
    };

    window.addEventListener("ims:alerts", onAlerts as any);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("ims:alerts", onAlerts as any);
    };
  }, []);

  function close() {
    setAlert(null);
    setVessel(null);
  }

  function zoomTo() {
    if (!vessel?.lat || !vessel?.lon) return;
    try {
      window.dispatchEvent(
        new CustomEvent("ims:ui", {
          detail: { action: "zoomTo", payload: { lat: vessel.lat, lon: vessel.lon, zoom: 12 } },
        })
      );
    } catch {}
  }

  if (!alert || !vessel) return null;

  const sogTxt = vessel.sog != null ? `${vessel.sog.toFixed(1)} kt` : "—";
  const cogTxt = vessel.cog != null ? `${Math.round(vessel.cog)}°` : "—";
  const latTxt = vessel.lat != null ? vessel.lat.toFixed(4) : "—";
  const lonTxt = vessel.lon != null ? vessel.lon.toFixed(4) : "—";
  const when = new Date(alert.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={headRow}>
          <div style={titleBox}>
            <span style={badge}>Advisory</span>
            <div style={nameLine}>
              <span style={{ fontWeight: 800 }}>{vessel.name}</span>
              <span style={{ opacity: 0.75 }}> • MMSI {vessel.mmsi}</span>
            </div>
          </div>
          <div style={headBtns}>
            <button onClick={zoomTo} style={btnGhost} title="Zoom to vessel">Zoom</button>
            <button onClick={close} style={btnClose} aria-label="Close">×</button>
          </div>
        </div>

        <div style={hr} />

        <div style={grid}>
          <div style={label}>SOG</div><div style={val}>{sogTxt}</div>
          <div style={label}>COG</div><div style={val}>{cogTxt}</div>
          <div style={label}>Pos</div><div style={val}>{latTxt} N, {lonTxt} E</div>
          <div style={label}>Time</div><div style={val}>{when}</div>
        </div>

        <div style={hr} />

        <div style={explainTitle}>Explanation</div>
        <div style={explainText}>{alert.text}</div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 12,
  zIndex: 40,
  pointerEvents: "none",
};

const card: React.CSSProperties = {
  pointerEvents: "auto",
  width: 360,
  maxWidth: "90vw",
  color: "#EAF2FF",
  padding: "14px 16px",
  borderRadius: 16,
  background: "linear-gradient(180deg, rgba(20,35,61,0.55) 0%, rgba(11,18,32,0.55) 100%)",
  border: "1px solid rgba(126,196,255,0.25)",
  boxShadow: "0 12px 34px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(255,255,255,0.06)",
  backdropFilter: "blur(10px)",
  font: '600 12px/1.45 system-ui, -apple-system, "Segoe UI", Roboto',
};

const headRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
const titleBox: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const badge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "4px 8px", borderRadius: 999,
  background: "linear-gradient(180deg, rgba(255,107,107,0.22), rgba(255,120,120,0.16))",
  border: "1px solid rgba(255,130,130,0.55)", fontWeight: 800, fontSize: 11
};
const nameLine: React.CSSProperties = { fontSize: 13, letterSpacing: 0.2 };
const headBtns: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8 };

const btnGhost: React.CSSProperties = {
  cursor: "pointer",
  padding: "6px 10px",
  borderRadius: 10,
  background: "rgba(124,196,255,0.16)",
  border: "1px solid rgba(126,196,255,0.35)",
  color: "#EAF2FF",
  fontWeight: 800,
  fontSize: 12,
};
const btnClose: React.CSSProperties = {
  cursor: "pointer",
  width: 26, height: 26, borderRadius: 8,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(126,196,255,0.35)",
  color: "#EAF2FF",
  fontWeight: 900,
  fontSize: 16,
  lineHeight: "22px",
};

const hr: React.CSSProperties = { height: 1, margin: "8px 0 10px", background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 6, marginBottom: 6 };
const label: React.CSSProperties = { opacity: 0.75 };
const val: React.CSSProperties = { fontWeight: 800 };

const explainTitle: React.CSSProperties = { fontWeight: 900, letterSpacing: 0.3, marginBottom: 6, opacity: 0.92 };
const explainText: React.CSSProperties = { fontWeight: 700, opacity: 0.95 };

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ims-overlayalerts-style")) return;
  const style = document.createElement("style");
  style.id = "ims-overlayalerts-style";
  style.textContent = `
    @media (max-width: 480px) {
      .ims-overlay-card { width: 92vw !important; }
    }
  `;
  document.head.appendChild(style);
}
