import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { clampZoom, getRenderScale, type FitMode, ZOOM_PRESETS } from "@/lib/pdfViewerMath";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileQuestion,
  FileText,
  FolderOpen,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCw,
  ScanLine,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type PortalDocument = {
  id: string;
  name: string;
  mimeType: "application/pdf";
  modifiedTime: string | null;
  size: number | null;
  description: string | null;
  category: string;
  canDownload: boolean;
  driveUrl: string | null;
};

type DocumentAccess = { document: PortalDocument; viewerUrl: string; downloadUrl: string | null };
type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
type ContainerSize = { width: number; height: number };

const LAST_DOCUMENT_KEY = "drive-pdf-viewer:last-authorized-document";
const LIST_REFRESH_INTERVAL = 60_000;

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes < 1) return "PDF document";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function getInitialFitMode(): FitMode {
  return typeof window !== "undefined" && window.innerWidth < 768 ? "width" : "page";
}

function ViewerCanvas({ selectedDocument, access }: { selectedDocument: PortalDocument; access: DocumentAccess }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const renderScaleRef = useRef(1);

  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>(getInitialFitMode);
  const [manualZoom, setManualZoom] = useState(1);
  const [effectiveZoom, setEffectiveZoom] = useState(100);
  const [containerSize, setContainerSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url: access.viewerUrl, withCredentials: false });
    setPdf(null);
    setPage(1);
    setPageInput("1");
    setRotation(0);
    setFitMode(getInitialFitMode());
    setManualZoom(1);
    setLoading(true);
    setError(null);
    task.promise
      .then(loaded => {
        if (!cancelled) setPdf(loaded);
      })
      .catch(reason => {
        if (!cancelled) setError(`Unable to display this document. ${reason instanceof Error ? reason.message : "The PDF could not be opened."}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [access.viewerUrl, retryVersion, selectedDocument.id]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => {
      const next = { width: Math.round(viewport.clientWidth), height: Math.round(viewport.clientHeight) };
      setContainerSize(current => current.width === next.width && current.height === next.height ? current : next);
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    window.addEventListener("orientationchange", updateSize);
    updateSize();
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", updateSize);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !containerSize.width || !containerSize.height || error) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const renderPage = async () => {
      setRendering(true);
      try {
        const pdfPage = await pdf.getPage(page);
        const pageAtScaleOne = pdfPage.getViewport({ scale: 1, rotation });
        const scale = getRenderScale(fitMode, manualZoom, pageAtScaleOne, containerSize, 24);
        renderScaleRef.current = scale;
        const nextZoom = Math.round(scale * 100);
        setEffectiveZoom(current => current === nextZoom ? current : nextZoom);
        const renderedViewport = pdfPage.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !context || cancelled) return;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.floor(renderedViewport.width * pixelRatio);
        canvas.height = Math.floor(renderedViewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(renderedViewport.width)}px`;
        canvas.style.height = `${Math.floor(renderedViewport.height)}px`;
        renderTask = pdfPage.render({
          canvas,
          viewport: renderedViewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
          background: "#ffffff",
        });
        await renderTask.promise;
      } catch (reason) {
        if (!cancelled && !(reason instanceof Error && reason.name === "RenderingCancelledException")) {
          setError(`Unable to render this document. ${reason instanceof Error ? reason.message : "The current page could not be rendered."}`);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerSize, error, fitMode, manualZoom, page, pdf, rotation]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const pageCount = pdf?.numPages ?? 0;
  const transitionToManual = (nextScale: number) => {
    setFitMode("manual");
    setManualZoom(clampZoom(nextScale));
  };
  const changeZoom = (direction: 1 | -1) => transitionToManual(renderScaleRef.current + direction * 0.15);
  const setPreset = (value: string) => {
    if (value === "fit-width") setFitMode("width");
    else if (value === "fit-page") setFitMode("page");
    else transitionToManual(Number(value) / 100);
  };
  const applyPageInput = () => {
    const requested = Number.parseInt(pageInput, 10);
    if (Number.isFinite(requested) && requested >= 1 && requested <= pageCount) setPage(requested);
    else setPageInput(String(page));
  };
  const rotate = () => setRotation(current => (current + 90) % 360);
  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage || typeof stage.requestFullscreen !== "function") {
      setFullscreenNotice("Fullscreen is not supported in this browser context. Open the document in a new tab instead.");
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch {
      setFullscreenNotice("Fullscreen is blocked in this embedded preview. Use “Open in a new tab” or publish the portal to use fullscreen.");
    }
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size === 2) {
      const [first, second] = Array.from(activePointers.current.values());
      pinchStart.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), scale: renderScaleRef.current };
    }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !activePointers.current.has(event.pointerId)) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size !== 2 || !pinchStart.current) return;
    const [first, second] = Array.from(activePointers.current.values());
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    if (pinchStart.current.distance <= 0) return;
    event.preventDefault();
    transitionToManual(pinchStart.current.scale * (distance / pinchStart.current.distance));
  };
  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) pinchStart.current = null;
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (["ArrowRight", "PageDown"].includes(event.key) && page < pageCount) {
        event.preventDefault();
        setPage(current => Math.min(pageCount, current + 1));
      } else if (["ArrowLeft", "PageUp"].includes(event.key) && page > 1) {
        event.preventDefault();
        setPage(current => Math.max(1, current - 1));
      } else if (["+", "="].includes(event.key)) {
        event.preventDefault();
        changeZoom(1);
      } else if (event.key === "-") {
        event.preventDefault();
        changeZoom(-1);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFitMode("width");
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        rotate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [page, pageCount]);

  const selectedZoom = fitMode === "width" ? "fit-width" : fitMode === "page" ? "fit-page" : ZOOM_PRESETS.includes(effectiveZoom as (typeof ZOOM_PRESETS)[number]) ? String(effectiveZoom) : "custom";

  return <section ref={stageRef} className="pdf-reader flex min-h-0 flex-1 flex-col overflow-hidden bg-[#eceae4]">
    <header className="shrink-0 border-b border-stone-300/80 bg-[#f8f7f3] px-3 py-3 sm:px-5 sm:py-4">
      <div className="reader-heading flex min-w-0 flex-col gap-3">
        <div className="min-w-0"><p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500"><FileText className="size-3.5" />Reading room</p><h1 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-stone-900 sm:text-2xl">{selectedDocument.name}</h1></div>
        <div className="flex flex-wrap items-center gap-1 sm:justify-end">
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => changeZoom(-1)} disabled={!pdf || loading} aria-label="Zoom out"><ZoomOut className="size-4" /></Button>
          <output aria-live="polite" className="min-w-12 text-center font-[family-name:var(--font-mono)] text-[11px] font-semibold text-stone-700">{effectiveZoom}%</output>
          <label className="sr-only" htmlFor="zoom-level">Zoom level</label><select id="zoom-level" value={selectedZoom} onChange={event => setPreset(event.target.value)} disabled={!pdf || loading} className="h-10 rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-700 outline-none transition focus:border-[#355d54] focus:ring-2 focus:ring-[#355d54]/25 disabled:opacity-40"><option value="fit-width">Fit width</option><option value="fit-page">Fit page</option>{ZOOM_PRESETS.map(preset => <option key={preset} value={preset}>{preset}%</option>)}{selectedZoom === "custom" && <option value="custom" disabled>{effectiveZoom}%</option>}</select>
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => changeZoom(1)} disabled={!pdf || loading} aria-label="Zoom in"><ZoomIn className="size-4" /></Button>
          <Button variant="ghost" size="icon" className={cn("size-10 rounded-xl text-stone-700 hover:bg-stone-200", fitMode === "width" && "bg-stone-200 text-stone-950")} onClick={() => setFitMode("width")} disabled={!pdf || loading} aria-label="Fit PDF to width" title="Fit to width"><ScanLine className="size-4" /></Button>
          <Button variant="ghost" className={cn("reader-fit-page-button h-10 rounded-xl px-3 text-xs text-stone-700 hover:bg-stone-200", fitMode === "page" && "bg-stone-200 text-stone-950")} onClick={() => setFitMode("page")} disabled={!pdf || loading} aria-label="Fit complete PDF page" title="Fit to page">Fit page</Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={rotate} disabled={!pdf || loading} aria-label="Rotate page clockwise" title="Rotate"><RotateCw className="size-4" /></Button>
          <span className="hidden h-6 w-px bg-stone-300 sm:block" />
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => window.open(access.viewerUrl, "_blank", "noopener,noreferrer")} aria-label="Open PDF in a new tab" title="Open in new tab"><ExternalLink className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-35" onClick={() => access.downloadUrl && window.open(access.downloadUrl, "_blank", "noopener,noreferrer")} disabled={!access.downloadUrl} aria-label="Download PDF" title={access.downloadUrl ? "Download PDF" : "Downloads are not permitted"}><Download className="size-4" /></Button>
          <Button variant="ghost" className="h-10 rounded-xl px-3 text-xs text-stone-700 hover:bg-stone-200" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit reader fullscreen" : "Enter reader fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? <><Minimize2 className="mr-1.5 size-4" />Exit</> : <Maximize2 className="size-4" />}</Button>
        </div>
      </div>
    </header>
    <div ref={viewportRef} className="pdf-viewport relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-5" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1 : -1); } }}>
      {loading && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#eceae4]/90 text-stone-600"><Loader2 className="size-7 animate-spin text-[#355d54]" /><p className="text-sm font-medium">Fetching secure document…</p></div>}
      {error ? <div className="mx-auto my-auto max-w-md rounded-[1.5rem] border border-amber-200 bg-amber-50 p-7 text-center shadow-sm"><div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="size-5" /></div><h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">Document cannot be opened</h2><p className="mt-2 text-sm leading-6 text-stone-600">{error}</p><Button variant="outline" className="mt-5 rounded-full border-stone-300 bg-white" onClick={() => setRetryVersion(version => version + 1)}>Retry document</Button></div> : <div className={cn("mx-auto flex w-fit max-w-full items-start justify-center bg-white shadow-[0_16px_45px_rgba(37,34,29,0.16)]", rendering && "opacity-80")}><canvas ref={canvasRef} className="block max-w-full touch-manipulation" aria-label={`Page ${page} of ${selectedDocument.name}`} />{rendering && !loading && <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-stone-200"><div className="h-full w-1/3 animate-pulse bg-[#355d54]" /></div>}</div>}
      {fullscreenNotice && <div role="status" className="absolute inset-x-4 bottom-4 z-20 mx-auto max-w-xl rounded-xl border border-stone-300 bg-white/95 px-4 py-3 text-center text-xs leading-5 text-stone-700 shadow-lg backdrop-blur"><span>{fullscreenNotice}</span><button className="ml-3 font-semibold text-[#355d54] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355d54]" onClick={() => setFullscreenNotice(null)}>Dismiss</button></div>}
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-stone-300/80 bg-[#f8f7f3] px-3 py-2.5 sm:gap-4 sm:px-5"><Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={!pdf || page <= 1} aria-label="Previous page"><ChevronLeft className="size-4" /></Button><label className="sr-only" htmlFor="page-number">Current page</label><Input id="page-number" inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={applyPageInput} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyPageInput(); } }} disabled={!pdf} className="h-10 w-14 border-stone-300 bg-white px-2 text-center font-[family-name:var(--font-mono)] text-xs shadow-none focus-visible:ring-[#355d54]" aria-label={`Current page, of ${pageCount || "unknown"}`} /><span className="font-[family-name:var(--font-mono)] text-[11px] text-stone-600">of {pageCount || "—"}</span><Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={!pdf || page >= pageCount} aria-label="Next page"><ChevronRight className="size-4" /></Button></footer>
  </section>;
}

function Navigator({ documents, selectedId, onSelect, search, onSearch, onRefresh, isRefreshing }: { documents: PortalDocument[]; selectedId: string | null; onSelect: (id: string) => void; search: string; onSearch: (value: string) => void; onRefresh: () => void; isRefreshing: boolean }) {
  const groups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matching = documents.filter(item => !query || [item.name, item.category, item.description].filter(Boolean).join(" ").toLocaleLowerCase().includes(query));
    return matching.reduce<Record<string, PortalDocument[]>>((result, item) => { (result[item.category] ??= []).push(item); return result; }, {});
  }, [documents, search]);
  return <aside className="pdf-navigator flex w-full shrink-0 flex-col overflow-hidden border-b border-stone-200 bg-[#fbfaf7] lg:w-[348px] lg:border-r lg:border-b-0">
    <div className="pdf-navigator-header border-b border-stone-200 px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5"><div className="mb-3 flex items-start justify-between gap-3 sm:mb-5"><div><p className="mb-1 font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.17em] text-[#52776f]">Google Drive folder</p><h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900 sm:text-2xl">Documents</h2></div><Button variant="outline" size="icon" className="size-10 rounded-full border-stone-300 bg-white text-stone-600 hover:bg-stone-100" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh document list"><RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} /></Button></div><div className="pdf-navigator-search relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search the archive" className="h-10 rounded-xl border-stone-200 bg-white pl-9 text-sm shadow-none placeholder:text-stone-400 focus-visible:ring-[#355d54]" /></div><label className="pdf-landscape-picker sr-only" htmlFor="compact-document-picker">Choose document</label><select id="compact-document-picker" value={selectedId ?? ""} onChange={event => onSelect(event.target.value)} className="pdf-landscape-picker mt-2 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none focus:border-[#355d54] focus:ring-2 focus:ring-[#355d54]/25">{documents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><p className="pdf-navigator-count mt-2 text-xs text-stone-500"><span className="font-semibold text-stone-700">{documents.length}</span> {documents.length === 1 ? "document" : "documents"} available</p></div>
    <div className="pdf-navigator-list min-h-0 max-h-[20dvh] overflow-y-auto px-3 py-2 sm:max-h-[23dvh] lg:max-h-none lg:flex-1 lg:py-3">
      {documents.length === 0 ? <div className="flex min-h-28 flex-col items-center justify-center px-5 text-center lg:min-h-[215px]"><FolderOpen className="mb-3 size-7 text-stone-300" /><h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-stone-800">No PDFs found</h3><p className="mt-1 text-xs leading-5 text-stone-500">Add PDFs to the configured folder, then refresh.</p></div> : Object.keys(groups).length === 0 ? <div className="flex min-h-28 flex-col items-center justify-center px-5 text-center lg:min-h-[215px]"><FileQuestion className="mb-3 size-7 text-stone-300" /><h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-stone-800">No matches</h3><p className="mt-1 text-xs leading-5 text-stone-500">Try another name or keyword.</p></div> : <div className="space-y-3 lg:space-y-5">{Object.entries(groups).sort(([first], [second]) => first.localeCompare(second)).map(([category, files]) => <div key={category}><p className="px-2 pb-1 font-[family-name:var(--font-mono)] text-[9px] font-medium uppercase tracking-[0.14em] text-stone-400 lg:pb-2 lg:text-[10px]">{category}</p><div className="space-y-1">{files.map(item => { const active = item.id === selectedId; return <button key={item.id} onClick={() => onSelect(item.id)} className={cn("group flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355d54]", active ? "bg-[#e2eee9] text-[#244b42] shadow-[inset_3px_0_0_#355d54]" : "text-stone-700 hover:bg-stone-100")}><span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-[#c9dfd7] text-[#355d54]" : "bg-stone-100 text-stone-500 group-hover:bg-stone-200")}><FileText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold leading-5">{item.name}</span><span className="mt-1 block truncate font-[family-name:var(--font-mono)] text-[10px] text-stone-500">{formatDate(item.modifiedTime)} · {formatBytes(item.size)}</span><span className="mt-1 block truncate font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wide text-stone-400">ID {item.id}</span></span></button>; })}</div></div>)}</div>}
    </div>
  </aside>;
}

export default function Home() {
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const documentsQuery = trpc.documents.list.useQuery(undefined, { refetchInterval: LIST_REFRESH_INTERVAL, refetchOnWindowFocus: true, retry: 1 });
  const refreshMutation = trpc.documents.refresh.useMutation({ onSuccess: result => utils.documents.list.setData(undefined, result) });
  const documents = documentsQuery.data?.documents ?? [];
  const selectedDocument = documents.find(item => item.id === selectedId) ?? null;
  const documentAccessQuery = trpc.documents.access.useQuery({ fileId: selectedId ?? "" }, { enabled: Boolean(selectedId), retry: 0, staleTime: 240_000 });
  const access = documentAccessQuery.data ?? null;

  useEffect(() => {
    if (!documentsQuery.data) return;
    setSelectedId(current => {
      if (current && documents.some(item => item.id === current)) return current;
      const savedId = window.localStorage.getItem(LAST_DOCUMENT_KEY);
      return (savedId ? documents.find(item => item.id === savedId) : undefined)?.id ?? documents[0]?.id ?? null;
    });
  }, [documents, documentsQuery.data]);

  useEffect(() => {
    if (!selectedDocument) {
      if (documentsQuery.data) window.localStorage.removeItem(LAST_DOCUMENT_KEY);
      return;
    }
    window.localStorage.setItem(LAST_DOCUMENT_KEY, selectedDocument.id);
  }, [documentsQuery.data, selectedDocument]);

  const listError = documentsQuery.error?.message || refreshMutation.error?.message;
  const isRefreshing = documentsQuery.isFetching || refreshMutation.isPending;
  const viewerArea = !selectedDocument ? <section className="flex min-h-0 flex-1 items-center justify-center bg-[#eceae4] p-7"><div className="max-w-md text-center"><div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-white text-[#355d54] shadow-sm"><BookOpen className="size-7" /></div><h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-stone-900">Your reading room awaits</h1><p className="mt-3 text-sm leading-6 text-stone-600">Select a PDF from the collection to view it here without leaving the portal.</p></div></section> : documentAccessQuery.isLoading ? <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[#eceae4] text-stone-600"><Loader2 className="size-7 animate-spin text-[#355d54]" /><p className="text-sm font-medium">Securing document access…</p></section> : documentAccessQuery.error || !access ? <section className="flex min-h-0 flex-1 items-center justify-center bg-[#eceae4] p-7"><div className="max-w-md rounded-[1.5rem] border border-amber-200 bg-amber-50 p-7 text-center shadow-sm"><div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="size-5" /></div><h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">Document unavailable</h2><p className="mt-2 text-sm leading-6 text-stone-600">{documentAccessQuery.error?.message || "The portal could not verify access to this document."}</p><Button variant="outline" className="mt-5 rounded-full border-stone-300 bg-white" onClick={() => void documentAccessQuery.refetch()}>Try again</Button></div></section> : <ViewerCanvas key={selectedDocument.id} selectedDocument={selectedDocument} access={access} />;

  return <main className="h-[100dvh] min-h-[100svh] overflow-hidden bg-[#f3f1ec] p-0 text-stone-900 lg:p-4"><div className="mx-auto flex h-full max-w-[1520px] flex-col overflow-hidden bg-[#fbfaf7] shadow-[0_18px_70px_rgba(45,41,34,0.13)] lg:rounded-[1.75rem]"><header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-[#fbfaf7] px-4 py-3 sm:px-7 sm:py-4"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-[#355d54] text-[#f8f7f3] shadow-sm"><BookOpen className="size-[18px]" /></div><div><p className="font-[family-name:var(--font-display)] text-lg font-bold leading-none tracking-tight text-stone-900">Folio</p><p className="mt-1 font-[family-name:var(--font-mono)] text-[9px] font-medium uppercase tracking-[0.16em] text-stone-500">Document portal</p></div></div><div className="hidden items-center gap-2 text-xs text-stone-500 sm:flex"><span className="size-2 rounded-full bg-[#6c9b75]" />Auto-refreshes every minute</div></header>{documentsQuery.isLoading ? <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-[#f8f7f3] text-stone-600"><Loader2 className="size-7 animate-spin text-[#355d54]" /><p className="text-sm font-medium">Loading your document collection…</p></div> : listError ? <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f8f7f3] p-6"><div className="max-w-lg rounded-[1.75rem] border border-amber-200 bg-amber-50 p-8 text-center shadow-sm"><div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="size-5" /></div><h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-stone-900">The collection is unavailable</h1><p className="mt-3 text-sm leading-6 text-stone-600">{listError}</p><Button className="mt-6 rounded-full bg-[#355d54] px-5 text-white hover:bg-[#244b42]" onClick={() => void documentsQuery.refetch()}><RefreshCw className="mr-2 size-4" />Retry connection</Button></div></div> : <div className="flex min-h-0 flex-1 flex-col lg:flex-row"><Navigator documents={documents} selectedId={selectedId} onSelect={setSelectedId} search={search} onSearch={setSearch} onRefresh={() => refreshMutation.mutate()} isRefreshing={isRefreshing} />{viewerArea}</div>}</div></main>;
}
