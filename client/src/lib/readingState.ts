import { clampZoom, type FitMode } from "./pdfViewerMath";

export type SavedReadingState = {
  mode: "continuous" | "single";
  page: number;
  pageOffset: number;
  manualZoom: number;
  fitMode: FitMode;
  rotation: number;
};

const STORAGE_KEY = "drive-pdf-viewer:reading-state";
const MAX_SAVED_DOCUMENTS = 40;

function clampPage(value: unknown, pageCount: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Math.min(pageCount, Math.max(1, Number.isFinite(parsed) ? Math.round(parsed) : 1));
}

export function normalizeReadingState(value: unknown, pageCount: number): SavedReadingState | null {
  if (!value || typeof value !== "object" || pageCount < 1) return null;
  const raw = value as Partial<SavedReadingState>;
  const fitMode: FitMode = raw.fitMode === "width" || raw.fitMode === "page" || raw.fitMode === "manual" ? raw.fitMode : "page";
  const offset = Number(raw.pageOffset);
  const rotationCandidate = Number(raw.rotation);
  const rotation = [0, 90, 180, 270].includes(rotationCandidate) ? rotationCandidate : 0;
  return {
    mode: raw.mode === "single" ? "single" : "continuous",
    page: clampPage(raw.page, pageCount),
    pageOffset: Number.isFinite(offset) ? Math.min(1, Math.max(0, offset)) : 0,
    manualZoom: clampZoom(Number(raw.manualZoom) || 1),
    fitMode,
    rotation,
  };
}

export function loadReadingState(fileId: string, pageCount: number): SavedReadingState | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, unknown>;
    return normalizeReadingState(all[fileId], pageCount);
  } catch {
    return null;
  }
}

export function saveReadingState(fileId: string, state: SavedReadingState): void {
  if (typeof window === "undefined") return;
  try {
    const current = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, unknown>;
    const entries = Object.entries(current).slice(-(MAX_SAVED_DOCUMENTS - 1));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...Object.fromEntries(entries), [fileId]: state }));
  } catch {
    // Storage may be unavailable in private browser contexts. Reading continues without persistence.
  }
}
