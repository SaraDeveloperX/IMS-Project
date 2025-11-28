export type TapeItem = {
  id: string;
  ts: number;
  type: string;
  title?: string;
  desc?: string;
  mmsiA?: number;
  mmsiB?: number;
  lat?: number;
  lon?: number;
};

const KEY = "ims:alertTape:v1";

function loadAll(): TapeItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as TapeItem[]; } catch { return []; }
}
function saveAll(items: TapeItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
}

export function clearTape() { saveAll([]); }

export function addAlerts(raw: TapeItem[]) {
  const all = loadAll();
  const now = Date.now();
  const recent = all.filter(x => now - x.ts <= 24 * 60 * 60 * 1000);
  const sig = (x: TapeItem) => `${x.type}|${x.mmsiA||""}|${x.mmsiB||""}|${x.lat?.toFixed(3)||""}|${x.lon?.toFixed(3)||""}`;
  const recentMap = new Map(recent.map(r => [sig(r), r.ts]));
  const toAdd: TapeItem[] = [];
  for (const a of raw) {
    const s = sig(a);
    const last = recentMap.get(s) ?? 0;
    if (a.ts - last > 120_000) {
      toAdd.push(a);
      recentMap.set(s, a.ts);
    }
  }
  if (toAdd.length) saveAll([...recent, ...toAdd]);
}

export function getToday(): TapeItem[] {
  const all = loadAll();
  const start = new Date(); start.setHours(0,0,0,0);
  const s = +start;
  return all.filter(x => x.ts >= s);
}
