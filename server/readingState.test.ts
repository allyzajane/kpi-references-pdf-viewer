import { describe, expect, it } from "vitest";
import { normalizeReadingState } from "../client/src/lib/readingState";

describe("PDF reading-state normalization", () => {
  it("restores valid page position, zoom, fit mode, and rotation for the selected document", () => {
    expect(normalizeReadingState({ page: 12, pageOffset: 0.35, manualZoom: 1.25, fitMode: "manual", rotation: 90 }, 181)).toEqual({ page: 12, pageOffset: 0.35, manualZoom: 1.25, fitMode: "manual", rotation: 90 });
  });

  it("clamps stale reading positions and rejects unsupported display state", () => {
    expect(normalizeReadingState({ page: 999, pageOffset: -1, manualZoom: 10, fitMode: "unexpected", rotation: 45 }, 18)).toEqual({ page: 18, pageOffset: 0, manualZoom: 2.5, fitMode: "page", rotation: 0 });
  });
});
