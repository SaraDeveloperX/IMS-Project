import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, role } = await req.json();

    if (!name || !email || !password || password.length < 6) {
      return Response.json({ error: "Invalid inputs" }, { status: 400 });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return Response.json({ error: "Email already used" }, { status: 409 });

    const hashed = await hashPassword(password);
    const userRole: Role = role === "OPERATOR" ? Role.OPERATOR : Role.CAPTAIN;

    const user = await prisma.user.create({
      data: { name, email, password: hashed, role: userRole },
      select: { id: true, name: true, email: true, role: true },
    });

    const token = signToken({ uid: user.id, role: user.role });

    const headers = new Headers();
    const cookie = `ims_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 3600}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`;
    headers.append("Set-Cookie", cookie);
    headers.append("Set-Cookie", cookie.replace("ims_token=", "token=")); 

    return new Response(JSON.stringify({ ok: true, user }), { status: 201, headers });
  } catch (err) {
    console.error("Signup Error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
