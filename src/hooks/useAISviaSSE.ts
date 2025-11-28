"use client";

import { useEffect, useSyncExternalStore } from "react";

export type AISTarget = {
  mmsi: number;
  lat?: number;
  lon?: number;
  sog?: number;
  cog?: number;
  name?: string;
  last?: number;
  typeCode?: number;
};

type BBox = [number, number, number, number];

type Snapshot = {
  map: Map<string, AISTarget>;
  version: number;
  bboxKey: string | null;
};

const CFG = {
  tickMs: 350,
  staleTtlMs: 15 * 60 * 1000,
  pruneEveryMs: 5 * 1000,
  heartbeatMs: 20 * 1000,
  backoff: { start: 800, max: 30_000, factor: 1.8 },
};

const store = (() => {
  let map = new Map<string, AISTarget>();
  let version = 0;
  let bboxKey: string | null = null;

  let es: EventSource | null = null;

  let tickId: ReturnType<typeof setInterval> | null = null;
  let pruneId: ReturnType<typeof setInterval> | null = null;

  let subs = new Set<() => void>();
  const notify = () => {
    version = (version + 1) & 0xffff;
    subs.forEach((cb) => cb());
  };

  const num = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  let lastPacketTs = 0;
  let backoffMs = CFG.backoff.start;
  let stopping = false;

  const startTicker = () => {
    if (!tickId) tickId = setInterval(notify, CFG.tickMs);
  };
  const stopTicker = () => {
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  };

  const startPruner = () => {
    if (pruneId) return;
    pruneId = setInterval(() => {
      const now = Date.now();
      let removed = 0;
      for (const [id, t] of map) {
        if (t.last && now - t.last > CFG.staleTtlMs) {
          map.delete(id);
          removed++;
        }
      }
      if (removed) notify();
      if (es && now - lastPacketTs > CFG.heartbeatMs) {
        reconnect("heartbeat_timeout");
      }
    }, CFG.pruneEveryMs);
  };
  const stopPruner = () => {
    if (pruneId) {
      clearInterval(pruneId);
      pruneId = null;
    }
  };

  const safeClose = () => {
    try {
      es?.close();
    } catch {}
    es = null;
    stopTicker();
    stopPruner();
  };

  function schedule(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      if (!stopping) fn();
    }, ms);
    return () => clearTimeout(id);
  }

  function reconnect(reason: string) {
    if (!bboxKey) return;
    safeClose();
    const ms = backoffMs;
    backoffMs = Math.min(CFG.backoff.max, Math.ceil(backoffMs * CFG.backoff.factor));
    schedule(() => start(bboxKey!, true), ms);
  }

  function onPacket(line: string) {
    if (!line) return;
    let root: any;
    try {
      root = JSON.parse(line);
    } catch {
      return;
    }

    lastPacketTs = Date.now();
    backoffMs = CFG.backoff.start;

    const msg = root?.Message ?? root;
    const pr =
      msg?.PositionReport ??
      msg?.positionReport ??
      msg?.StandardClassBPositionReport ??
      {};
    const meta = root?.MetaData ?? root?.meta ?? {};

    const rawMmsi =
      meta?.MMSI ??
      meta?.MMSI_String ??
      pr?.UserID ??
      msg?.MMSI ??
      root?.MMSI;
    const mmsiNum = num(rawMmsi);
    if (mmsiNum === undefined) return;

    const id = String(mmsiNum);
    const t = map.get(id) ?? ({ mmsi: mmsiNum } as AISTarget);

    const lat =
      num(pr?.Latitude) ??
      num(meta?.latitude) ??
      num(root?.lat) ??
      num(msg?.Latitude);
    const lon =
      num(pr?.Longitude) ??
      num(meta?.longitude) ??
      num(root?.lon) ??
      num(msg?.Longitude);
    const sog = num(pr?.Sog ?? pr?.sog ?? msg?.Sog ?? root?.sog);
    const cog = num(pr?.Cog ?? pr?.cog ?? msg?.Cog ?? root?.cog);

    if (lat !== undefined) t.lat = lat;
    if (lon !== undefined) t.lon = lon;
    if (sog !== undefined) t.sog = sog;
    if (cog !== undefined) t.cog = cog;

    const name =
      meta?.ShipName ??
      msg?.ReportA?.Name ??
      msg?.ShipName ??
      root?.ShipName ??
      msg?.name ??
      root?.name;
    if (typeof name === "string" && name.trim()) t.name = name.trim();

    const rawType =
      msg?.ShipAndVoyageData?.Type ??
      msg?.ReportA?.Type ??
      msg?.StaticVoyageData?.TypeOfShipAndCargo ??
      msg?.ClassBStatic?.Type ??
      meta?.ShipType ??
      root?.ShipType;
    const typeCode = num(rawType);
    if (typeCode !== undefined) t.typeCode = typeCode;

    if (lat !== undefined || lon !== undefined || name || typeCode !== undefined) {
      t.last = Date.now();
      map.set(id, t);
    }
  }

  function bindVisibility() {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        stopTicker();
      } else {
        startTicker();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    (storeAPI as any)._offVis = () =>
      document.removeEventListener("visibilitychange", onVis);
  }

  const start = (wantedBBoxKey: string, isReconnect = false) => {
    if (stopping) return;
    if (es && bboxKey === wantedBBoxKey) {
      startTicker();
      startPruner();
      return;
    }

    safeClose();
    bboxKey = wantedBBoxKey;

    const params = new URLSearchParams({ bbox: wantedBBoxKey });
    es = new EventSource(`/api/ais/stream?${params.toString()}`);

    lastPacketTs = Date.now();

    const onMessage = (ev: MessageEvent) => onPacket(String(ev.data ?? ""));
    const onAis = (ev: MessageEvent) => onPacket(String(ev.data ?? ""));

    es.onopen = () => {
      startTicker();
      startPruner();
      if (!isReconnect) bindVisibility();
    };
    es.onerror = () => {
      reconnect("onerror");
    };
    es.onmessage = onMessage;
    es.addEventListener("ais", onAis as any);

    const stopHandlers = () => {
      try {
        es?.removeEventListener("ais", onAis as any);
      } catch {}
      (storeAPI as any)._offVis?.();
    };
    (storeAPI as any)._stopHandlers = stopHandlers;
  };

  const subscribe = (cb: () => void) => {
    subs.add(cb);
    return () => subs.delete(cb);
  };

  const getSnapshot = (): Snapshot => ({ map, version, bboxKey });

  const stop = () => {
    stopping = true;
    ((storeAPI as any)._stopHandlers as (() => void) | undefined)?.();
    safeClose();
    stopping = false;
  };

  const storeAPI = { start, stop, subscribe, getSnapshot };
  return storeAPI;
})();

export default function useAISviaSSE(bbox: BBox) {
  const bboxKey = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;

  useEffect(() => {
    store.start(bboxKey);
    return () => {
      store.stop();
    };
  }, [bboxKey]);

  const version = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().version,
    () => store.getSnapshot().version
  );

  return {
    targets: store.getSnapshot().map,
    version,
  };
}
