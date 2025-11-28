"use client";

import React, { useEffect, useRef, useState } from "react";
import { getCurrentVessel, setCurrentVessel } from "@/lib/captain/currentVessel";

const MODEL = "gpt-4o-realtime-preview-2024-12-17";

type AIST = {
  id: string;
  mmsi: number;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  name: string;
  last: number;
};

type RiskEvent = {
  id: string;
  type: "environment" | "traffic" | "mixed";
  severity: "low" | "medium" | "high";
  etaMinutes?: number;
  summary: string;
  area?: { lat: number; lon: number; radiusNm?: number };
  targetMmsi?: number;
  confidence?: number;
};

type ContextPacket = {
  ts: number;
  center: { lat: number; lon: number; zoom: number | null } | null;
  weather: ({ at: { lat: number; lon: number } } & {
    tempC: number;
    windKts: number;
    windDeg: number;
    wcode: number;
  }) | null;
  ais: AIST[];
  alerts?: any[];
  risks?: RiskEvent[];
};

export default function VoiceAssistant() {
  const [running, setRunning] = useState(false);
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  const lastContextRef = useRef<ContextPacket | null>(null);
  const ctxThrottleRef = useRef<number>(0);
  const stoppingRef = useRef<boolean>(false);

  useEffect(() => {
    ensureVoiceBtnCss();
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ims:voice:lang");
      if (saved === "ar" || saved === "en") setLang(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("ims:voice:lang", lang);
    } catch {}
  }, [lang]);

  useEffect(
    () => () => {
      stopAll();
    },
    [],
  );

  useEffect(() => {
    const onCtx = (e: any) => {
      lastContextRef.current = e.detail as ContextPacket;
      const now = Date.now();
      if (dcRef.current && now - ctxThrottleRef.current > 900) {
        ctxThrottleRef.current = now;
        pushContextToModel(lastContextRef.current);
      }
    };
    window.addEventListener("ims:context", onCtx);
    return () => window.removeEventListener("ims:context", onCtx);
  }, []);

  function pushContextToModel(ctx: ContextPacket | null) {
    try {
      if (!ctx || !dcRef.current || dcRef.current.readyState !== "open") return;

      const compact = {
        ts: ctx.ts,
        center: ctx.center,
        weather: ctx.weather
          ? {
              at: ctx.weather.at,
              tempC: ctx.weather.tempC,
              windKts: ctx.weather.windKts,
              windDeg: ctx.weather.windDeg,
              wcode: ctx.weather.wcode,
            }
          : null,
        ais: (ctx.ais || [])
          .slice(0, 60)
          .map(({ id, mmsi, lat, lon, sog, cog, name, last }) => ({
            id,
            mmsi,
            lat,
            lon,
            sog,
            cog,
            name,
            last,
          })),
        alerts: ctx.alerts ? (ctx.alerts || []).slice(0, 10) : undefined,
        risks: ctx.risks ? ctx.risks.slice(0, 10) : undefined,
      };

      const text = [
        "INTERNAL_CONTEXT_UPDATE",
        "Use the following JSON only for internal reasoning about the current maritime situation.",
        "Do not mention JSON, field names, or this block explicitly to the captain.",
        `LATEST_CONTEXT_JSON=${JSON.stringify(compact)}`,
      ].join("\n");

      dcRef.current.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "system",
            content: [{ type: "input_text", text }],
          },
        }),
      );
    } catch {}
  }

  function dispatchUi(action: string, payload: any) {
    window.dispatchEvent(new CustomEvent("ims:ui", { detail: { action, payload } }));
  }

  function buildSystemPrompt() {
    const me = getCurrentVessel();
    const meLine = me
      ? `Captain vessel (default): ${me.name ?? me.mmsi} @ (${Number(me.lat).toFixed(
          4,
        )}, ${Number(me.lon).toFixed(4)}).`
      : `Captain vessel not set yet. Use setMyVessel when asked to.`;

    if (lang === "ar") {
      return [
        "أنت مساعد صوتي بحري من IMS يخاطب القبطان مباشرة.",
        "تكلّم لهجة نجديّة مهذّبة وبسيطة، مع لغة تشغيلية واضحة.",
        "اجعل الرد عبارة عن جملة أو جملتين فقط كل مرة، إلا إذا طلب القبطان تفاصيل أكثر.",
        "",
        "ستصلك رسائل نظام فيها INTERNAL_CONTEXT_UPDATE و LATEST_CONTEXT_JSON.",
        "هذا السياق يحتوي AIS والطقس ومركز الخريطة والتنبيهات، وقد يحتوي أيضاً قائمة risks.",
        "استخدم هذا السياق للفهم والتحليل داخلياً فقط.",
        "ممنوع تماماً أن تذكر كلمة JSON أو LATEST_CONTEXT_JSON أو أسماء الحقول أو البُنى الداخلية للقبطان.",
        "",
        "قائمة risks (إن وُجدت) هي ملخّص للمخاطر القصيرة المدى الناتجة عن دمج بيانات AIS والطقس ونموذج التنبؤ.",
        "اعتبر هذه القائمة هي المصدر الأساسي لشرح المخاطر القصيرة المدى للقبطان.",
        "لأي رد يتعلق بالمخاطر:",
        "- ابدأ بوصف بسيط للحالة (مثلاً: رياح جانبية قوية متوقعة قدّام المسار خلال حوالي 20–30 دقيقة).",
        "- ثم فسّر لماذا هذه الحالة تعتبر مخاطرة تشغيلية (مثلاً: قد تزيد انحراف السفينة عن المسار أو تصعّب المناورة أو تزيد احتمال قرب المرور من سفن أخرى).",
        "- ثم قدّم توصية عملية واحدة واضحة كحد أقصى (مثل: تخفيف السرعة قليلاً، الانتباه لقطاع معيّن، أو التفكير بتعديل بسيط في المسار).",
        "إذا لم توجد مخاطر مهمّة في السياق، طمئن القبطان بجملة قصيرة بأن الوضع مستقر نسبياً ولا توجد مؤشرات خطر قريب.",
        "لا تذكر كلمة risks ولا أسماء حقولها، بل استخدم لغة بحرية تشغيلية طبيعية فقط.",
        "",
        "أسئلة القواعد/الإجراءات (مثل COLREGs و VTS و GMDSS وغيرها) لا تعتمد على السياق الحي فقط، بل تحتاج مراجع.",
        "في هذه الحالة، لا تجب مباشرة.",
        "بدلاً من ذلك، أرسل أولاً الكائن التالي عبر قناة البيانات:",
        '{"rag_query":"<سؤال واضح عن القاعدة أو الإجراء باللغة العربية>"}',
        "بعد ذلك، ستأتيك RAG_RESULT_JSON في رسالة نظام أخرى.",
        "استخدم RAG_RESULT_JSON داخلياً فقط لاستنتاج الجواب.",
        "لا تذكر كلمة RAG أو JSON أو أسماء الحقول.",
        "قدّم للقبطان جواباً مختصراً جداً مع إشارة للمرجع بصيغة بشرية، مثل: (حسب COLREGs القاعدة 15).",
        "",
        "للأسئلة المتعلقة بالموقف الحي (أقرب سفينة، اتجاه الرياح، حالة البحر، المرور القريب، المخاطر القصيرة المدى) اعتمد على ما يأتي في LATEST_CONTEXT_JSON.",
        "ركّز على ما يهم القبطان عملياً: قرب السفن، التغيّر القادم في الرياح أو الحالة البحرية، والمخاطر خلال 30–120 دقيقة.",
        "",
        "للتحكم بالخريطة والواجهة، لا تتحدث عن الأوامر نفسها، بل أرسل كائناً واحداً على شكل JSON نصّي عبر قناة البيانات:",
        '{"ui":{"action":"zoomTo|ping|drawWeatherCircle|setMyVessel","payload":{...}}}',
        "مثال: إذا طلب القبطان التركيز على سفينة معيّنة أو رسم دائرة طقس حول موقعه، استخدم action و payload المناسبين دون شرح الصيغة له في الصوت.",
        "عند تعيين سفينة القبطان بالاسم: طابق الاسم جزئياً من قائمة AIS مع مراعاة أقرب تطابق منطقي.",
        "عند تعيينها بالـ MMSI يجب أن يكون التطابق كاملاً.",
        "",
        "تجنّب تكرار نفس المعلومات في كل مرة إذا لم تتغيّر الظروف كثيراً.",
        "إذا كان القبطان يسأل سؤالاً عاماً (مثل: كيف الوضع قدامي؟) فاختصر على المنطقة القريبة من مسار سفينته.",
        "إذا كان القبطان يسأل عن الزمن (خلال كم دقيقة تتغير الحالة؟) فاعتمد على أفق قصير المدى (30–120 دقيقة) إذا توفّر في السياق.",
        "",
        meLine,
      ].join("\n");
    } else {
      return [
        "You are the IMS Marine Voice Assistant speaking directly to the captain.",
        "Use concise, polite operational English. Answer in 1–2 short sentences by default, unless the captain explicitly asks for more detail.",
        "",
        "You will receive system messages containing INTERNAL_CONTEXT_UPDATE and LATEST_CONTEXT_JSON.",
        "This JSON may include AIS, map center, weather, alerts, and a `risks` list.",
        "Use this context only for internal reasoning about the current situation.",
        "You must NOT mention JSON, LATEST_CONTEXT_JSON, RAG_RESULT_JSON, or any field names or internal structures to the captain.",
        "",
        "If a `risks` list is present, it summarizes short-term risks produced by fused AIS, weather, and prediction models.",
        "Treat this list as your primary source when explaining short-term environmental or traffic risks to the captain.",
        "For any risk-related response:",
        "- First, briefly describe the situation in plain language (e.g., strong cross-winds expected ahead within 20–30 minutes on the current track).",
        "- Then explain why this is operationally risky (e.g., it can affect maneuverability or track-keeping, or increase close-quarters situations).",
        "- Finally, give exactly one clear, actionable recommendation (e.g., slightly reduce speed, monitor a specific bearing, or consider a small course adjustment).",
        "If there are no meaningful risks in the context, briefly reassure the captain that conditions are relatively stable and no immediate hazards are indicated.",
        "Do NOT mention the word `risks` or any JSON field names; speak only in natural operational language.",
        "",
        "For questions about rules and procedures (COLREGs, VTS, GMDSS, etc.), do not rely only on live context.",
        "In these cases, do not answer directly.",
        "First, emit a JSON object on the data channel:",
        '{"rag_query":"<clear English question about the rule or procedure>"}',
        "Then you will receive RAG_RESULT_JSON as another system message.",
        "Use RAG_RESULT_JSON only as an internal reference to infer the answer.",
        "Do not mention RAG, JSON, or internal fields to the captain.",
        "Provide a short, clear answer with a human-readable citation, e.g., “According to COLREGs Rule 15…”.",
        "",
        "For live situational questions (nearest vessel, wind, traffic, short-term environmental risk), rely on LATEST_CONTEXT_JSON.",
        "Focus on what matters for the next 30–120 minutes along or near the captain's route: nearby vessels, changes in wind/sea, and risk regions.",
        "",
        "For map and UI control, do not explain the JSON to the captain.",
        "Instead, send exactly one JSON object on the data channel:",
        '{"ui":{"action":"zoomTo|ping|drawWeatherCircle|setMyVessel","payload":{...}}}',
        "When setting the captain's vessel by name, you may use partial string matching against AIS names.",
        "When setting it by MMSI, require exact numerical match.",
        "",
        "Avoid repeating the same information if conditions have not meaningfully changed.",
        "If the captain asks a broad question (e.g., “How does it look ahead?”), focus on the area directly ahead of the vessel's track.",
        "If the captain asks about timing (e.g., “When will it get worse?”), emphasize short-term horizons (30–120 minutes) when supported by context.",
        "",
        meLine,
      ].join("\n");
    }
  }

  async function start() {
    if (pcRef.current || dcRef.current || running) {
      stopAll();
    }

    setError(null);
    try {
      const r = await fetch("/api/realtime/session", { method: "POST" });
      const session = await r.json();
      const ephemeralKey = session?.client_secret?.value as string;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "failed" || s === "disconnected" || s === "closed") {
          stopAll();
        }
      };

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        if (!dc || dc.readyState !== "open") return;
        dc.send(
          JSON.stringify({
            type: "session.update",
            instructions: buildSystemPrompt(),
          }),
        );
        pushContextToModel(lastContextRef.current);
        dc.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions:
                lang === "ar"
                  ? "يا هلا كابتن — أنا مساعدك البحري الذكي من نظام IMS، جاهز للملاحة والطقس والتنبيهات. وش نبدأ؟"
                  : "Hello Captain — IMS marine assistant ready for navigation, weather and advisories. How can I assist?",
            },
          }),
        );
      };

      dc.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data);

          if (typeof msg?.rag_query === "string" && msg.rag_query.trim()) {
            const rr = await fetch(
              `/api/rag/query?q=${encodeURIComponent(msg.rag_query)}&k=6`,
              { cache: "no-store" },
            );
            const data = await rr.json();

            if (dcRef.current?.readyState === "open") {
              const text = [
                "INTERNAL_RAG_UPDATE",
                "Use the following chunks only as internal references to answer the captain's question about rules/procedures.",
                "Do not mention RAG, JSON, or field names. Answer succinctly and cite the source in a human-readable way (e.g., COLREGs Rule 15).",
                `RAG_RESULT_JSON=${JSON.stringify(data.chunks)}`,
              ].join("\n");

              dcRef.current.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "system",
                    content: [{ type: "input_text", text }],
                  },
                }),
              );
              dcRef.current.send(
                JSON.stringify({ type: "response.create", response: {} }),
              );
            }
            return;
          }

          if (msg?.ui && msg.ui.action) {
            const { action, payload } = msg.ui;
            if (action === "setMyVessel" && payload?.mmsi) {
              const mmsi = Number(payload.mmsi);
              const ais = lastContextRef.current?.ais || [];
              const found = ais.find((x) => x.mmsi === mmsi);
              if (found) {
                setCurrentVessel({
                  mmsi: found.mmsi,
                  name: (found.name || `MMSI ${found.mmsi}`).trim(),
                  lat: found.lat,
                  lon: found.lon,
                });
                dispatchUi("zoomTo", {
                  lat: found.lat,
                  lon: found.lon,
                  zoom: 12,
                });
              }
              return;
            }
            dispatchUi(action, payload || {});
            return;
          }
        } catch {}
      };

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
      mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));

      pc.ontrack = (e) => {
        const [remote] = e.streams;
        if (!remoteAudioRef.current) {
          const audio = new Audio();
          audio.autoplay = true;
          audio.playsInline = true;
          remoteAudioRef.current = audio;
        }
        remoteAudioRef.current.srcObject = remote;
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp",
            "OpenAI-Beta": "realtime=v1",
          },
          body: offer.sdp,
        },
      );
      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setRunning(true);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Voice session failed");
      stopAll();
    }
  }

  function stopAll() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      try {
        if (dcRef.current && dcRef.current.readyState !== "closed") {
          dcRef.current.close();
        }
      } catch {}
      dcRef.current = null;

      try {
        pcRef.current?.getSenders().forEach((s) => {
          try {
            s.track?.stop();
          } catch {}
        });
        pcRef.current?.getReceivers().forEach((r) => {
          try {
            r.track?.stop();
          } catch {}
        });
        pcRef.current?.getTransceivers().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      } catch {}

      try {
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      micStreamRef.current = null;

      try {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.pause();
          // @ts-ignore
          remoteAudioRef.current.srcObject = null;
        }
      } catch {}

      try {
        if (pcRef.current && pcRef.current.connectionState !== "closed") {
          pcRef.current.close();
        }
      } catch {}
      pcRef.current = null;
    } finally {
      setRunning(false);
      stoppingRef.current = false;
    }
  }

  function toggleLang() {
    const newLang = lang === "ar" ? "en" : "ar";
    setLang(newLang);
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(
        JSON.stringify({
          type: "session.update",
          instructions: buildSystemPrompt(),
        }),
      );
      dcRef.current.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions:
              newLang === "ar"
                ? "تم تحويل اللغة إلى العربية"
                : "Language switched to English",
          },
        }),
      );
    }
  }

  return (
    <div
      style={{ pointerEvents: "auto" }}
      className="flex flex-col items-center gap-3"
    >
      <button
        onClick={running ? stopAll : start}
        aria-label={running ? "إيقاف المساعد الصوتي" : "تشغيل المساعد الصوتي"}
        title={running ? "إيقاف المساعد الصوتي" : "تشغيل المساعد الصوتي"}
        className={[
          "relative flex items-center justify-center w-[72px] h-[72px] rounded-full transition-all duration-500",
          "shadow-lg border",
          running
            ? "bg-[#0B3D91] border-[#1C5FD2] text-white scale-[1.06]"
            : "bg-[linear-gradient(180deg,rgba(126,196,255,0.28),rgba(78,164,255,0.22))] border-[rgba(126,196,255,0.45)] text-white backdrop-blur-md animate-ims-breath",
        ].join(" ")}
      >
        {!running && (
          <span className="pointer-events-none absolute w-[110%] h-[110%] rounded-full bg-[#4EA4FF]/25 blur-[16px]" />
        )}

        {running ? (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z"
              fill="currentColor"
            />
            <path
              d="M5 11a1 1 0 1 0-2 0 9 9 0 0 0 8 8v2h2v-2a9 9 0 0 0 8-8 1 1 0 1 0-2 0 7 7 0 1 1-14 0Z"
              fill="currentColor"
              opacity=".9"
            />
          </svg>
        )}

        {running && (
          <>
            <span className="absolute inset-0 rounded-full border-2 border-[#1C5FD2]/70 animate-ims-ping-slow" />
            <span className="absolute inset-0 rounded-full border border-[#4EA4FF]/50 animate-ims-ping-slower" />
          </>
        )}

        <span className="pointer-events-none absolute -top-[2px] left-1/2 -translate-x-1/2 w-[82%] h-[36%] rounded-[999px] bg-white/18 blur-[8px] opacity-70" />
      </button>

      {running && (
        <button
          onClick={toggleLang}
          className="text-xs px-3 py-1 rounded-full bg-[#0B3D91]/30 border border-[#4EA4FF]/35 text-white/90"
          title="بدّل لغة الرد"
        >
          {lang === "ar" ? "AR" : "EN"}
        </button>
      )}

      {error && (
        <div className="text-xs text-red-300 bg-red-900/30 border border-red-500/40 px-2 py-1 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}

function ensureVoiceBtnCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ims-voicebtn-style")) return;
  const style = document.createElement("style");
  style.id = "ims-voicebtn-style";
  style.textContent = `
    @keyframes ims-breath {
      0% { transform: scale(1); box-shadow: 0 10px 30px rgba(0,0,0,.35); }
      50% { transform: scale(1.015); box-shadow: 0 14px 34px rgba(0,0,0,.38); }
      100% { transform: scale(1); box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    }
    @keyframes ims-ping-slow {
      0% { transform: scale(1); opacity: .65; }
      70%{ transform: scale(1.18); opacity: 0; }
      100%{ transform: scale(1.18); opacity: 0; }
    }
    @keyframes ims-ping-slower {
      0% { transform: scale(1); opacity: .45; }
      80%{ transform: scale(1.28); opacity: 0; }
      100%{ transform: scale(1.28); opacity: 0; }
    }
    .animate-ims-breath { animation: ims-breath 3.8s ease-in-out infinite; }
    .animate-ims-ping-slow { animation: ims-ping-slow 1.8s ease-out infinite; }
    .animate-ims-ping-slower { animation: ims-ping-slower 2.6s ease-out infinite; }
  `;
  document.head.appendChild(style);
}
