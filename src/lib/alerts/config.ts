export const ALERT_CFG = {
  speedingKts: 18,
  minSpeedKts: undefined,
  closePassNM: 0.5,
  maxTcpaSec: 15 * 60,
  minCpaNM: 0.05,
  severeWindKts: 28,
  windWarnKts: 20,
  gustDeltaWarn: 8,
  wxRingNm: undefined,
  geofence: [] as { name: string; bbox: [number,number,number,number] }[],
  anchorMode: false,
  anchorDriftWarnNm: 0.05,
  anchorDriftDangerNm: 0.15,
  routeTo: undefined as { lat: number; lon: number; xtrackMaxNm?: number } | undefined,
  aisStaleMs: 90_000,
  cooldownMs: 5_000,
} as const;
export type AlertCfg = typeof ALERT_CFG;
