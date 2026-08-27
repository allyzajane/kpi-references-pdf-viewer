import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPdfMediaResponse: vi.fn() }));

vi.mock("./driveDocuments", () => ({
  getPdfMediaResponse: mocks.getPdfMediaResponse,
  toPublicDriveError: (error: unknown) => error,
}));

import { serveDrivePdf } from "./documentRoutes";

const { getPdfMediaResponse } = mocks;

type ResponseCapture = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  res: Record<string, unknown>;
};

function createResponse(): ResponseCapture {
  const capture: Omit<ResponseCapture, "res"> = { statusCode: 200, body: null, headers: {} };
  const res = {
    status: vi.fn((statusCode: number) => { capture.statusCode = statusCode; return res; }),
    json: vi.fn((body: unknown) => { capture.body = body; return res; }),
    setHeader: vi.fn((name: string, value: string) => { capture.headers[name] = value; }),
    get headersSent() { return false; },
    end: vi.fn(),
  };
  return { ...capture, res } as ResponseCapture;
}

function createRequest(fileId: string, download?: string) {
  return { params: { fileId }, query: download ? { download } : {} };
}

describe("serveDrivePdf", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects malformed document IDs before attempting Drive access", async () => {
    const capture = createResponse();
    await serveDrivePdf(createRequest("") as never, capture.res as never);

    expect(getPdfMediaResponse).not.toHaveBeenCalled();
    expect(capture.res.status).toHaveBeenCalledWith(400);
    expect(capture.res.json).toHaveBeenCalledWith({ error: { code: "invalid", message: "A valid PDF document ID is required." } });
  });

  it.each([
    [403, "unauthorized", "You are not authorized to view this Google Drive resource."],
    [404, "unavailable", "This document is no longer available in the configured Drive folder."],
    [415, "invalid", "Google Drive did not return a PDF document for the selected file."],
  ])("returns the mapped %s Drive error without leaking upstream details", async (status, code, message) => {
    getPdfMediaResponse.mockRejectedValue({ status, kind: code, message });
    const capture = createResponse();
    await serveDrivePdf(createRequest("valid-file") as never, capture.res as never);

    expect(capture.res.status).toHaveBeenCalledWith(status);
    expect(capture.res.json).toHaveBeenCalledWith({ error: { code, message } });
  });

  it("refuses an attempted download when Drive does not grant download permission", async () => {
    getPdfMediaResponse.mockResolvedValue({
      document: { id: "valid-file", name: "Restricted.pdf", canDownload: false },
      response: new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    });
    const capture = createResponse();
    await serveDrivePdf(createRequest("valid-file", "1") as never, capture.res as never);

    expect(capture.res.status).toHaveBeenCalledWith(403);
    expect(capture.res.json).toHaveBeenCalledWith({ error: { code: "unauthorized", message: "Downloads are not permitted for this document." } });
  });

  it("returns an upstream error when Drive supplies no PDF stream", async () => {
    getPdfMediaResponse.mockResolvedValue({
      document: { id: "valid-file", name: "Empty.pdf", canDownload: true },
      response: { headers: new Headers(), body: null },
    });
    const capture = createResponse();
    await serveDrivePdf(createRequest("valid-file") as never, capture.res as never);

    expect(capture.res.status).toHaveBeenLastCalledWith(502);
    expect(capture.res.json).toHaveBeenCalledWith({ error: { code: "upstream", message: "Google Drive returned an empty PDF response." } });
  });
});
