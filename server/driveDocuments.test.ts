import { describe, expect, it } from "vitest";
import { categoryFromDescription, getPdfMediaResponse, isPdfDriveFile, isUnexpectedPdfContentType, listDrivePdfDocuments, mapDriveFailure, orderDocuments, verifyDriveFolderAccess } from "./driveDocuments";

describe("Google Drive portal configuration", () => {
  it("can reach the configured folder with server-only credentials", async () => {
    const folder = await verifyDriveFolderAccess();

    expect(folder.id).toBeTruthy();
    expect(folder.name).toBeTruthy();
    expect(folder.mimeType).toBe("application/vnd.google-apps.folder");
  }, 20_000);

  it("lists a consistently ordered PDF-only collection", async () => {
    const documents = await listDrivePdfDocuments();

    expect(documents.every(document => document.mimeType === "application/pdf")).toBe(true);
    expect(documents).toEqual(orderDocuments(documents));
  }, 20_000);

  it("retrieves an authorized listed PDF as a browser-renderable stream", async () => {
    const document = (await listDrivePdfDocuments())[0];
    if (!document) return;

    const result = await getPdfMediaResponse(document.id);

    expect(result.document.id).toBe(document.id);
    expect(result.document).not.toHaveProperty("resourceKey");
    expect(result.response.ok).toBe(true);
    expect(["application/pdf", "application/octet-stream"]).toContain(result.response.headers.get("content-type")?.toLowerCase());
    const firstBytes = new Uint8Array(await result.response.arrayBuffer()).slice(0, 4);
    expect(new TextDecoder().decode(firstBytes)).toBe("%PDF");
  }, 30_000);
});

describe("Drive document normalization", () => {
  it("accepts only the Drive PDF MIME type and extracts optional categories", () => {
    expect(isPdfDriveFile({ mimeType: "application/pdf" })).toBe(true);
    expect(isPdfDriveFile({ mimeType: "image/png" })).toBe(false);
    expect(categoryFromDescription("Internal guidance; Category: Policies")).toBe("Policies");
    expect(categoryFromDescription(null)).toBe("Documents");
  });

  it("maps unavailable, unauthorized, invalid, and unexpected-content states predictably", () => {
    expect(mapDriveFailure(403, "Denied")).toMatchObject({ kind: "unauthorized", status: 403 });
    expect(mapDriveFailure(404, "Missing")).toMatchObject({ kind: "unavailable", status: 404 });
    expect(mapDriveFailure(415, "Not a PDF")).toMatchObject({ kind: "invalid", status: 415 });
    expect(mapDriveFailure(503, "Drive offline")).toMatchObject({ kind: "upstream", status: 503 });
    expect(isUnexpectedPdfContentType("text/html; charset=utf-8")).toBe(true);
    expect(isUnexpectedPdfContentType("application/json")).toBe(true);
    expect(isUnexpectedPdfContentType("application/pdf")).toBe(false);
    expect(isUnexpectedPdfContentType("application/octet-stream")).toBe(false);
  });
});
