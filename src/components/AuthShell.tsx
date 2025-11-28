"use client";
import Image from "next/image";

export default function AuthShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-24 w-[900px] h-[900px] rounded-full blur-[120px] opacity-35"
          style={{
            background:
              "radial-gradient(50% 50% at 50% 50%, #27476f 0%, #1C304D 70%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-[360px] mx-auto pt-20 px-4">
        <div className="flex justify-center mb-8 mt-4">
          <Image
            src="/ims-logo.png"
            alt="IMS Logo"
            width={104}
            height={104}
            priority
            className="drop-shadow-[0_0_12px_rgba(255,255,255,0.05)]"
          />
        </div>

        <div className="rounded-2xl px-6 py-6 bg-[#1C304D]/70 border border-white/10 backdrop-blur-xl shadow-lg">
          <h1 className="text-[18px] font-semibold tracking-tight text-[#DCE8F6] text-center mb-4">
            {title}
          </h1>
          {children}
        </div>
      </div>
    </main>
  );
}
