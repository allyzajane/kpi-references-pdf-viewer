import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { getPdfMediaResponse, toPublicDriveError } from "./driveDocuments";

function safeFilename(name: string): string {
  return name.replace(/[\r\n"]/g, "_");
}

export async function serveDrivePdf(req: Request, res: Response): Promise<void> {
  const fileId = typeof req.params.fileId === "string" ? req.params.fileId.trim() : "";
  const wantsDownload = req.query.download === "1";

  if (!fileId || fileId.length > 200) {
    res.status(400).json({ error: { code: "invalid", message: "A valid PDF document ID is required." } });
    return;
  }

  try {
    const { document, response } = await getPdfMediaResponse(fileId);
    if (wantsDownload && !document.canDownload) {
      res.status(403).json({ error: { code: "unauthorized", message: "Downloads are not permitted for this document." } });
      return;
    }

    const contentLength = response.headers.get("content-length");
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${wantsDownload ? "attachment" : "inline"}; filename=\"${safeFilename(document.name)}\"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    if (!response.body) {
      res.status(502).json({ error: { code: "upstream", message: "Google Drive returned an empty PDF response." } });
      return;
    }

    const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(502).json({ error: { code: "upstream", message: "The PDF stream ended unexpectedly." } });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    const driveError = toPublicDriveError(error);
    const status = driveError.status >= 400 && driveError.status < 600 ? driveError.status : 502;
    res.status(status).json({ error: { code: driveError.kind, message: driveError.message } });
  }
}
