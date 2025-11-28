import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const jar = await cookies();
    const raw =
      jar.get("ims_token")?.value ||
      jar.get("token")?.value ||
      null;

    const payload = raw ? verifyToken(raw) : null;
    if (!payload) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.uid },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    if (!user) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({ user });
  } catch (e) {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
