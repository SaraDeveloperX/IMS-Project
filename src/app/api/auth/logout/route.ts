export async function POST() {
  const headers = new Headers();
  headers.append("Set-Cookie", "token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}