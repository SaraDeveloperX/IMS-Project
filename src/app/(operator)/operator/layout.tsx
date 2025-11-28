"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await r.json();
        const n = data?.user?.name ?? data?.user?.email?.split("@")[0] ?? "";
        setName(n);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const NavBtn = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`relative px-4 py-1.5 text-sm font-medium rounded-full transition ${
          active ? "bg-white/20 text-white shadow-md" : "hover:bg-white/10 text-white/85"
        }`}
        prefetch
      >
        {label}
      </Link>
    );
  };

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  return (
    <main
      className="min-h-screen text-white relative overflow-hidden"
      style={{ background: "radial-gradient(50% 50% at 50% 50%, #27476F 0%, #1C304D 70%)" }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-24 w-[900px] h-[900px] rounded-full blur-[120px] opacity-35"
          style={{ background: "radial-gradient(50% 50% at 50% 50%, #27476F 0%, #1C304D 70%)" }}
        />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 bg-[#1C304D]/65 backdrop-blur-md border-b border-white/10 shadow-md">
        <div className="mx-auto max-w-[1360px] px-6 h-18 flex items-center justify-between relative">
          <div className="flex items-center gap-3 ml-8 translate-x-10">
            <img src="/ims-logo.png" alt="IMS" className="h-12 w-auto opacity-95" />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold text-white/90 tracking-tight">Welcome</span>
              <span className="text-[13px] font-medium text-white/70">
                Operator {loading ? "…" : name}
              </span>
            </div>
          </div>

          <div className="absolute left-1/2 transform -translate-x-1/2">
            <nav className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3 py-1.5">
              <NavBtn href="/operator/dashboard" label="Dashboard" />
              <NavBtn href="/operator/analytics" label="Analytics" />
              <button
                onClick={handleLogout}
                className="px-4 py-1.5 text-sm font-medium rounded-full transition
                           bg-[#ff7676]/25 text-[#ffd3d3] hover:bg-[#ff7676]/35 border border-white/10"
                aria-label="Logout"
              >
                Logout
              </button>
            </nav>
          </div>
        </div>
      </header>

      <div className="pt-20 px-4 relative z-10">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </div>
    </main>
  );
}
