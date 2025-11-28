"use client";
import { motion, MotionConfig } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const EASE = [0.22, 1, 0.36, 1] as const;
const letters = "INTELLIGENT MARITIME SYSTEM".split("");

export default function Splash() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    router.prefetch("/login");
    const t = setTimeout(() => setLeaving(true), 2600);
    return () => clearTimeout(t);
  }, [router]);

  const container = useMemo(
    () => ({
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: { staggerChildren: 0.028, delayChildren: 0.22 },
      },
    }),
    []
  );

  const charVar = useMemo(
    () => ({
      hidden: { opacity: 0, y: 8 },
      show: {
        opacity: 0.9,
        y: 0,
        transition: { duration: 0.42, ease: EASE },
      },
    }),
    []
  );

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="relative flex min-h-svh items-center justify-center overflow-hidden"
        style={{
          background: `
            radial-gradient(1000px 700px at 50% 60%, rgba(0,0,0,0.35), transparent 60%),
            #1d3455
          `,
          backfaceVisibility: "hidden",
        }}
      >
        <motion.div
          aria-hidden
          className="absolute size-[720px] rounded-full blur-[120px]"
          style={{ background: "rgba(10,20,40,0.55)" }}
          animate={{ scale: [1, 1.035, 1], opacity: [0.22, 0.27, 0.22] }}
          transition={{ duration: 11.5, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0.05 }}
          animate={{ opacity: [0.04, 0.065, 0.04], y: [0, -10, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          style={{
            maskImage:
              "radial-gradient(75% 55% at 50% 50%, black 45%, transparent 95%)",
            background:
              "repeating-linear-gradient(to bottom, rgba(120,170,220,0.09), rgba(120,170,220,0.09) 1px, transparent 1px, transparent 12px)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="relative z-10 flex flex-col items-center gap-5"
          style={{ willChange: "opacity, transform" }}
        >
          <Image
            src="/ims-logo.png"
            alt="IMS"
            width={128}
            height={128}
            priority
            draggable={false}
            className="select-none drop-shadow-[0_0_12px_rgba(86,160,230,0.14)]"
          />

          <div className="relative">
            <span className="reveal-mask pointer-events-none absolute inset-0" aria-hidden />
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="flex select-none items-center justify-center"
              style={{ letterSpacing: "0.26em" }}
            >
              {letters.map((ch, i) =>
                ch === " " ? (
                  <span key={`sp-${i}`} className="w-2 sm:w-3" />
                ) : (
                  <motion.span
                    key={`${ch}-${i}`}
                    variants={charVar}
                    className="text-[11px] sm:text-[12px] md:text-[13px] font-medium text-[rgba(200,230,255,0.86)]"
                  >
                    {ch}
                  </motion.span>
                )
              )}
            </motion.div>

            <motion.div
              initial={{ letterSpacing: "0.26em" }}
              animate={{ letterSpacing: "0.12em" }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.55 }}
              className="sr-only"
            />
          </div>

          <div className="relative mt-2 h-px w-48 overflow-hidden rounded-full bg-white/6">
            <span className="sheen-line absolute inset-0" aria-hidden />
          </div>
        </motion.div>

        {leaving && (
          <motion.div
            className="absolute inset-0"
            style={{ background: "#182c47ff" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            onAnimationComplete={() => router.push("/login")}
          />
        )}
      </main>
    </MotionConfig>
  );
}
