"use client";

import { useMemo, useEffect, useState } from "react";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import useAISviaSSE, { type AISTarget } from "@/hooks/useAISviaSSE";

type Props = {
  mapElementId?: string;
  logoPath?: string;
  alertsLast60Min?: number;
};

type PdfData = {
  mapPngBytes?: Uint8Array;
  logoPngBytes?: Uint8Array;
  fleetSize: number;
  speedingCount: number;
  avgKts: number;
  maxKts: number;
  alertsPerHour: number;
};

const SPEED_LIMIT_KTS = 18;

const RISK_THRESHOLDS = {
  HIGH_ALERTS: 20,
  HIGH_SPEEDERS: 10,
};

const THEME = {
  BG: rgb(0.11, 0.2, 0.36),
  PANEL: rgb(0.13, 0.24, 0.41),
  TXT: rgb(0.92, 0.96, 1),
  SUB: rgb(0.76, 0.84, 0.93),
  ACC: rgb(0.31, 0.64, 1),
  WHITE_DIM: rgb(1, 1, 1),
};

const BAR_LENGTH_RATIO = 0.85;

const HEADING_SIZE = 16;
const METRIC_LABEL_SIZE = 12;
const METRIC_VALUE_SIZE = 28;
const GAUGE_LABEL_SIZE = 12;
const GAUGE_VALUE_SIZE = 13;

const METRIC_TOP_OFFSET = 95;
const METRIC_VALUE_DY = 29;
const METRIC_BAR_OFFSET = 50;
const METRIC_BAR_HEIGHT = 10;

const GAUGE_BAR_OFFSET = 26;
const GAUGE_BAR_HEIGHT = 11;

const GAUGE_TOP_OFFSET_1 = 100;
const GAUGE_TOP_OFFSET_2 = 150;

type ModelAlert = {
  ts: number | string;
  type?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
};

function useModelAlertsLast60Min(windowMinutes = 60) {
  const [alerts, setAlerts] = useState<ModelAlert[]>([]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const anyEv = ev as CustomEvent<any>;
      const detail = anyEv.detail;
      const incoming: ModelAlert[] = Array.isArray(detail) ? detail : [detail];
      const now = Date.now();
      const cutoff = now - windowMinutes * 60 * 1000;

      setAlerts((prev) => {
        const merged = [...prev, ...incoming];
        return merged.filter((a) => {
          const rawTs =
            typeof a.ts === "string" ? Date.parse(a.ts) : Number(a.ts);
          if (!Number.isFinite(rawTs)) return false;
          return rawTs >= cutoff;
        });
      });
    };

    window.addEventListener("ims:alerts", handler);
    return () => window.removeEventListener("ims:alerts", handler);
  }, [windowMinutes]);

  return alerts;
}

export default function DailyRiskReportButton({
  mapElementId,
  logoPath = "/ims-logo.png",
  alertsLast60Min,
}: Props) {
  const { targets } = useAISviaSSE([-180, -85, 180, 85]);

  const modelAlerts = useModelAlertsLast60Min(60);
  const modelAlertsCount = modelAlerts.length;

  const metrics = useMemo(() => summarizeTargets(targets), [targets]);

  const onClick = async () => {
    try {
      const mapPng = await readPngFromElement(mapElementId);
      const logoPng = await fetchPngAsUint8(logoPath).catch(() => undefined);

      const pdfBytes = await generatePDF({
        mapPngBytes: mapPng,
        logoPngBytes: logoPng,
        fleetSize: metrics.fleetSize,
        speedingCount: metrics.speedingCount,
        avgKts: metrics.avgKts,
        maxKts: metrics.maxKts,
        alertsPerHour:
          modelAlertsCount > 0
            ? modelAlertsCount
            : safeNumber(alertsLast60Min, 0),
      });

      downloadBlob(
        pdfBytes,
        `daily_risk_${new Date().toISOString().slice(0, 10)}.pdf`,
        "application/pdf"
      );
    } catch (e) {
      console.error(e);
      alert("PDF generation failed");
    }
  };

  return (
    <button
      onClick={onClick}
      className="mt-0.5 rounded-md border border-white/20 bg-white/5 hover:bg-white/10 text-sm text-white px-4 py-1.5 transition-all duration-200"
    >
      Download Today’s Risk Report
    </button>
  );
}

function summarizeTargets(map: Map<string, AISTarget>) {
  let fleetCount = 0;
  let movingCount = 0;
  let speeding = 0;
  let sumSpeed = 0;
  let maxSpeed = 0;

  for (const t of map.values()) {
    if (Number.isFinite(t.lat) && Number.isFinite(t.lon)) {
      fleetCount++;

      const s = Number(t.sog ?? 0);
      if (s > 0) {
        movingCount++;
        sumSpeed += s;
        if (s > maxSpeed) maxSpeed = s;
      }

      if (s > SPEED_LIMIT_KTS) {
        speeding++;
      }
    }
  }

  const avg = movingCount > 0 ? sumSpeed / movingCount : 0;

  return {
    fleetSize: fleetCount,
    speedingCount: speeding,
    avgKts: round1(avg),
    maxKts: round1(maxSpeed),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function safeNumber(n: unknown, def = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : def;
}

async function readPngFromElement(
  elemId?: string
): Promise<Uint8Array | undefined> {
  if (!elemId) return;
  const el = document.getElementById(elemId) as
    | HTMLCanvasElement
    | HTMLImageElement
    | null;
  if (!el) return;

  let dataUrl: string | undefined;
  if ("toDataURL" in (el as any)) {
    dataUrl = (el as HTMLCanvasElement).toDataURL("image/png");
  } else if ("src" in (el as any)) {
    dataUrl = (el as HTMLImageElement).src as string;
  }

  if (!dataUrl?.startsWith("data:image")) return;
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function fetchPngAsUint8(path?: string): Promise<Uint8Array> {
  if (!path) throw new Error("logo path empty");
  const r = await fetch(path);
  const b = await r.arrayBuffer();
  return new Uint8Array(b);
}

function downloadBlob(bytes: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function fitContain(
  src: { w: number; h: number },
  box: { w: number; h: number }
) {
  const r = Math.min(box.w / src.w, box.h / src.h);
  return { w: src.w * r, h: src.h * r };
}

function classifyRiskLevel(p: { alerts: number; speeders: number }) {
  if (p.alerts === 0 && p.speeders === 0) {
    return {
      label: "LOW",
      sentence:
        "Overall short-term risk level is assessed as LOW based on current traffic and model-generated alerts.",
    };
  }

  if (
    p.alerts >= RISK_THRESHOLDS.HIGH_ALERTS ||
    p.speeders >= RISK_THRESHOLDS.HIGH_SPEEDERS
  ) {
    return {
      label: "HIGH",
      sentence:
        "Overall short-term risk level is assessed as HIGH. Concentrated attention is recommended on areas with repeated model alerts and high-speed behaviour.",
    };
  }

  return {
    label: "MODERATE",
    sentence:
      "Overall short-term risk level is assessed as MODERATE with active model alerts that require focused monitoring.",
  };
}

function buildSummary(p: {
  fleet: number;
  speeders: number;
  avg: number;
  max: number;
  alerts: number;
}) {
  const risk = classifyRiskLevel({ alerts: p.alerts, speeders: p.speeders });

  return [
    "This report summarises the current live operational picture for the monitored area, based on AIS data and model-generated alerts.",
    `Active fleet observed: ${p.fleet} vessels, with ${p.speeders} currently above the speed threshold (${SPEED_LIMIT_KTS} kn).`,
    `Average speed across moving vessels: ${p.avg.toFixed(
      1
    )} kn; maximum observed speed: ${p.max.toFixed(1)} kn.`,
    `Model alerts triggered in the last 60 minutes: ${p.alerts}.`,
    risk.sentence,
  ].join(" ");
}

async function generatePDF(d: PdfData) {
  const pdf = await PDFDocument.create();

  const page = pdf.addPage([1754, 1240]);
  const { width: W, height: H } = page.getSize();

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);

  drawRect(page, 0, 0, W, H, THEME.BG);

  const M = 56;
  const G = 22;
  const HEADER_H = 84;

  drawPanel(page, M, H - M - HEADER_H, W - 2 * M, HEADER_H, THEME.PANEL);

  if (d.logoPngBytes) {
    const img = await pdf.embedPng(d.logoPngBytes);
    const s = HEADER_H - 20;
    const LOGO_NUDGE = 6;

    page.drawImage(img, {
      x: W - M - 16 - s,
      y: H - M - HEADER_H + (HEADER_H - s) / 2 + LOGO_NUDGE,
      width: s,
      height: s,
      opacity: 0.95,
    });
  }

  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);
  const timeUtc = now.toISOString().slice(11, 16);

  const textStartX = M + 24;
  drawText(page, "Daily Risk Report", textStartX, H - M - 35, 24, helvB, THEME.TXT);
  drawText(
    page,
    `Date: ${isoDate} — Generated at: ${timeUtc} UTC`,
    textStartX,
    H - M - 65,
    12,
    helv,
    THEME.SUB
  );

  const topY = H - M - HEADER_H - G;
  const bottomY = M;
  const contentH = topY - bottomY;
  const COL_W = (W - 2 * M - G) / 2;

  const R1_H = 300;
  const R2_H = 360;
  const R3_H = contentH - R1_H - R2_H - 2 * G;

  const r1Y = topY - R1_H;

  drawPanel(page, M, r1Y, COL_W, R1_H, THEME.PANEL);
  drawHeading(page, "Executive summary", M + 18, r1Y + R1_H - 30, helvB, THEME.TXT);

  const summary = buildSummary({
    fleet: d.fleetSize,
    speeders: d.speedingCount,
    avg: d.avgKts,
    max: d.maxKts,
    alerts: d.alertsPerHour,
  });

  drawPara({
    page,
    text: summary,
    x: M + 18,
    yTop: r1Y + R1_H - 56,
    maxW: COL_W - 36,
    size: 15,
    leading: 16,
    font: helv,
    color: THEME.TXT,
  });

  drawPanel(page, M + COL_W + G, r1Y, COL_W, R1_H, THEME.PANEL);
  drawHeading(
    page,
    "Fleet & speeding snapshot",
    M + COL_W + G + 18,
    r1Y + R1_H - 30,
    helvB,
    THEME.TXT
  );

  const metricTop = r1Y + R1_H - METRIC_TOP_OFFSET;

  labelMetric({
    page,
    label: "Fleet size (tracked vessels)",
    value: d.fleetSize,
    x: M + COL_W + G + 18,
    y: metricTop,
    font: helv,
    fontB: helvB,
    color: THEME.TXT,
    accent: THEME.ACC,
    barMax: 200,
    barW: (COL_W - 54) / 2,
  });

  labelMetric({
    page,
    label: `Speeding > ${SPEED_LIMIT_KTS} kn`,
    value: d.speedingCount,
    x: M + COL_W + G + 18 + (COL_W - 54) / 2 + 18,
    y: metricTop,
    font: helv,
    fontB: helvB,
    color: THEME.TXT,
    accent: THEME.ACC,
    barMax: 50,
    barW: (COL_W - 54) / 2,
  });

  const r2Y = r1Y - G - R2_H;

  drawPanel(page, M, r2Y, COL_W, R2_H, THEME.PANEL);
  drawHeading(page, "Area snapshot (map view)", M + 18, r2Y + R2_H - 30, helvB, THEME.TXT);

  if (d.mapPngBytes) {
    try {
      const mapImg = await pdf.embedPng(d.mapPngBytes);
      const pad = 18;
      const boxW = COL_W - pad * 2;
      const boxH = R2_H - 64;
      const dims = fitContain(
        { w: (mapImg as any).width, h: (mapImg as any).height },
        { w: boxW, h: boxH }
      );
      const x = M + pad + (boxW - dims.w) / 2;
      const y = r2Y + 18 + (boxH - dims.h) / 2;
      page.drawImage(mapImg, {
        x,
        y,
        width: dims.w,
        height: dims.h,
        opacity: 0.95,
      });
    } catch {
      drawText(
        page,
        "Map image failed to load.",
        M + 18,
        r2Y + 22,
        11,
        helv,
        THEME.SUB
      );
    }
  } else {
    drawText(
      page,
      "No map image captured for this report.",
      M + 18,
      r2Y + 22,
      11,
      helv,
      THEME.SUB
    );
  }

  drawPanel(page, M + COL_W + G, r2Y, COL_W, R2_H, THEME.PANEL);
  drawHeading(page, "Speed profile (kn)", M + COL_W + G + 18, r2Y + R2_H - 30, helvB, THEME.TXT);

  drawGauge({
    page,
    label: "Average speed (moving vessels)",
    val: d.avgKts,
    max: 50,
    x: M + COL_W + G + 18,
    y: r2Y + R2_H - GAUGE_TOP_OFFSET_1,
    w: COL_W - 36,
    font: helv,
    color: THEME.TXT,
    bar: THEME.ACC,
  });

  drawGauge({
    page,
    label: "Maximum observed speed",
    val: d.maxKts,
    max: 50,
    x: M + COL_W + G + 18,
    y: r2Y + R2_H - GAUGE_TOP_OFFSET_2,
    w: COL_W - 36,
    font: helv,
    color: THEME.TXT,
    bar: THEME.ACC,
  });

  const r3Y = r2Y - G - R3_H;

  drawPanel(page, M, r3Y, COL_W, R3_H, THEME.PANEL);
  drawHeading(page, "Risk notes", M + 18, r3Y + R3_H - 30, helvB, THEME.TXT);

  const risk = classifyRiskLevel({
    alerts: d.alertsPerHour,
    speeders: d.speedingCount,
  });

  const baseNote =
    d.fleetSize === 0 && d.alertsPerHour === 0
      ? "No significant risk indicators recorded during this period."
      : "Before handover, review clusters of model alerts and speeding vessels on the operator dashboard, and capture any incident notes below.";

  drawBulletList({
    page,
    items: [`Short-term risk classification: ${risk.label}.`, baseNote],
    x: M + 18,
    yTop: r3Y + R3_H - 58,
    maxW: COL_W - 36,
    size: 12,
    leading: 16,
    font: helv,
    color: THEME.TXT,
  });

  drawPanel(page, M + COL_W + G, r3Y, COL_W, R3_H, THEME.PANEL);
  drawHeading(
    page,
    "Alerts last 60 minutes",
    M + COL_W + G + 18,
    r3Y + R3_H - 30,
    helvB,
    THEME.TXT
  );

  labelMetric({
    page,
    label: "Total model alerts",
    value: d.alertsPerHour,
    x: M + COL_W + G + 18,
    y: r3Y + R3_H - 70,
    font: helv,
    fontB: helvB,
    color: THEME.TXT,
    accent: THEME.ACC,
    barMax: 60,
    barW: COL_W - 36,
  });

  return await pdf.save();
}

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: ReturnType<typeof rgb>
) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawPanel(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: ReturnType<typeof rgb>
) {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color,
    opacity: 0.95,
    borderColor: THEME.WHITE_DIM,
    borderOpacity: 0.08,
    borderWidth: 1,
    cornerRadius: 12,
  });
}

function drawText(
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
) {
  page.drawText(s, { x, y, size, font, color });
}

function drawHeading(
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
) {
  page.drawText(s, { x, y, size: HEADING_SIZE, font, color });
}

function drawPara(opts: {
  page: PDFPage;
  text: string;
  x: number;
  yTop: number;
  maxW: number;
  size: number;
  leading: number;
  font: PDFFont;
  color: ReturnType<typeof rgb>;
}) {
  const { page, text, x, yTop, maxW, size, leading, font, color } = opts;
  const paragraphs = text.split(/\n+/);
  let y = yTop;

  for (const p of paragraphs) {
    const words = p.split(/\s+/);
    let line = "";
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > maxW) {
        page.drawText(line, { x, y, size, font, color });
        y -= leading;
        line = w;
      } else {
        line = t;
      }
    }
    if (line) {
      page.drawText(line, { x, y, size, font, color });
      y -= leading;
    }
    y -= 4;
  }
}

function drawBulletList(opts: {
  page: PDFPage;
  items: string[];
  x: number;
  yTop: number;
  maxW: number;
  size: number;
  leading: number;
  font: PDFFont;
  color: ReturnType<typeof rgb>;
}) {
  const { page, items, x, yTop, maxW, size, leading, font, color } = opts;
  let y = yTop;

  for (const item of items) {
    const bullet = "• ";
    const bulletW = font.widthOfTextAtSize(bullet, size);

    page.drawText(bullet, { x, y, size, font, color });

    const words = item.split(/\s+/);
    let line = "";
    let lineX = x + bulletW;
    const lineMaxW = maxW - bulletW;

    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > lineMaxW) {
        page.drawText(line, { x: lineX, y, size, font, color });
        y -= leading;
        line = w;
        lineX = x + bulletW;
      } else {
        line = t;
      }
    }
    if (line) {
      page.drawText(line, { x: lineX, y, size, font, color });
      y -= leading;
    }
  }
}

function labelMetric(opts: {
  page: PDFPage;
  label: string;
  value: number;
  x: number;
  y: number;
  font: PDFFont;
  fontB: PDFFont;
  color: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  barMax: number;
  barW: number;
}) {
  const { page, label, value, x, y, font, fontB, color, accent, barMax } = opts;
  let { barW } = opts;

  barW = barW * BAR_LENGTH_RATIO;

  page.drawText(label, { x, y, size: METRIC_LABEL_SIZE, font, color });

  page.drawText(value > barMax ? `${barMax}+` : String(value), {
    x,
    y: y - METRIC_VALUE_DY,
    size: METRIC_VALUE_SIZE,
    font: fontB,
    color,
  });

  const baseY = y - METRIC_BAR_OFFSET;
  page.drawRectangle({
    x,
    y: baseY,
    width: barW,
    height: METRIC_BAR_HEIGHT,
    color: THEME.WHITE_DIM,
    opacity: 0.08,
  });

  const pct = Math.max(0, Math.min(1, value / barMax));
  page.drawRectangle({
    x,
    y: baseY,
    width: Math.max(METRIC_BAR_HEIGHT, barW * pct),
    height: METRIC_BAR_HEIGHT,
    color: accent,
    opacity: 0.95,
  });
}

function drawGauge(opts: {
  page: PDFPage;
  label: string;
  val: number;
  max: number;
  x: number;
  y: number;
  w: number;
  font: PDFFont;
  color: ReturnType<typeof rgb>;
  bar: ReturnType<typeof rgb>;
}) {
  const { page, label, val, max, x, y, font, color, bar } = opts;
  let { w } = opts;

  w = w * BAR_LENGTH_RATIO;

  page.drawText(label, { x, y, size: GAUGE_LABEL_SIZE, font, color });

  const baseY = y - GAUGE_BAR_OFFSET;
  const pct = Math.max(0, Math.min(1, val / max));

  page.drawRectangle({
    x,
    y: baseY,
    width: w,
    height: GAUGE_BAR_HEIGHT,
    color: THEME.WHITE_DIM,
    opacity: 0.08,
  });

  page.drawRectangle({
    x,
    y: baseY,
    width: Math.max(GAUGE_BAR_HEIGHT, w * pct),
    height: GAUGE_BAR_HEIGHT,
    color: bar,
    opacity: 0.95,
  });

  page.drawText(`${val.toFixed(1)} kn`, {
    x: x + w + 10,
    y: baseY - 1,
    size: GAUGE_VALUE_SIZE,
    font,
    color,
  });
}
