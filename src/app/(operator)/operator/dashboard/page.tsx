"use client";

import { useEffect, useState } from "react";
import NoSSR from "@/components/NoSSR";
import VoiceAssistant from "@/components/VoiceAssistant";
import RecoBridge from "@/components/RecoBridge";

const MarineMapGL = NoSSR(() => import("@/components/MarineMapGL"));

export default function CaptainDashboard() {
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await r.json();
        const n = data?.user?.name || data?.user?.email?.split("@")[0] || "";
        setName(n);
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <main
      className="min-h-screen text-white relative overflow-hidden"
      style={{
        background:
          "radial-gradient(50% 50% at 50% 50%, #27476F 0%, #1C304D 70%)",
      }}
    >
      <div className="pt-6 px-4 relative z-10">
        <div className="mx-auto max-w-[1200px]">
          <RecoBridge intervalMs={60_000} minGapMs={4_000} />

          <MarineMapGL
            mapHeight="calc(100vh - 150px)"
            radius={20}
            statsPosition="bottom-left"
            showStats
            bottomCenter={<VoiceAssistant />}
          />
        </div>
      </div>
    </main>
  );
}
