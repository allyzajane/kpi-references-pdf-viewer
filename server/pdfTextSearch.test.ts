import { describe, expect, it } from "vitest";
import { findPdfTextMatches, getPdfSearchResultCount, normalizePdfText } from "../client/src/lib/pdfTextSearch";

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
});
