import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { checkPassword, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ error: "Invalid inputs" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return Response.json({ error: "Invalid credentials" }, { status: 401 });

    const ok = await checkPassword(password, user.password);
    if (!ok) return Response.json({ error: "Invalid credentials" }, { status: 401 });

    const token = signToken({ uid: user.id, role: user.role });

    const headers = new Headers();
    const cookie = `ims_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 3600}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`;
    headers.append("Set-Cookie", cookie);

    headers.append("Set-Cookie", cookie.replace("ims_token=", "token="));

    return Response.json({ ok: true, role: user.role }, { status: 200, headers });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
