import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bbox = (searchParams.get("bbox") ?? "-180,-90,180,90")
    .split(",")
    .map((n) => Number(n.trim()));
  const apiKey = process.env.AISSTREAM_API_KEY!;
  if (!apiKey) {
    return new Response("Missing AISSTREAM_API_KEY", { status: 500 });
  }

  let closed = false;
  let ws: WebSocket | null = null;
  let pingTimer: any = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        if (closed) return;
        try { controller.enqueue(new TextEncoder().encode(s)); } catch {}
      };

      ws = new (global as any).WebSocket("wss://stream.aisstream.io/v0/stream");

      ws.addEventListener("open", () => {
        send(`event: hello\n`);
        send(`data: ok\n\n`);

        const msg = {
          Apikey: apiKey,
          BoundingBoxes: [[bbox as any]],
        };
        ws?.send(JSON.stringify(msg));

        pingTimer = setInterval(() => {
          try { ws?.send(JSON.stringify({ ping: Date.now() })); } catch {}
        }, 25000);
      });

      ws.addEventListener("message", async (ev: any) => {
        if (closed) return;

        let text = "";
        if (ev.data instanceof Blob) {
          text = await ev.data.text();
        } else if (typeof ev.data === "string") {
          text = ev.data;
        } else if (ev.data && ev.data.toString) {
          text = ev.data.toString();
        }

        send(`event: ais\n`);
        send(`data: ${text}\n\n`);
      });

      const safeClose = (code?: any, reason?: any) => {
        if (closed) return;
        closed = true;
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        try { ws?.close(); } catch {}
        try {
          send(`event: close\n`);
          send(`data: ${JSON.stringify({ code, reason: String(reason ?? "") })}\n\n`);
        } catch {}
        try { controller.close(); } catch {}
      };

      ws.addEventListener("close", (code: any, reason: any) => safeClose(code, reason));
      ws.addEventListener("error", (err: any) => safeClose("ws_error", err?.message ?? ""));

      req.signal?.addEventListener?.("abort", () => safeClose("aborted", ""));
    },
    cancel() {
      closed = true;
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      try { ws?.close(); } catch {}
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
