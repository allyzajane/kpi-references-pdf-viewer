export type PageTextIndex = Record<number, string>;

export type PdfSearchMatch = {
  page: number;
  count: number;
  preview: string;
};

export function normalizePdfText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
