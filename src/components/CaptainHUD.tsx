"use client";
import Image from "next/image";

type AlertPin = { id: string; x: string; y: string; label: string; level: "HIGH" | "MEDIUM" | "LOW" };
export default function CaptainHUD({
  captainName,
  vesselName,
  weather,
  alerts,
}: {
  captainName: string;
  vesselName: string;
  weather: { text: string; sector: string; time: string; hdg: string };
  alerts: AlertPin[];
}) {
  return (
    <div className="relative z-10 h-screen w-full">
      <header className="mx-4 mt-4">
        <div className="rounded-[24px] bg-[#17243D]/80 backdrop-blur-md border border-white/10 px-5 py-4 max-w-md">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/15" />
            <div>
              <div className="font-medium text-[18px]">Captain: {captainName}</div>
              <div className="text-white/70 text-[13px]">Vessel: {vesselName}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="absolute inset-0">
        {alerts.map((a) => (
          <div key={a.id} className="absolute group" style={{ left: a.x, top: a.y }}>
            <div
              className={[
                "w-3.5 h-3.5 rounded-full ring-4 ring-white/20 shadow-lg",
                a.level === "HIGH" ? "bg-red-400" : a.level === "MEDIUM" ? "bg-amber-300" : "bg-sky-300",
              ].join(" ")}
            />
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity mt-2 whitespace-nowrap
                            rounded-md bg-[#0F1C33]/90 border border-white/10 px-2 py-1 text-[12px]"
            >
              {a.label}
            </div>
          </div>
        ))}
      </div>

      <aside className="absolute right-4 top-28">
        <div className="rounded-xl bg-[#17243D]/80 backdrop-blur-md border border-white/10 px-4 py-3 min-w-[240px]">
          <div className="text-white/85">{weather.text}</div>
          <div className="text-white/70 text-sm">{weather.sector}</div>
          <div className="text-white/70 text-sm">
            {weather.time} | {weather.hdg}
          </div>
        </div>
      </aside>

      <div className="absolute left-1/2 -translate-x-1/2 bottom-28">
        <button
          className="relative h-20 w-20 rounded-full bg-[#1E3358]/70 border border-white/10 backdrop-blur-md
                           before:content-[''] before:absolute before:inset-[-10px] before:rounded-full
                           before:bg-[#1E3358]/30 before:blur-xl hover:scale-105 transition"
        >
          <span className="sr-only">Voice Assistant</span>
          <div className="mx-auto mt-6 h-8 w-8 rounded bg-white/20" />
        </button>
        <div className="text-center text-white/80 text-sm mt-2">Voice Assistant</div>
      </div>

      <nav className="absolute bottom-4 inset-x-4">
        <div
          className="mx-auto max-w-md rounded-[20px] bg-[#17243D]/90 backdrop-blur-md border border-white/10 px-6 py-3
                        flex items-center justify-between"
        >
          <NavItem active label="Home" />
          <NavItem label="Alerts" />
          <NavItem label="Settings" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      className={[
        "flex flex-col items-center gap-1 text-[12px] px-3 py-1 rounded-lg transition",
        active ? "text-white" : "text-white/70 hover:text-white",
      ].join(" ")}
    >
      <div className={"h-5 w-5 rounded " + (active ? "bg-white/30" : "bg-white/15")} />
      {label}
    </button>
  );
}
