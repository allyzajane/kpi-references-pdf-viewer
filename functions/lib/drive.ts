import { importPKCS8, SignJWT } from "jose";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PDF_MIME_TYPE = "application/pdf";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

type DriveAccessMode = "private" | "public";
type ServiceAccountCredentials = { client_email?: string; private_key?: string; token_uri?: string };
type DriveFile = { id: string; name: string; mimeType: string; resourceKey?: string; modifiedTime?: string; size?: string; description?: string | null; webViewLink?: string; capabilities?: { canDownload?: boolean } };
type DriveListResponse = { files?: DriveFile[]; nextPageToken?: string };

export type DriveEnvironment = {
  DRIVE_PORTAL_ACCESS_MODE?: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
  GOOGLE_DRIVE_API_KEY?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  DRIVE_STATUS_ACCESS_TOKEN?: string;
};

export type PortalDocument = { id: string; name: string; mimeType: typeof PDF_MIME_TYPE; modifiedTime: string | null; size: number | null; description: string | null; category: string; canDownload: boolean; driveUrl: string | null };

export type DriveConnectionStatus = {
  status: "connected" | "needs-configuration" | "unavailable";
  accessMode: DriveAccessMode | null;
  folderConfigured: boolean;
  credentialConfigured: boolean;
  documentCount: number | null;
  message: string;
  checkedAt: string;
};

export class DrivePortalError extends Error {
  constructor(message: string, public readonly status = 500, public readonly kind: "configuration" | "unauthorized" | "unavailable" | "invalid" | "upstream" = "upstream") {
    super(message);
    this.name = "DrivePortalError";
  }
}

let accessTokenCache: { token: string; expiresAt: number } | null = null;

function settings(env: DriveEnvironment): { mode: DriveAccessMode; folderId: string; apiKey?: string; credentials?: ServiceAccountCredentials } {
  const folderId = env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const mode = env.DRIVE_PORTAL_ACCESS_MODE?.trim().toLowerCase();
  if (!folderId) throw new DrivePortalError("The Google Drive folder has not been configured.", 503, "configuration");
  if (mode === "public") {
    const apiKey = env.GOOGLE_DRIVE_API_KEY?.trim();
    if (!apiKey) throw new DrivePortalError("Public Drive access requires a server-side Google Drive API key.", 503, "configuration");
    return { mode, folderId, apiKey };
  }
  if (mode === "private") {
    try {
      const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON || "") as ServiceAccountCredentials;
      if (!credentials.client_email || !credentials.private_key) throw new Error("Incomplete credentials");
      return { mode, folderId, credentials };
    } catch {
      throw new DrivePortalError("Private Drive access requires a valid server-side service account key.", 503, "configuration");
    }
  }
  throw new DrivePortalError("Set DRIVE_PORTAL_ACCESS_MODE to either private or public.", 503, "configuration");
}

async function serviceAccountToken(credentials: ServiceAccountCredentials): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.token;
  const privateKey = credentials.private_key?.replace(/\\n/g, "\n");
  const clientEmail = credentials.client_email;
  if (!privateKey || !clientEmail) throw new DrivePortalError("The service account key is incomplete.", 503, "configuration");
  try {
    const assertion = await new SignJWT({ scope: DRIVE_SCOPE })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(clientEmail).setSubject(clientEmail)
      .setAudience(credentials.token_uri || GOOGLE_TOKEN_URL).setIssuedAt().setExpirationTime("1h")
      .sign(await importPKCS8(privateKey, "RS256"));
    const response = await fetch(credentials.token_uri || GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
    const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !payload.access_token) throw new DrivePortalError(payload.error_description || "Google rejected the service-account credentials.", response.status || 401, "unauthorized");
    accessTokenCache = { token: payload.access_token, expiresAt: Date.now() + Math.max((payload.expires_in ?? 3600) - 60, 60) * 1000 };
    return accessTokenCache.token;
  } catch (error) {
    if (error instanceof DrivePortalError) throw error;
    throw new DrivePortalError("The portal could not authenticate with Google Drive.", 401, "unauthorized");
  }
}

async function driveFetch(env: DriveEnvironment, path: string, query: Record<string, string> = {}, init?: RequestInit): Promise<Response> {
  const config = settings(env);
  const url = new URL(`${DRIVE_API_BASE}${path}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const headers = new Headers(init?.headers);
  if (config.mode === "private") headers.set("Authorization", `Bearer ${await serviceAccountToken(config.credentials!)}`);
  else url.searchParams.set("key", config.apiKey!);
  return fetch(url, { ...init, headers });
}

function categoryFromDescription(description?: string | null): string {
  return description?.match(/(?:^|[\n;])\s*category\s*:\s*([^\n;]+)/i)?.[1]?.trim() || "Documents";
}

function mapFile(file: DriveFile): PortalDocument {
  return { id: file.id, name: file.name, mimeType: PDF_MIME_TYPE, modifiedTime: file.modifiedTime ?? null, size: file.size ? Number(file.size) : null, description: file.description ?? null, category: categoryFromDescription(file.description), canDownload: file.capabilities?.canDownload === true, driveUrl: file.webViewLink ?? null };
}

function mapFailure(status: number, message: string): DrivePortalError {
  if (status === 401 || status === 403) return new DrivePortalError("You are not authorized to view this Google Drive resource.", status, "unauthorized");
  if (status === 404) return new DrivePortalError("This document is no longer available in the configured Drive folder.", status, "unavailable");
  if (status === 400 || status === 415) return new DrivePortalError(message, status, "invalid");
  return new DrivePortalError(message, status, "upstream");
}

async function throwDriveFailure(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  throw mapFailure(response.status, payload.error?.message || fallback);
}

async function listFiles(env: DriveEnvironment): Promise<DriveFile[]> {
  const { folderId } = settings(env);
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const response = await driveFetch(env, "/files", { q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false and mimeType = '${PDF_MIME_TYPE}'`, fields: "nextPageToken,files(id,name,mimeType,resourceKey,modifiedTime,size,description,webViewLink,capabilities(canDownload))", orderBy: "name_natural", pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...(pageToken ? { pageToken } : {}) });
    if (!response.ok) await throwDriveFailure(response, "The portal could not list the Google Drive folder.");
    const payload = await response.json() as DriveListResponse;
    files.push(...(payload.files ?? []).filter(file => file.mimeType === PDF_MIME_TYPE));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return files;
}

function ordered(documents: PortalDocument[]): PortalDocument[] {
  return [...documents].sort((first, second) => first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: "base" }) || first.id.localeCompare(second.id));
}

async function fileWithContext(env: DriveEnvironment, fileId: string): Promise<DriveFile> {
  const file = (await listFiles(env)).find(item => item.id === fileId);
  if (!file) throw new DrivePortalError("This document is no longer available in the configured Drive folder.", 404, "unavailable");
  return file;
}

export async function listDriveDocuments(env: DriveEnvironment): Promise<PortalDocument[]> {
  return ordered((await listFiles(env)).map(mapFile));
}

export async function getDriveConnectionStatus(env: DriveEnvironment): Promise<DriveConnectionStatus> {
  const rawMode = env.DRIVE_PORTAL_ACCESS_MODE?.trim().toLowerCase();
  const accessMode: DriveAccessMode | null = rawMode === "public" || rawMode === "private" ? rawMode : null;
  const folderConfigured = Boolean(env.GOOGLE_DRIVE_FOLDER_ID?.trim());
  const credentialConfigured = accessMode === "public"
    ? Boolean(env.GOOGLE_DRIVE_API_KEY?.trim())
    : accessMode === "private"
      ? Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim())
      : false;
  const checkedAt = new Date().toISOString();

  if (!accessMode || !folderConfigured || !credentialConfigured) {
    return {
      status: "needs-configuration",
      accessMode,
      folderConfigured,
      credentialConfigured,
      documentCount: null,
      message: "Complete the required server-side Drive settings, then check the connection again.",
      checkedAt,
    };
  }

  try {
    const documents = await listDriveDocuments(env);
    return {
      status: "connected",
      accessMode,
      folderConfigured,
      credentialConfigured,
      documentCount: documents.length,
      message: "Google Drive is connected and the document catalog is available.",
      checkedAt,
    };
  } catch (error) {
    const mapped = toPublicDriveError(error);
    return {
      status: mapped.kind === "configuration" ? "needs-configuration" : "unavailable",
      accessMode,
      folderConfigured,
      credentialConfigured,
      documentCount: null,
      message: mapped.kind === "configuration"
        ? "The server-side Drive configuration needs attention."
        : mapped.kind === "unauthorized"
          ? "Google Drive rejected the configured server-side access."
          : "Google Drive could not be reached. Please try again shortly.",
      checkedAt,
    };
  }
}

export async function getDocumentAccess(env: DriveEnvironment, fileId: string): Promise<PortalDocument> {
  return mapFile(await fileWithContext(env, fileId));
}

export async function getPdfMedia(env: DriveEnvironment, fileId: string): Promise<{ document: PortalDocument; response: Response }> {
  const file = await fileWithContext(env, fileId);
  let response = await driveFetch(env, `/${encodeURIComponent(fileId)}`, { alt: "media", supportsAllDrives: "true", ...(file.resourceKey ? { resourceKey: file.resourceKey } : {}) });
  if (!response.ok && settings(env).mode === "public") {
    const fallback = new URL("https://drive.usercontent.google.com/download");
    fallback.searchParams.set("id", fileId); fallback.searchParams.set("export", "download"); fallback.searchParams.set("confirm", "t");
    if (file.resourceKey) fallback.searchParams.set("resourcekey", file.resourceKey);
    const publicDownload = await fetch(fallback, { redirect: "follow" });
    if (publicDownload.ok) response = publicDownload;
  }
  if (!response.ok) await throwDriveFailure(response, "The selected PDF could not be loaded.");
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (contentType.includes("text/html") || contentType.includes("application/json")) throw new DrivePortalError("Google Drive did not return a PDF document for the selected file.", 415, "invalid");
  return { document: mapFile(file), response };
}

export function toPublicDriveError(error: unknown): DrivePortalError {
  return error instanceof DrivePortalError ? error : new DrivePortalError("The Drive service is temporarily unavailable. Please try again.", 502, "upstream");
}

export function validFileId(fileId: string | string[] | undefined): string | null {
  const value = typeof fileId === "string" ? fileId.trim() : "";
  return value && value.length <= 200 ? value : null;
}

export function errorResponse(error: unknown): Response {
  const mapped = toPublicDriveError(error);
  return Response.json({ error: { code: mapped.kind, message: mapped.message } }, { status: mapped.status >= 400 && mapped.status < 600 ? mapped.status : 502 });
}

export const configuredFolderType = FOLDER_MIME_TYPE;
