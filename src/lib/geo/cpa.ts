export type CPAResult = {
  cpaNm: number;
  tcpaSec: number;
  posA?: { lat: number; lon: number };
  posB?: { lat: number; lon: number };
};

const Rm = 6371000;
const KNOT_TO_MS = 0.514444;
const METER_TO_NM = 1 / 1852;

const toRad = (d: number) => (d * Math.PI) / 180;

export function cpaTcpa(
  A: { lat: number; lon: number; sog?: number; cog?: number },
  B: { lat: number; lon: number; sog?: number; cog?: number },
  clampTcpaSec?: { min?: number; max?: number }
): CPAResult | null {
  if (
    !isFinite(A.lat) || !isFinite(A.lon) ||
    !isFinite(B.lat) || !isFinite(B.lon) ||
    !isFinite(A.sog ?? NaN) || !isFinite(A.cog ?? NaN) ||
    !isFinite(B.sog ?? NaN) || !isFinite(B.cog ?? NaN)
  ) return null;

  const lat0 = toRad((A.lat + B.lat) / 2);
  const cos0 = Math.cos(lat0);

  const Axy = {
    x: toRad(A.lon) * cos0 * Rm,
    y: toRad(A.lat) * Rm,
  };
  const Bxy = {
    x: toRad(B.lon) * cos0 * Rm,
    y: toRad(B.lat) * Rm,
  };

  const vA = (A.sog! * KNOT_TO_MS);
  const vB = (B.sog! * KNOT_TO_MS);
  const thA = toRad(A.cog!);
  const thB = toRad(B.cog!);

  const VA = { x: vA * Math.sin(thA), y: vA * Math.cos(thA) };
  const VB = { x: vB * Math.sin(thB), y: vB * Math.cos(thB) };

  const Rv = { x: Bxy.x - Axy.x, y: Bxy.y - Axy.y };
  const Vrel = { x: VB.x - VA.x, y: VB.y - VA.y };

  const v2 = Vrel.x*Vrel.x + Vrel.y*Vrel.y;
  if (v2 < 1e-6) {
    const dNowNm = Math.hypot(Rv.x, Rv.y) * METER_TO_NM;
    return { cpaNm: dNowNm, tcpaSec: 0 };
  }

  let tcpa = - (Rv.x*Vrel.x + Rv.y*Vrel.y) / v2;

  if (clampTcpaSec?.min != null && tcpa < clampTcpaSec.min) tcpa = clampTcpaSec.min;
  if (clampTcpaSec?.max != null && tcpa > clampTcpaSec.max) tcpa = clampTcpaSec.max;

  const R_cpa = { x: Rv.x + Vrel.x * tcpa, y: Rv.y + Vrel.y * tcpa };
  const cpaMeters = Math.hypot(R_cpa.x, R_cpa.y);
  const cpaNm = cpaMeters * METER_TO_NM;

  const A_at = {
    x: Axy.x + VA.x * tcpa,
    y: Axy.y + VA.y * tcpa,
  };
  const B_at = {
    x: Bxy.x + VB.x * tcpa,
    y: Bxy.y + VB.y * tcpa,
  };
  const posA = {
    lat: (A_at.y / Rm) * (180/Math.PI),
    lon: (A_at.x / (cos0 * Rm)) * (180/Math.PI),
  };
  const posB = {
    lat: (B_at.y / Rm) * (180/Math.PI),
    lon: (B_at.x / (cos0 * Rm)) * (180/Math.PI),
  };

  return { cpaNm, tcpaSec: tcpa, posA, posB };
}
