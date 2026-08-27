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
  const response = await fetch("/api/configuration/status", { cache: "no-store", headers: { "X-KPI-Setup-Token": accessToken } });
  if (!response.ok) throw await readError(response);
  return await response.json() as DriveConnectionStatus;
}
