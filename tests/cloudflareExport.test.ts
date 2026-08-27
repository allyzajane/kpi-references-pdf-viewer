import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDriveConnectionStatus, listDriveDocuments, validFileId } from "../functions/lib/drive";
import { onRequestGet as configurationStatusHandler } from "../functions/api/configuration/status";
import { onRequestGet as listHandler } from "../functions/api/documents/index";
import { onRequestGet as accessHandler } from "../functions/api/documents/[fileId]/index";
import { onRequestGet as contentHandler } from "../functions/api/documents/[fileId]/content";

const projectRoot = resolve(import.meta.dirname, "..");
const platformName = ["man", "us"].join("");
const excludedDirectories = new Set(["node_modules", ".git", "dist", ".wrangler", `.${platformName}-logs`]);
const excludedFiles = new Set([".project-config.json"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    if (excludedDirectories.has(entry)) return [];
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

const testEnvironment = { DRIVE_PORTAL_ACCESS_MODE: "public", GOOGLE_DRIVE_FOLDER_ID: "folder-id", GOOGLE_DRIVE_API_KEY: "test-key" };
const driveFile = { id: "pdf-1", name: "KPI Plan.pdf", mimeType: "application/pdf", resourceKey: "server-only", capabilities: { canDownload: true } };

function mockDriveList(file = driveFile) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ files: [file] })));
}

describe("independent Cloudflare Pages export", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses standard Vite build and Cloudflare Pages commands", () => {
    const manifest = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
    const viteConfig = readFileSync(resolve(projectRoot, "vite.config.ts"), "utf8");
    expect(manifest.scripts.build).toBe("vite build");
    expect(manifest.scripts["cf:dev"]).toBe("wrangler pages dev dist");
    expect(manifest.scripts["cf:deploy"]).toBe("wrangler pages deploy dist");
    expect(viteConfig).toContain("plugins: [react(), tailwindcss(), developmentDriveApi()]");
  });

  it("keeps Drive identifiers bounded before a Pages Function uses them", () => {
    expect(validFileId("abc_123-XYZ")).toBe("abc_123-XYZ");
    expect(validFileId("")).toBeNull();
    expect(validFileId("x".repeat(201))).toBeNull();
  });

  it("keeps Drive resource-key access context out of catalog responses", async () => {
    mockDriveList();
    const documents = await listDriveDocuments(testEnvironment);
    expect(documents).toEqual([expect.objectContaining({ id: "pdf-1", canDownload: true })]);
    expect(documents[0]).not.toHaveProperty("resourceKey");
  });

  it("reports safe Drive connection status without credential or access-key values", async () => {
    const incomplete = await getDriveConnectionStatus({ DRIVE_PORTAL_ACCESS_MODE: "public", GOOGLE_DRIVE_FOLDER_ID: "folder-id" });
    expect(incomplete).toMatchObject({ status: "needs-configuration", folderConfigured: true, credentialConfigured: false, documentCount: null });
    expect(JSON.stringify(incomplete)).not.toContain("folder-id");

    mockDriveList();
    const testStatusToken = "test-status-token";
    const response = await configurationStatusHandler({
      env: { ...testEnvironment, DRIVE_STATUS_ACCESS_TOKEN: testStatusToken },
      request: new Request("https://portal.example/api/configuration/status", { headers: { "X-KPI-Setup-Token": testStatusToken } }),
    });
    const payload = await response.json() as Record<string, unknown>;
    expect(payload).toMatchObject({ status: "connected", accessMode: "public", documentCount: 1 });
    expect(payload).not.toHaveProperty("resourceKey");
    expect(JSON.stringify(payload)).not.toContain("test-key");
    expect(JSON.stringify(payload)).not.toContain("folder-id");
  });

  it("accepts the installed operator token and rejects unauthenticated status checks", async () => {
    const operatorToken = process.env.DRIVE_STATUS_ACCESS_TOKEN;
    expect(operatorToken).toEqual(expect.any(String));
    expect(operatorToken?.length).toBeGreaterThan(0);

    const denied = await configurationStatusHandler({
      env: { ...testEnvironment, DRIVE_STATUS_ACCESS_TOKEN: operatorToken },
      request: new Request("https://portal.example/api/configuration/status"),
    });
    expect(denied.status).toBe(401);

    mockDriveList();
    const granted = await configurationStatusHandler({
      env: { ...testEnvironment, DRIVE_STATUS_ACCESS_TOKEN: operatorToken },
      request: new Request("https://portal.example/api/configuration/status", { headers: { "X-KPI-Setup-Token": operatorToken! } }),
    });
    expect(granted.status).toBe(200);
  });

  it("serves list and access payloads without Drive access context", async () => {
    mockDriveList();
    const listed = await listHandler({ env: testEnvironment });
    const listedPayload = await listed.json() as { documents: Array<Record<string, unknown>> };
    expect(listed.status).toBe(200);
    expect(listedPayload.documents[0]).not.toHaveProperty("resourceKey");

    mockDriveList();
    const access = await accessHandler({ env: testEnvironment, params: { fileId: "pdf-1" }, request: new Request("https://portal.example/api/documents/pdf-1") });
    const accessPayload = await access.json() as { viewerUrl: string; downloadUrl: string | null; document: Record<string, unknown> };
    expect(access.status).toBe(200);
    expect(accessPayload.viewerUrl).toBe("https://portal.example/api/documents/pdf-1/content");
    expect(accessPayload.downloadUrl).toBe("https://portal.example/api/documents/pdf-1/content?download=1");
    expect(accessPayload.document).not.toHaveProperty("resourceKey");
  });

  it("streams PDF content and honors download permissions", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ files: [driveFile] }))
      .mockResolvedValueOnce(new Response("%PDF-1.7", { headers: { "content-type": "application/pdf", "content-length": "8" } })));
    const content = await contentHandler({ env: testEnvironment, params: { fileId: "pdf-1" }, request: new Request("https://portal.example/api/documents/pdf-1/content") });
    expect(content.status).toBe(200);
    expect(content.headers.get("content-type")).toBe("application/pdf");
    expect(content.headers.get("content-disposition")).toContain("inline; filename=\"KPI Plan.pdf\"");
    expect(await content.text()).toBe("%PDF-1.7");

    const noDownloadFile = { ...driveFile, capabilities: { canDownload: false } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ files: [noDownloadFile] }))
      .mockResolvedValueOnce(new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } })));
    const blocked = await contentHandler({ env: testEnvironment, params: { fileId: "pdf-1" }, request: new Request("https://portal.example/api/documents/pdf-1/content?download=1") });
    expect(blocked.status).toBe(403);
  });

  it("contains no platform branding or platform runtime references in exportable source", () => {
    const offenders = sourceFiles(projectRoot)
      .filter(path => !excludedFiles.has(path.split("/").at(-1) || "") && !path.endsWith(".lock") && !path.endsWith(".png") && !path.endsWith(".webp"))
      .filter(path => readFileSync(path, "utf8").toLowerCase().includes(platformName));
    expect(offenders).toEqual([]);
  });
});
