import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

export async function requireRole(role: "CAPTAIN" | "OPERATOR") {
  const token = (await cookies()).get("token")?.value;
  if (!token) return { ok: false as const, reason: "NO_TOKEN" };
  const payload = verifyToken(token);
  if (!payload) return { ok: false as const, reason: "BAD_TOKEN" };
  if (payload.role !== role) return { ok: false as const, reason: "WRONG_ROLE" };
  return { ok: true as const, uid: payload.uid };
}