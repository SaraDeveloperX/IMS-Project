export type MyVessel = {
  mmsi: number;
  name?: string;
  lat: number;
  lon: number;
};

const KEY = "ims:myvessel";

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

export function getCurrentVessel(): MyVessel | null {
  try {
    const g = (window as any).__MY_VESSEL;
    if (g && Number.isFinite(g.mmsi) && Number.isFinite(g.lat) && Number.isFinite(g.lon)) return g;

    const fromLS = safeParse<MyVessel>(localStorage.getItem(KEY));
    if (fromLS && Number.isFinite(fromLS.mmsi) && Number.isFinite(fromLS.lat) && Number.isFinite(fromLS.lon)) {
      (window as any).__MY_VESSEL = fromLS; 
      return fromLS;
    }
  } catch {}
  return null;
}

export function setCurrentVessel(v: MyVessel) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    (window as any).__MY_VESSEL = v;
    window.dispatchEvent(new CustomEvent("ims:myvessel", { detail: { ...v } }));
  } catch {}
}

export function clearCurrentVessel() {
  try { localStorage.removeItem(KEY); } catch {}
  try { (window as any).__MY_VESSEL = null; } catch {}
  try { window.dispatchEvent(new CustomEvent("ims:myvessel", { detail: null })); } catch {}
}
