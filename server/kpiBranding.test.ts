import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KPI_KEY_TOOLTIP } from "../client/src/components/KpiKeyBrand";

const projectRoot = resolve(import.meta.dirname, "..");

describe("KPI brand treatment", () => {
  it("keeps the KPI key tooltip copy explicit", () => {
    expect(KPI_KEY_TOOLTIP).toBe("Key Performance Indicator");
    const home = readFileSync(resolve(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain('role="tooltip"');
    expect(home).toContain("kpi-key-tooltip");
  });

  it("uses the golden KPI key as the SVG favicon", () => {
    const html = readFileSync(resolve(projectRoot, "client/index.html"), "utf8");
    const favicon = readFileSync(resolve(projectRoot, "client/public/favicon.svg"), "utf8");
    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/favicon.svg"');
    expect(favicon).toContain('cx="9" cy="12" r="6.25"');
    expect(favicon).toContain('d="M13.8 15.8H27.2V19.1H24.4V22H21.4V19.1H18.7V17.8H13.8V15.8Z"');
    expect(favicon).toContain('fill="#F7CE62"');
    expect(favicon).toContain('fill="#1890CF"');
    expect(html).toContain("<title>Opening KPI References...</title>");
  });

  it("changes the loading tab title to the ready KPI References title", () => {
    const home = readFileSync(resolve(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain('document.title = documentsQuery.isLoading ? "Opening KPI References..." : "KPI References"');
  });

  it("retains every provided blue theme color", () => {
    const css = readFileSync(resolve(projectRoot, "client/src/index.css"), "utf8");
    ["#E8F5FC", "#BFE4F8", "#96D2F3", "#6DC1EE", "#44AFE9", "#1B9EE4", "#1890CF"].forEach(color => expect(css).toContain(color));
    expect(css).toContain(".kpi-key-loader");
    expect(css).toContain("kpi-key-orbit");
  });
});
