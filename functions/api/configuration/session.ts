import type { DriveEnvironment } from "../../lib/drive";

type Context = { env: DriveEnvironment; request: Request };

function matchingToken(expected: string, received: string): boolean {
  const length = Math.max(expected.length, received.length);
  let difference = expected.length ^ received.length;
  for (let index = 0; index < length; index += 1) difference |= (expected.charCodeAt(index) || 0) ^ (received.charCodeAt(index) || 0);
  return difference === 0;
}

export async function onRequestPost({ env, request }: Context): Promise<Response> {
  const expectedToken = env.DRIVE_STATUS_ACCESS_TOKEN?.trim();
  if (!expectedToken) return Response.json({ error: { code: "configuration", message: "The operator status token has not been configured." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const suppliedToken = typeof body?.token === "string" ? body.token.trim() : "";
  if (!suppliedToken || !matchingToken(expectedToken, suppliedToken)) return Response.json({ error: { code: "unauthorized", message: "The operator access token is invalid." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const secure = new URL(request.url).protocol === "https:";
  const cookie = `kpi_setup_session=${encodeURIComponent(expectedToken)}; Max-Age=1800; Path=/api/configuration; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
  return Response.json({ authenticated: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": cookie } });
}
