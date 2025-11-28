import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export type JWTPayload = { uid: string; role: Role };

export function signToken(payload: JWTPayload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(plain: string) {
  const saltRounds = 10;
  return bcrypt.hash(plain, saltRounds);
}

export async function checkPassword(plain: string, hashed: string) {
  return bcrypt.compare(plain, hashed);
}

export async function getCurrentUser() {
  const token = (await cookies()).get("token")?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.uid } });
}