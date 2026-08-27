import { importPKCS8, SignJWT } from "jose";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PDF_MIME_TYPE = "application/pdf";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

type DriveAccessMode = "private" | "public";

type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type DriveFileResponse = {
  id: string;
  name: string;
  mimeType: string;
  resourceKey?: string;
  modifiedTime?: string;
  size?: string;
  description?: string | null;
  webViewLink?: string;
  webContentLink?: string;
  capabilities?: {
    canDownload?: boolean;
  };
};

type DriveListResponse = {
  files?: DriveFileResponse[];
  nextPageToken?: string;
};

export type PortalDocument = {
  id: string;
  name: string;
  mimeType: typeof PDF_MIME_TYPE;
  modifiedTime: string | null;
  size: number | null;
  description: string | null;
  category: string;
  canDownload: boolean;
  driveUrl: string | null;
};

export class DrivePortalError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly kind: "configuration" | "unauthorized" | "unavailable" | "invalid" | "upstream" = "upstream"
  ) {
    super(message);
    this.name = "DrivePortalError";
  }
}

let accessTokenCache: { token: string; expiresAt: number } | null = null;

function getDriveSettings(): { mode: DriveAccessMode; folderId: string; apiKey?: string; credentials?: ServiceAccountCredentials } {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const mode = process.env.DRIVE_PORTAL_ACCESS_MODE?.trim().toLowerCase();

  if (!folderId) {
    throw new DrivePortalError("The Google Drive folder has not been configured.", 503, "configuration");
  }

  if (mode === "public") {
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
    if (!apiKey) {
      throw new DrivePortalError("Public Drive access requires a server-side Google Drive API key.", 503, "configuration");
    }
    return { mode, folderId, apiKey };
  }

  if (mode === "private") {
    const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!rawCredentials) {
      throw new DrivePortalError("Private Drive access requires a server-side service account key.", 503, "configuration");
    }

    try {
      const credentials = JSON.parse(rawCredentials) as ServiceAccountCredentials;
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error("Required service account fields are missing.");
      }
      return { mode, folderId, credentials };
    } catch {
      throw new DrivePortalError("The configured service account key is not valid JSON.", 503, "configuration");
    }
  }

  throw new DrivePortalError("Set DRIVE_PORTAL_ACCESS_MODE to either private or public.", 503, "configuration");
}

async function getServiceAccountToken(credentials: ServiceAccountCredentials): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  const privateKey = credentials.private_key?.replace(/\\n/g, "\n");
  const clientEmail = credentials.client_email;
  if (!privateKey || !clientEmail) {
    throw new DrivePortalError("The service account key is incomplete.", 503, "configuration");
  }

  try {
    const signingKey = await importPKCS8(privateKey, "RS256");
    const assertion = await new SignJWT({ scope: DRIVE_SCOPE })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(clientEmail)
      .setSubject(clientEmail)
      .setAudience(credentials.token_uri || GOOGLE_TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(signingKey);

    const tokenResponse = await fetch(credentials.token_uri || GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    const tokenPayload = (await tokenResponse.json()) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new DrivePortalError(tokenPayload.error_description || "Google rejected the service-account credentials.", tokenResponse.status || 401, "unauthorized");
    }

    accessTokenCache = {
      token: tokenPayload.access_token,
      expiresAt: Date.now() + Math.max((tokenPayload.expires_in ?? 3600) - 60, 60) * 1000,
    };
    return accessTokenCache.token;
  } catch (error) {
    if (error instanceof DrivePortalError) throw error;
    const detail = error instanceof Error ? error.message : "an unknown signing error";
    throw new DrivePortalError(`The portal could not authenticate with Google Drive: ${detail}`, 401, "unauthorized");
  }
}

async function driveFetch(path: string, query: Record<string, string> = {}, init?: RequestInit): Promise<Response> {
  const settings = getDriveSettings();
  const url = new URL(`${DRIVE_API_BASE}${path}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers = new Headers(init?.headers);
  if (settings.mode === "private") {
    headers.set("Authorization", `Bearer ${await getServiceAccountToken(settings.credentials!)}`);
  } else {
    url.searchParams.set("key", settings.apiKey!);
  }

  return fetch(url, { ...init, headers });
}

async function fetchPublicDriveDownload(fileId: string, resourceKey?: string): Promise<Response> {
  const url = new URL("https://drive.usercontent.google.com/download");
  url.searchParams.set("id", fileId);
  url.searchParams.set("export", "download");
  url.searchParams.set("confirm", "t");
  if (resourceKey) url.searchParams.set("resourcekey", resourceKey);
  return fetch(url, { redirect: "follow" });
}

export function mapDriveFailure(status: number, message: string): DrivePortalError {
  if (status === 401 || status === 403) {
    return new DrivePortalError("You are not authorized to view this Google Drive resource.", status, "unauthorized");
  }
  if (status === 404) {
    return new DrivePortalError("This document is no longer available in the configured Drive folder.", status, "unavailable");
  }
  if (status === 400 || status === 415) {
    return new DrivePortalError(message, status, "invalid");
  }
  return new DrivePortalError(message, status, "upstream");
}

export function isUnexpectedPdfContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized.includes("text/html") || normalized.includes("application/json");
}

async function parseDriveFailure(response: Response, fallback: string): Promise<DrivePortalError> {
  let message = fallback;
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    message = payload.error?.message || fallback;
  } catch {
    // The status below remains the authoritative failure signal.
  }

  return mapDriveFailure(response.status, message);
}

export function isPdfDriveFile(file: Pick<DriveFileResponse, "mimeType">): boolean {
  return file.mimeType === PDF_MIME_TYPE;
}

export function categoryFromDescription(description?: string | null): string {
  const match = description?.match(/(?:^|[\n;])\s*category\s*:\s*([^\n;]+)/i);
  return match?.[1]?.trim() || "Documents";
}

export function mapDriveFile(file: DriveFileResponse): PortalDocument {
  return {
    id: file.id,
    name: file.name,
    mimeType: PDF_MIME_TYPE,
    modifiedTime: file.modifiedTime ?? null,
    size: file.size ? Number(file.size) : null,
    description: file.description ?? null,
    category: categoryFromDescription(file.description),
    canDownload: file.capabilities?.canDownload === true,
    driveUrl: file.webViewLink ?? null,
  };
}

export function orderDocuments(documents: PortalDocument[]): PortalDocument[] {
  return [...documents].sort((first, second) => {
    const byName = first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: "base" });
    return byName || first.id.localeCompare(second.id);
  });
}

async function listDrivePdfFiles(): Promise<DriveFileResponse[]> {
  const { folderId } = getDriveSettings();
  const files: DriveFileResponse[] = [];
  let pageToken: string | undefined;

  do {
    const response = await driveFetch("/files", {
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false and mimeType = '${PDF_MIME_TYPE}'`,
      fields: "nextPageToken,files(id,name,mimeType,resourceKey,modifiedTime,size,description,webViewLink,webContentLink,capabilities(canDownload))",
      orderBy: "name_natural",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      ...(pageToken ? { pageToken } : {}),
    });

    if (!response.ok) throw await parseDriveFailure(response, "The portal could not list the Google Drive folder.");
    const payload = (await response.json()) as DriveListResponse;
    files.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return files.filter(isPdfDriveFile);
}

export async function listDrivePdfDocuments(): Promise<PortalDocument[]> {
  return orderDocuments((await listDrivePdfFiles()).map(mapDriveFile));
}

export async function verifyDriveFolderAccess(): Promise<{ id: string; name: string; mimeType: string }> {
  const settings = getDriveSettings();
  const { folderId } = settings;

  if (settings.mode === "public") {
    const response = await driveFetch("/files", {
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false and mimeType = '${PDF_MIME_TYPE}'`,
      fields: "files(id)",
      pageSize: "1",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (!response.ok) throw await parseDriveFailure(response, "The configured public Drive folder could not be queried.");
    return { id: folderId, name: "Configured public folder", mimeType: FOLDER_MIME_TYPE };
  }

  const response = await driveFetch(`/${encodeURIComponent(folderId)}`, {
    fields: "id,name,mimeType",
    supportsAllDrives: "true",
  });
  if (!response.ok) throw await parseDriveFailure(response, "The configured Google Drive folder could not be reached.");
  const folder = (await response.json()) as { id: string; name: string; mimeType: string };
  if (folder.mimeType !== FOLDER_MIME_TYPE) {
    throw new DrivePortalError("The configured Google Drive ID does not identify a folder.", 400, "invalid");
  }
  return folder;
}

async function getPdfMetadata(fileId: string): Promise<DriveFileResponse> {
  const response = await driveFetch(`/${encodeURIComponent(fileId)}`, {
    fields: "id,name,mimeType,resourceKey,modifiedTime,size,description,webViewLink,capabilities(canDownload)",
    supportsAllDrives: "true",
  });
  if (!response.ok) throw await parseDriveFailure(response, "The selected Google Drive document is unavailable.");
  const file = (await response.json()) as DriveFileResponse;
  if (!isPdfDriveFile(file)) {
    throw new DrivePortalError("The selected Drive file is not a PDF document.", 415, "invalid");
  }
  return file;
}

async function getPdfFileWithAccessContext(fileId: string): Promise<DriveFileResponse> {
  if (getDriveSettings().mode === "public") {
    const file = (await listDrivePdfFiles()).find(item => item.id === fileId);
    if (!file) {
      throw new DrivePortalError("This document is no longer available in the configured Drive folder.", 404, "unavailable");
    }
    return file;
  }
  return getPdfMetadata(fileId);
}

export async function getPdfDocument(fileId: string): Promise<PortalDocument> {
  return mapDriveFile(await getPdfFileWithAccessContext(fileId));
}

export async function getPdfMediaResponse(fileId: string): Promise<{ document: PortalDocument; response: Response }> {
  const file = await getPdfFileWithAccessContext(fileId);
  const document = mapDriveFile(file);
  let response = await driveFetch(`/${encodeURIComponent(fileId)}`, {
    alt: "media",
    supportsAllDrives: "true",
    ...(file.resourceKey ? { resourceKey: file.resourceKey } : {}),
  });
  if (!response.ok && getDriveSettings().mode === "public") {
    const publicDownload = await fetchPublicDriveDownload(fileId, file.resourceKey);
    if (publicDownload.ok) response = publicDownload;
  }
  if (!response.ok) throw await parseDriveFailure(response, "The selected PDF could not be loaded.");

  const mediaType = response.headers.get("content-type")?.toLowerCase() || "";
  if (isUnexpectedPdfContentType(mediaType)) {
    throw new DrivePortalError("Google Drive did not return a PDF document for the selected file.", 415, "invalid");
  }
  return { document, response };
}

export function toPublicDriveError(error: unknown): DrivePortalError {
  if (error instanceof DrivePortalError) return error;
  return new DrivePortalError("The Drive service is temporarily unavailable. Please try again.", 502, "upstream");
}
