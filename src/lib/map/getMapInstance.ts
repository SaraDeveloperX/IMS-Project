// src/lib/map/getMapInstance.ts
import type maplibreglNS from "maplibre-gl";

type CtxOpts = {
  alpha?: boolean;
  antialias?: boolean;
  depth?: boolean;
  stencil?: boolean;
  preserveDrawingBuffer?: boolean;
  premultipliedAlpha?: boolean;
  desynchronized?: boolean;
  powerPreference?: "high-performance" | "default" | "low-power";
  failIfMajorPerformanceCaveat?: boolean;
};

declare global {
  interface Window {
    __MAPLIBRE_SINGLETON__?: any;
    __MAPLIBRE_GLNS__?: typeof maplibreglNS;
  }
}

export async function ensureMapLibre(): Promise<typeof maplibreglNS> {
  if (typeof window === "undefined") throw new Error("Client only");
  if (window.__MAPLIBRE_GLNS__) return window.__MAPLIBRE_GLNS__!;
  const gl = (await import("maplibre-gl")).default;
  window.__MAPLIBRE_GLNS__ = gl;
  return gl;
}

export async function getOrCreateMap(
  container: HTMLDivElement,
  opts: {
    style: string;
    center: [number, number];
    zoom: number;
    contextCreationOptions?: CtxOpts;
    antialias?: boolean;
    failIfMajorPerformanceCaveat?: boolean;
  }
) {
  const maplibregl = await ensureMapLibre();

  // أعد استخدام الخريطة لو كانت موجودة (يمنع فتح سياق WebGL جديد)
  if (window.__MAPLIBRE_SINGLETON__) {
    const map = window.__MAPLIBRE_SINGLETON__;
    (map as any)._container = container;
    map.resize();
    return { map, maplibregl };
  }

  const map = new maplibregl.Map({
    container,
    style: opts.style,
    center: opts.center,
    zoom: opts.zoom,
    antialias: opts.antialias ?? false,
    failIfMajorPerformanceCaveat: opts.failIfMajorPerformanceCaveat ?? false,
    contextCreationOptions: {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
      desynchronized: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      ...(opts.contextCreationOptions || {}),
    } as any,
  });

  bindContextLossHandlers(map);

  window.__MAPLIBRE_SINGLETON__ = map;
  return { map, maplibregl };
}

export function bindContextLossHandlers(map: any) {
  const canvas: HTMLCanvasElement | undefined = (map as any).canvas;
  if (!canvas) return;

  const onLost = (e: Event) => {
    e.preventDefault(); // امنع الحظر الافتراضي
    try { (map as any).triggerRepaint?.(); } catch {}
  };
  const onRestored = () => {
    try { (map as any).resize(); (map as any).triggerRepaint?.(); } catch {}
  };

  canvas.addEventListener("webglcontextlost", onLost as any, { passive: false });
  canvas.addEventListener("webglcontextrestored", onRestored as any);
}

export function disposeMapIfProd() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") {
    try { window.__MAPLIBRE_SINGLETON__?.remove?.(); } catch {}
    window.__MAPLIBRE_SINGLETON__ = undefined;
    window.__MAPLIBRE_GLNS__ = undefined;
  }
}
