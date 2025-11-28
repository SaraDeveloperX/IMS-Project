import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import bcrypt from "bcrypt";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return Response.json({ error: "Invalid credentials" }, { status: 401 });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return Response.json({ error: "Invalid credentials" }, { status: 401 });

    const token = signToken({ uid: user.id, role: user.role });
    const headers = new Headers();
    headers.append("Set-Cookie",
      `token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7*24*60*60}; ${process.env.NODE_ENV==="production"?"Secure;":""}`);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}