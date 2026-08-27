import { errorResponse, getDocumentAccess, validFileId, type DriveEnvironment } from "../../../lib/drive";

export const onRequestGet = async ({ env, params, request }: { env: DriveEnvironment; params: { fileId?: string | string[] }; request: Request }): Promise<Response> => {
  const fileId = validFileId(params.fileId);
  if (!fileId) return Response.json({ error: { code: "invalid", message: "A valid PDF document ID is required." } }, { status: 400 });
  try {
    const document = await getDocumentAccess(env, fileId);
    const baseUrl = new URL(request.url);
    const viewerUrl = `${baseUrl.origin}/api/documents/${encodeURIComponent(fileId)}/content`;
    return Response.json({ document, viewerUrl, downloadUrl: document.canDownload ? `${viewerUrl}?download=1` : null });
  } catch (error) {
    return errorResponse(error);
  }
};
