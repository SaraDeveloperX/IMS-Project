import type { NextRequest } from "next/server";
export const runtime = "edge";

function buildInitialInstructions() {
  return [
    "تحدث باللغة السعوديه المهذبة والمختصرة (من جملة إلى جملتين فقط).",
    "ستتلقى رسائل نظامية باسم LATEST_CONTEXT_JSON تحتوي على بيانات AIS، ومركز الخريطة، وحالة الطقس — تأكد من مراجعتها قبل الرد.",
    "للتحكم في الخريطة، أرسل كائن JSON واحد فقط بالشكل التالي: {\"ui\":{\"action\":\"<zoomTo|ping|drawWeatherCircle|setMyVessel>\",\"payload\":{...}}}.",
  ].join("\n");
}


async function createSessionJSON() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });

  const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "verse",
      modalities: ["audio", "text"],
      instructions: buildInitialInstructions(),
    }),
  });

  const session = await r.json();
  return new Response(JSON.stringify(session), { status: 200, headers: { "Content-Type": "application/json" } });
}

export async function GET(_req: NextRequest) { return createSessionJSON(); }
export async function POST(_req: NextRequest) { return createSessionJSON(); }
