export type PortalDocument = {
  id: string;
  name: string;
  mimeType: "application/pdf";
  modifiedTime: string | null;
  size: number | null;
  description: string | null;
  category: string;
  canDownload: boolean;
  driveUrl: string | null;
};

export type DocumentAccess = {
  document: PortalDocument;
  viewerUrl: string;
  downloadUrl: string | null;
};

export type DriveConnectionStatus = {
  status: "connected" | "needs-configuration" | "unavailable";
  accessMode: "public" | "private" | null;
  folderConfigured: boolean;
  credentialConfigured: boolean;
  documentCount: number | null;
  message: string;
  checkedAt: string;
};

type ApiError = { error?: { message?: string } };

async function readError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => ({})) as ApiError;
  return new Error(payload.error?.message || `Request failed with status ${response.status}.`);
}

export async function listDocuments(): Promise<PortalDocument[]> {
  const response = await fetch("/api/documents");
  if (!response.ok) throw await readError(response);
  const payload = await response.json() as { documents?: PortalDocument[] };
  return payload.documents ?? [];
}

export async function getDocumentAccess(fileId: string): Promise<DocumentAccess> {
  const response = await fetch(`/api/documents/${encodeURIComponent(fileId)}`);
  if (!response.ok) throw await readError(response);
  return await response.json() as DocumentAccess;
}

export async function getDriveConnectionStatus(accessToken: string): Promise<DriveConnectionStatus> {
  if (import.meta.env.DEV) {
    const previewResponse = await fetch("/api/configuration/status", { cache: "no-store" });
    if (!previewResponse.ok) throw await readError(previewResponse);
    return await previewResponse.json() as DriveConnectionStatus;
  }
  const sessionResponse = await fetch("/api/configuration/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: accessToken }) });
  if (!sessionResponse.ok) throw await readError(sessionResponse);
  const response = await fetch("/api/configuration/status", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw await readError(response);
  return await response.json() as DriveConnectionStatus;
}
