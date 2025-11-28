import { NextRequest } from "next/server";
export const runtime = "nodejs";           
export const dynamic = "force-dynamic";

import { OpenAI } from "openai";
import * as path from "node:path";

const COLLECTION_NAME = process.env.RAG_COLLECTION_NAME || "maritime";
const EMBED_MODEL = process.env.RAG_EMBED_MODEL || "text-embedding-3-small";

let collPromise: Promise<any> | null = null;
async function getCollection() {
  const { default: chromadb } = await import("chromadb");
  const p = process.env.RAG_PERSIST_PATH
    ? path.resolve(process.cwd(), process.env.RAG_PERSIST_PATH)
    : path.resolve(process.cwd(), "rag/chroma_maritime");

  const client = new (chromadb as any).PersistentClient({ path: p });
  return client.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { "hnsw:space": "cosine" },
  });
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function embedQuery(q: string): Promise<number[]> {
  const r = await openai.embeddings.create({ model: EMBED_MODEL, input: q });
  return r.data[0].embedding as unknown as number[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const k = Math.min(Number(searchParams.get("k") || 6), 12);
  if (!q) return Response.json({ chunks: [] });

  const coll = await (collPromise ??= getCollection());
  const qvec = await embedQuery(q);

  const res = await coll.query({
    queryEmbeddings: [qvec],
    nResults: k,
    include: ["documents", "metadatas", "distances"],
  });

  const docs: string[] = res.documents?.[0] || [];
  const metas: any[]   = res.metadatas?.[0] || [];
  const dists: number[] = res.distances?.[0] || [];

  const chunks = docs.map((text, i) => ({
    text: String(text).slice(0, 1800),
    source: metas[i]?.source,
    page: metas[i]?.page,
    domain: metas[i]?.domain,
    distance: typeof dists[i] === "number" ? dists[i] : undefined,
    score: typeof dists[i] === "number" ? +(1 - dists[i]).toFixed(4) : undefined,
  }));

  return Response.json({ chunks }, { headers: { "Cache-Control": "no-store" } });
}
