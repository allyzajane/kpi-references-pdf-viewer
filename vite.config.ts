import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import path from "node:path";
import { Readable } from "node:stream";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { onRequestGet as documentAccessHandler } from "./functions/api/documents/[fileId]/index";
import { onRequestGet as documentContentHandler } from "./functions/api/documents/[fileId]/content";
import { onRequestGet as documentListHandler } from "./functions/api/documents/index";
import { onRequestGet as configurationStatusHandler } from "./functions/api/configuration/status";
import type { DriveEnvironment } from "./functions/lib/drive";

function developmentDriveApi(): Plugin {
  return {
    name: "development-drive-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/configuration/status", async (request, response, next) => {
        if (request.method !== "GET") return next();
        try {
          const headers = new Headers();
          const suppliedToken = request.headers["x-kpi-setup-token"];
          if (typeof suppliedToken === "string") headers.set("X-KPI-Setup-Token", suppliedToken);
          const handlerResponse = await configurationStatusHandler({ env: process.env as DriveEnvironment, request: new Request("http://localhost/api/configuration/status", { headers }) });
          response.statusCode = handlerResponse.status;
          handlerResponse.headers.forEach((value, key) => response.setHeader(key, value));
          response.end(await handlerResponse.text());
        } catch {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ status: "unavailable", message: "The local configuration check is unavailable." }));
        }
      });
      server.middlewares.use("/api/documents", async (request, response, next) => {
        if (request.method !== "GET") return next();
        const host = request.headers.host || "localhost";
        const forwardedProtocol = request.headers["x-forwarded-proto"]?.toString().split(",")[0];
        const protocol = forwardedProtocol || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
        const url = new URL(request.url || "/", `${protocol}://${host}`);
        const pathSegments = url.pathname.split("/").filter(Boolean);
        const fileId = pathSegments[0];
        const isContentRequest = pathSegments[1] === "content";

        try {
          const env = process.env as DriveEnvironment;
          const handlerResponse = !fileId
            ? await documentListHandler({ env })
            : isContentRequest
              ? await documentContentHandler({ env, params: { fileId }, request: new Request(url, { method: "GET" }) })
              : await documentAccessHandler({ env, params: { fileId }, request: new Request(url, { method: "GET" }) });

          response.statusCode = handlerResponse.status;
          handlerResponse.headers.forEach((value, key) => response.setHeader(key, value));
          if (!handlerResponse.body) return response.end();
          Readable.fromWeb(handlerResponse.body as import("node:stream/web").ReadableStream).pipe(response);
        } catch (error) {
          const message = error instanceof Error ? error.message : "The local document API is unavailable.";
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: { code: "upstream", message } }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), developmentDriveApi()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  // Development-only preview servers may be reached through a temporary proxy host.
  // Cloudflare Pages serves the production build directly and does not use this setting.
  server: { host: true, allowedHosts: true },
});
