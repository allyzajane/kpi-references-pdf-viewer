export type PageTextIndex = Record<number, string>;

export type PdfSearchMatch = {
  page: number;
  count: number;
  preview: string;
};

export function normalizePdfText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export type PdfTextMatchRange = { start: number; end: number };

function escapePdfSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getPdfTextMatchRanges(value: string, query: string): PdfTextMatchRange[] {
  const normalizedQuery = normalizePdfText(query);
  if (!normalizedQuery) return [];
  const expression = new RegExp(normalizedQuery.split(" ").map(escapePdfSearchRegex).join("\\s+"), "giu");
  const ranges: PdfTextMatchRange[] = [];
  for (const match of Array.from(value.matchAll(expression))) {
    if (match.index === undefined || !match[0]) continue;
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

export function isPdfTextMatch(value: string, query: string): boolean {
  return getPdfTextMatchRanges(value, query).length > 0;
}

export function getPdfSearchViewportOptions(scale: number, rotation: number): { scale: number; rotation: number } {
  return { scale: Number.isFinite(scale) && scale > 0 ? scale : 1, rotation: ((rotation % 360) + 360) % 360 };
}

export function getPdfSearchOverlayBounds(pageWidth: number, pageHeight: number, scale: number, rotation: number): { width: number; height: number } {
  const options = getPdfSearchViewportOptions(scale, rotation);
  const scaledWidth = Math.abs(pageWidth * options.scale);
  const scaledHeight = Math.abs(pageHeight * options.scale);
  return options.rotation % 180 === 0 ? { width: scaledWidth, height: scaledHeight } : { width: scaledHeight, height: scaledWidth };
}

export function getPdfTextHighlightIndices(textItems: string[], query: string): number[] {
  return textItems.flatMap((value, index) => isPdfTextMatch(value, query) ? [index] : []);
}

export function getCyclicSearchResultIndex(currentIndex: number, direction: -1 | 1, resultCount: number): number {
  if (resultCount <= 0) return 0;
  return (currentIndex + direction + resultCount) % resultCount;
}

function countOccurrences(text: string, query: string): number {
  let count = 0;
  let offset = 0;
  while (offset < text.length) {
    const next = text.indexOf(query, offset);
    if (next < 0) return count;
    count += 1;
    offset = next + Math.max(1, query.length);
  }
  return count;
}

function makePreview(text: string, query: string): string {
  const location = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (location < 0) return text.slice(0, 116).trim();
  const start = Math.max(0, location - 42);
  const end = Math.min(text.length, location + query.length + 76);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export function findPdfTextMatches(index: PageTextIndex, query: string): PdfSearchMatch[] {
  const normalizedQuery = normalizePdfText(query).toLocaleLowerCase();
  if (!normalizedQuery) return [];

  return Object.entries(index)
    .map(([page, rawText]) => {
      const text = normalizePdfText(rawText);
      const count = countOccurrences(text.toLocaleLowerCase(), normalizedQuery);
      return count ? { page: Number(page), count, preview: makePreview(text, query) } : null;
    })
    .filter((match): match is PdfSearchMatch => match !== null)
    .sort((left, right) => left.page - right.page);
}

export function getPdfSearchResultCount(matches: PdfSearchMatch[]): number {
  return matches.reduce((total, match) => total + match.count, 0);
}
