import { getDriveConnectionStatus, type DriveEnvironment } from "../../lib/drive";

type Context = { env: DriveEnvironment; request: Request };

function matchingToken(expected: string, received: string): boolean {
  const length = Math.max(expected.length, received.length);
  let difference = expected.length ^ received.length;
  for (let index = 0; index < length; index += 1) difference |= (expected.charCodeAt(index) || 0) ^ (received.charCodeAt(index) || 0);
  return difference === 0;
}

export async function onRequestGet({ env, request }: Context): Promise<Response> {
  const accessToken = env.DRIVE_STATUS_ACCESS_TOKEN?.trim();
  if (!accessToken) return Response.json({ error: { code: "configuration", message: "The operator status token has not been configured." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const customToken = request.headers.get("X-KPI-Setup-Token")?.trim() || "";
  const authorization = request.headers.get("Authorization")?.trim() || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const suppliedToken = customToken || bearerToken;
  if (!matchingToken(accessToken, suppliedToken)) return Response.json({ error: { code: "unauthorized", message: "An operator access token is required to check Drive configuration." } }, { status: 401, headers: { "Cache-Control": "no-store", "WWW-Authenticate": "KPI-Setup-Token" } });
  const status = await getDriveConnectionStatus(env);
  return Response.json(status, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
