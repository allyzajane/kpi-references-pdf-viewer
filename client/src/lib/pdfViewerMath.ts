export type FitMode = "width" | "page" | "manual";

export type PdfViewportSize = {
  width: number;
  height: number;
};

export const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200] as const;

export function clampZoom(scale: number): number {
  return Math.min(2.5, Math.max(0.35, Number(scale.toFixed(3))));
}

export function getFitScale(
  mode: Exclude<FitMode, "manual">,
  page: PdfViewportSize,
  container: PdfViewportSize,
  padding = 24
): number {
  const availableWidth = Math.max(container.width - padding * 2, 120);
  const availableHeight = Math.max(container.height - padding * 2, 120);
  const widthScale = availableWidth / Math.max(page.width, 1);
  if (mode === "width") return widthScale;
  return Math.min(widthScale, availableHeight / Math.max(page.height, 1));
}

export function getRenderScale(
  mode: FitMode,
  manualZoom: number,
  page: PdfViewportSize,
  container: PdfViewportSize,
  padding = 24
): number {
  const widthScale = getFitScale("width", page, container, padding);
  const requested = mode === "manual" ? manualZoom : getFitScale(mode, page, container, padding);
  // Keep the complete page within the reader’s width. This avoids horizontal document scrolling.
  return Math.min(widthScale, clampZoom(requested));
}
