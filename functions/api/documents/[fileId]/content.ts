import { errorResponse, getPdfMedia, validFileId, type DriveEnvironment } from "../../../lib/drive";

function safeFilename(name: string): string {
  return name.replace(/[\r\n"]/g, "_");
}

export const onRequestGet = async ({ env, params, request }: { env: DriveEnvironment; params: { fileId?: string | string[] }; request: Request }): Promise<Response> => {
  const fileId = validFileId(params.fileId);
  if (!fileId) return Response.json({ error: { code: "invalid", message: "A valid PDF document ID is required." } }, { status: 400 });
  try {
    const { document, response } = await getPdfMedia(env, fileId);
    const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
    if (wantsDownload && !document.canDownload) return Response.json({ error: { code: "unauthorized", message: "Downloads are not permitted for this document." } }, { status: 403 });
    if (!response.body) return Response.json({ error: { code: "upstream", message: "Google Drive returned an empty PDF response." } }, { status: 502 });
    const headers = new Headers({ "Content-Type": "application/pdf", "Content-Disposition": `${wantsDownload ? "attachment" : "inline"}; filename="${safeFilename(document.name)}"`, "Cache-Control": "private, max-age=300" });
    const length = response.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
};
