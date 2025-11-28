import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value || "";
  const { pathname } = req.nextUrl;

  const publicPaths = ["/", "/auth/login", "/auth/signup", "/_next", "/favicon.ico"];
  if (publicPaths.some(p => pathname.startsWith(p))) return NextResponse.next();

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  const payload = verifyToken(token);
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/captain") && payload.role !== "CAPTAIN") {
    const url = req.nextUrl.clone();
    url.pathname = "/operator/dashboard";
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/operator") && payload.role !== "OPERATOR") {
    const url = req.nextUrl.clone();
    url.pathname = "/captain/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
