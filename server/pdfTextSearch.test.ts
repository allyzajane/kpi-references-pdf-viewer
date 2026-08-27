import { describe, expect, it } from "vitest";
import { findPdfTextMatches, getCyclicSearchResultIndex, getPdfSearchOverlayBounds, getPdfSearchResultCount, getPdfSearchViewportOptions, getPdfTextHighlightIndices, getPdfTextMatchRanges, isPdfTextMatch, normalizePdfText } from "../client/src/lib/pdfTextSearch";

describe("pdf text search", () => {
  it("normalizes PDF extraction whitespace and finds case-insensitive results by page", () => {
    const index = {
      1: "Revenue\nby   division",
      2: "Revenue improved. Revenue was reviewed.",
      3: "No matching text here.",
    };

    expect(normalizePdfText(index[1])).toBe("Revenue by division");
    expect(findPdfTextMatches(index, "REVENUE")).toEqual([
      { page: 1, count: 1, preview: "Revenue by division" },
      { page: 2, count: 2, preview: "Revenue improved. Revenue was reviewed." },
    ]);
  });

  it("does not create a result for an empty query and totals page occurrences", () => {
    const matches = findPdfTextMatches({ 4: "KPI KPI", 7: "KPI" }, "kpi");
    expect(findPdfTextMatches({ 1: "Content" }, "   ")).toEqual([]);
    expect(getPdfSearchResultCount(matches)).toBe(3);
  });

  it("detects normalized case-insensitive text matches for visible highlight spans", () => {
    expect(isPdfTextMatch("Primary\nHealth  Care", "health care")).toBe(true);
    expect(isPdfTextMatch("No matching phrase", "KPI")).toBe(false);
    expect(isPdfTextMatch("KPI", "   ")).toBe(false);
    expect(getPdfTextHighlightIndices(["KPI Name", "Description", "kpi code"], "KPI")).toEqual([0, 2]);
    expect(getPdfTextMatchRanges("KPI / kPi / KPI", "kpi")).toEqual([{ start: 0, end: 3 }, { start: 6, end: 9 }, { start: 12, end: 15 }]);
    expect(getPdfTextMatchRanges("Primary\nHealth  Care", "health care")).toEqual([{ start: 8, end: 20 }]);
  });

  it("cycles through matching pages for next and previous sidebar navigation", () => {
    expect(getCyclicSearchResultIndex(0, 1, 3)).toBe(1);
    expect(getCyclicSearchResultIndex(0, -1, 3)).toBe(2);
    expect(getCyclicSearchResultIndex(2, 1, 3)).toBe(0);
    expect(getCyclicSearchResultIndex(0, 1, 0)).toBe(0);
  });

  it("provides stable CSS viewport inputs for scaled and rotated highlight overlays", () => {
    expect(getPdfSearchViewportOptions(1.5, 90)).toEqual({ scale: 1.5, rotation: 90 });
    expect(getPdfSearchViewportOptions(0, -90)).toEqual({ scale: 1, rotation: 270 });
    expect(getPdfSearchOverlayBounds(600, 800, 1.5, 0)).toEqual({ width: 900, height: 1200 });
    expect(getPdfSearchOverlayBounds(600, 800, 1.5, 90)).toEqual({ width: 1200, height: 900 });
    expect(getPdfSearchOverlayBounds(600, 800, 1.5, 270)).toEqual({ width: 1200, height: 900 });
  });
});
