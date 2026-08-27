import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { clampZoom, getRenderScale, type FitMode, ZOOM_PRESETS } from "@/lib/pdfViewerMath";
import { findPdfTextMatches, getPdfSearchResultCount, normalizePdfText, type PageTextIndex } from "@/lib/pdfTextSearch";
import { loadReadingState, saveReadingState, type SavedReadingState } from "@/lib/readingState";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { AlertTriangle, Bookmark, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Image, ListTree, Loader2, Maximize2, Minimize2, PanelLeft, RefreshCw, RotateCw, ScanLine, ScrollText, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type PortalDocument = { id: string; name: string; canDownload: boolean };
type DocumentAccess = { viewerUrl: string; downloadUrl: string | null };
type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
type PageSize = { width: number; height: number };
type OutlineItem = { title: string; page: number | null; depth: number };

function getInitialFitMode(): FitMode {
  return typeof window !== "undefined" && window.innerWidth < 768 ? "width" : "page";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function ContinuousPage({ pdf, pageNumber, scale, rotation, scrollRoot, onError }: { pdf: PdfDocument; pageNumber: number; scale: number; rotation: number; scrollRoot: HTMLElement | null; onError: (message: string) => void }) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);

  useEffect(() => {
    const target = pageRef.current;
    if (!target) return;
    if (!scrollRoot || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), { root: scrollRoot, rootMargin: "1400px 0px", threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!nearViewport || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    const render = async () => {
      try {
        const loadedPage = await pdf.getPage(pageNumber);
        const viewport = loadedPage.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !context || cancelled) return;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        renderTask = loadedPage.render({ canvas, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0], background: "#ffffff" });
        await renderTask.promise;
      } catch (reason) {
        if (!cancelled && !(reason instanceof Error && reason.name === "RenderingCancelledException")) onError(`Page ${pageNumber} could not be rendered. ${reason instanceof Error ? reason.message : ""}`.trim());
      }
    };
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [nearViewport, onError, pageNumber, pdf, rotation, scale]);

  return <div ref={pageRef} className="relative mx-auto flex w-fit max-w-full justify-center overflow-hidden bg-white shadow-[0_12px_32px_rgba(37,34,29,0.15)]"><canvas ref={canvasRef} className="block max-w-full" aria-label={`Page ${pageNumber}`} /></div>;
}

function Thumbnail({ pdf, pageNumber, active, rotation, root, onSelect }: { pdf: PdfDocument; pageNumber: number; active: boolean; rotation: number; root: HTMLElement | null; onSelect: () => void }) {
  const frameRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 6);

  useEffect(() => {
    const target = frameRef.current;
    if (!target) return;
    if (!root || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), { root, rootMargin: "600px 0px", threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!nearViewport || !canvasRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    const render = async () => {
      try {
        const loadedPage = await pdf.getPage(pageNumber);
        const unscaled = loadedPage.getViewport({ scale: 1, rotation });
        const scale = Math.min(0.22, 120 / Math.max(unscaled.width, unscaled.height));
        const viewport = loadedPage.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !context || cancelled) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        task = loadedPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0], background: "#ffffff" });
        await task.promise;
      } catch {
        // A page-level thumbnail failure should never block reading the document.
      }
    };
    void render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [nearViewport, pageNumber, pdf, rotation]);

  return <button ref={frameRef} onClick={onSelect} className={cn("group flex w-full items-center gap-3 rounded-xl p-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355d54]", active ? "bg-[#e2eee9]" : "hover:bg-stone-100")} aria-label={`Go to page ${pageNumber}`}><span className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-stone-200 bg-white shadow-sm"><canvas ref={canvasRef} className="max-h-full max-w-full" /></span><span className={cn("font-[family-name:var(--font-mono)] text-xs font-semibold", active ? "text-[#244b42]" : "text-stone-600")}>Page {pageNumber}</span></button>;
}

async function flattenOutline(pdf: PdfDocument, outline: unknown, depth = 0): Promise<OutlineItem[]> {
  if (!Array.isArray(outline)) return [];
  const results: OutlineItem[] = [];
  for (const item of outline as Array<{ title?: string; dest?: unknown; items?: unknown }>) {
    let page: number | null = null;
    try {
      const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      const destinationRef = Array.isArray(destination) ? destination[0] : null;
      if (typeof destinationRef === "number") page = destinationRef + 1;
      else if (destinationRef) page = (await pdf.getPageIndex(destinationRef as never)) + 1;
    } catch {
      page = null;
    }
    results.push({ title: item.title || "Untitled bookmark", page, depth });
    results.push(...await flattenOutline(pdf, item.items, depth + 1));
  }
  return results;
}

export default function ContinuousPdfReader({ selectedDocument, access }: { selectedDocument: PortalDocument; access: DocumentAccess }) {
  const stageRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const restoreRef = useRef<SavedReadingState | null>(null);
  const pageOffsetRef = useRef(0);
  const scrollAnimation = useRef<number | null>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [basePageSize, setBasePageSize] = useState<PageSize | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [readerMode, setReaderMode] = useState<"continuous" | "single">("continuous");
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>(getInitialFitMode);
  const [manualZoom, setManualZoom] = useState(1);
  const [readerSize, setReaderSize] = useState<PageSize>({ width: 0, height: 0 });
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [thumbnailRoot, setThumbnailRoot] = useState<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorTab, setNavigatorTab] = useState<"thumbnails" | "bookmarks">("thumbnails");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [textIndex, setTextIndex] = useState<PageTextIndex>({});
  const [indexedPages, setIndexedPages] = useState(0);
  const [isIndexingText, setIsIndexingText] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchResult, setActiveSearchResult] = useState(0);

  const pageCount = pdf?.numPages ?? 0;
  const rotatedBaseSize = useMemo(() => !basePageSize ? null : rotation % 180 === 0 ? basePageSize : { width: basePageSize.height, height: basePageSize.width }, [basePageSize, rotation]);
  const renderScale = useMemo(() => !rotatedBaseSize || !readerSize.width || !readerSize.height ? 1 : getRenderScale(fitMode, manualZoom, rotatedBaseSize, readerSize, 24), [fitMode, manualZoom, readerSize, rotatedBaseSize]);
  const effectiveZoom = Math.round(renderScale * 100);
  const selectedZoom = fitMode === "width" ? "fit-width" : fitMode === "page" ? "fit-page" : ZOOM_PRESETS.includes(effectiveZoom as (typeof ZOOM_PRESETS)[number]) ? String(effectiveZoom) : "custom";
  const searchMatches = useMemo(() => findPdfTextMatches(textIndex, searchQuery), [searchQuery, textIndex]);
  const searchResultCount = useMemo(() => getPdfSearchResultCount(searchMatches), [searchMatches]);

  const persistReadingState = useCallback((pageNumber: number, pageOffset: number) => {
    if (!pageCount) return;
    saveReadingState(selectedDocument.id, { mode: readerMode, page: Math.max(1, Math.min(pageCount, pageNumber)), pageOffset: Math.max(0, Math.min(1, pageOffset)), manualZoom, fitMode, rotation });
  }, [fitMode, manualZoom, pageCount, readerMode, rotation, selectedDocument.id]);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url: access.viewerUrl, withCredentials: false });
    const defaultFit = getInitialFitMode();
    pageRefs.current.clear();
    setPdf(null); setBasePageSize(null); setPage(1); setPageInput("1"); setReaderMode("continuous"); setRotation(0); setFitMode(defaultFit); setManualZoom(1); setOutline([]); setTextIndex({}); setIndexedPages(0); setIsIndexingText(false); setSearchQuery(""); setActiveSearchResult(0); setLoading(true); setError(null);
    task.promise.then(async loaded => {
      if (cancelled) return;
      const saved = loadReadingState(selectedDocument.id, loaded.numPages);
      restoreRef.current = saved;
      setPage(saved?.page ?? 1);
      setPageInput(String(saved?.page ?? 1));
      setReaderMode(saved?.mode ?? "continuous");
      setRotation(saved?.rotation ?? 0);
      setFitMode(saved?.fitMode ?? defaultFit);
      setManualZoom(saved?.manualZoom ?? 1);
      const firstPage = await loaded.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      if (cancelled) return;
      setBasePageSize({ width: viewport.width, height: viewport.height });
      setPdf(loaded);
      void loaded.getOutline().then(items => flattenOutline(loaded, items).then(mapped => { if (!cancelled) setOutline(mapped); })).catch(() => { if (!cancelled) setOutline([]); });
      void (async () => {
        const indexedText: PageTextIndex = {};
        if (!cancelled) setIsIndexingText(true);
        for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber += 1) {
          try {
            const indexedPage = await loaded.getPage(pageNumber);
            const content = await indexedPage.getTextContent();
            indexedText[pageNumber] = normalizePdfText(content.items.map(item => "str" in item ? item.str : "").join(" "));
          } catch {
            indexedText[pageNumber] = "";
          }
          if (cancelled) return;
          if (pageNumber % 8 === 0 || pageNumber === loaded.numPages) {
            setTextIndex({ ...indexedText });
            setIndexedPages(pageNumber);
            await new Promise<void>(resolve => window.setTimeout(resolve, 0));
          }
        }
        if (!cancelled) setIsIndexingText(false);
      })();
    }).catch(reason => {
      if (!cancelled) setError(`Unable to display this document. ${reason instanceof Error ? reason.message : "The PDF could not be opened."}`);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; task.destroy(); };
  }, [access.viewerUrl, retryVersion, selectedDocument.id]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const update = () => setReaderSize(current => {
      const next = { width: Math.round(root.clientWidth), height: Math.round(root.clientHeight) };
      return current.width === next.width && current.height === next.height ? current : next;
    });
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener("orientationchange", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("orientationchange", update); };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const scrollToPage = useCallback((pageNumber: number, behavior: ScrollBehavior = "smooth", pageOffset = 0) => {
    const root = scrollRef.current;
    if (readerMode === "single") {
      root?.scrollTo({ top: 0, behavior });
      pageOffsetRef.current = 0;
      setPage(pageNumber);
      setPageInput(String(pageNumber));
      return;
    }
    const target = pageRefs.current.get(pageNumber);
    if (!root || !target) return;
    const safeOffset = Math.max(0, Math.min(1, pageOffset));
    const offset = target.offsetTop + target.clientHeight * safeOffset - 12;
    root.scrollTo({ top: Math.max(0, offset), behavior });
    pageOffsetRef.current = safeOffset;
    setPage(pageNumber);
    setPageInput(String(pageNumber));
  }, [readerMode]);

  const moveSearchResult = useCallback((direction: 1 | -1) => {
    if (!searchMatches.length) return;
    const next = (activeSearchResult + direction + searchMatches.length) % searchMatches.length;
    setActiveSearchResult(next);
    scrollToPage(searchMatches[next].page);
  }, [activeSearchResult, scrollToPage, searchMatches]);

  useEffect(() => {
    const saved = restoreRef.current;
    if (!saved || !pdf || !basePageSize || !scrollRoot) return;
    const frame = window.requestAnimationFrame(() => {
      scrollToPage(saved.page, "auto", saved.pageOffset);
      restoreRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [basePageSize, pdf, renderScale, rotation, scrollRoot, scrollToPage]);

  useEffect(() => {
    if (restoreRef.current) return;
    if (!pdf || !pageRefs.current.get(page)) return;
    const frame = window.requestAnimationFrame(() => scrollToPage(page, "auto", pageOffsetRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [pdf, readerMode, renderScale, rotation, scrollToPage]);

  const handleScroll = () => {
    if (readerMode !== "continuous" || scrollAnimation.current) return;
    scrollAnimation.current = window.requestAnimationFrame(() => {
      const root = scrollRef.current;
      if (!root || !pageCount) return;
      const scanLine = root.scrollTop + 24;
      let activePage = 1;
      for (let index = 1; index <= pageCount; index += 1) {
        const item = pageRefs.current.get(index);
        if (item && item.offsetTop <= scanLine) activePage = index;
        else break;
      }
      const currentPage = pageRefs.current.get(activePage);
      const offset = currentPage?.clientHeight ? (root.scrollTop - currentPage.offsetTop) / currentPage.clientHeight : 0;
      pageOffsetRef.current = Math.max(0, Math.min(1, offset));
      setPage(current => current === activePage ? current : activePage);
      setPageInput(String(activePage));
      persistReadingState(activePage, pageOffsetRef.current);
      scrollAnimation.current = null;
    });
  };

  useEffect(() => {
    if (!pdf) return;
    const root = scrollRef.current;
    const currentPage = pageRefs.current.get(page);
    const offset = root && currentPage?.clientHeight ? (root.scrollTop - currentPage.offsetTop) / currentPage.clientHeight : pageOffsetRef.current;
    pageOffsetRef.current = Math.max(0, Math.min(1, offset));
    persistReadingState(page, pageOffsetRef.current);
  }, [fitMode, manualZoom, page, pdf, persistReadingState, readerMode, rotation]);

  useEffect(() => {
    setActiveSearchResult(current => Math.min(current, Math.max(0, searchMatches.length - 1)));
  }, [searchMatches.length, searchQuery]);

  useEffect(() => {
    if (!searchOpen) return;
    const focusFrame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [searchOpen]);

  useEffect(() => () => { if (scrollAnimation.current) window.cancelAnimationFrame(scrollAnimation.current); }, []);

  const transitionToManual = (scale: number) => { setFitMode("manual"); setManualZoom(clampZoom(scale)); };
  const changeZoom = (direction: 1 | -1) => transitionToManual(renderScale + direction * 0.15);
  const setPreset = (value: string) => {
    if (value === "fit-width") setFitMode("width");
    else if (value === "fit-page") setFitMode("page");
    else transitionToManual(Number(value) / 100);
  };
  const applyPageInput = () => {
    const requested = Number.parseInt(pageInput, 10);
    if (Number.isFinite(requested) && requested >= 1 && requested <= pageCount) scrollToPage(requested);
    else setPageInput(String(page));
  };
  const rotate = () => { setRotation(value => (value + 90) % 360); };
  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage || typeof stage.requestFullscreen !== "function") { setFullscreenNotice("Fullscreen is not supported in this browser context. Open the document in a new tab instead."); return; }
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen(); }
    catch { setFullscreenNotice("Fullscreen is blocked in this embedded preview. Use “Open in a new tab” or publish the portal to use fullscreen."); }
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size === 2) {
      const [first, second] = Array.from(activePointers.current.values());
      pinchStart.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), scale: renderScale };
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
    transitionToManual(pinchStart.current.scale * distance / pinchStart.current.distance);
  };
  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => { activePointers.current.delete(event.pointerId); if (activePointers.current.size < 2) pinchStart.current = null; };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && searchOpen) { event.preventDefault(); searchInputRef.current?.blur(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); setSearchOpen(true); window.requestAnimationFrame(() => searchInputRef.current?.focus()); return; }
      if (isEditableTarget(event.target)) return;
      else if (["ArrowRight", "PageDown"].includes(event.key)) { event.preventDefault(); scrollToPage(Math.min(pageCount, page + 1)); }
      else if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); scrollToPage(Math.max(1, page - 1)); }
      else if (["+", "="].includes(event.key)) { event.preventDefault(); changeZoom(1); }
      else if (event.key === "-") { event.preventDefault(); changeZoom(-1); }
      else if (event.key.toLowerCase() === "f") { event.preventDefault(); setFitMode("width"); }
      else if (event.key.toLowerCase() === "r") { event.preventDefault(); rotate(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [page, pageCount, scrollToPage, searchOpen]);

  return <section ref={stageRef} className="pdf-reader flex min-h-0 flex-1 flex-col overflow-hidden bg-[#eceae4]">
    <header className="continuous-reader-header shrink-0 border-b border-stone-300/80 bg-[#f8f7f3] px-3 py-3 sm:px-5 sm:py-4">
      <div className="continuous-reader-heading flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="min-w-0"><p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{readerMode === "continuous" ? <ScrollText className="size-3.5" /> : <FileText className="size-3.5" />}{readerMode === "continuous" ? "Continuous reading" : "Single-page reading"}</p><h1 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-stone-900 sm:text-2xl">{selectedDocument.name}</h1></div>
        <div className="continuous-reader-controls flex flex-nowrap items-center gap-1 overflow-x-auto 2xl:justify-end">
          <div role="group" aria-label="Reading mode" className="flex h-10 items-center rounded-xl border border-stone-300 bg-white p-0.5"><button type="button" onClick={() => setReaderMode("continuous")} className={cn("flex h-full items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355d54]", readerMode === "continuous" ? "bg-[#e2eee9] text-[#244b42]" : "text-stone-500 hover:text-stone-800")} aria-pressed={readerMode === "continuous"} title="Continuous multi-page reading"><ScrollText className="size-3.5" /><span>Scroll</span></button><button type="button" onClick={() => setReaderMode("single")} className={cn("flex h-full items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355d54]", readerMode === "single" ? "bg-[#e2eee9] text-[#244b42]" : "text-stone-500 hover:text-stone-800")} aria-pressed={readerMode === "single"} title="Focused single-page reading"><FileText className="size-3.5" /><span>Page</span></button></div>
          <Button variant="ghost" size="icon" className={cn("size-10 rounded-xl text-stone-700 hover:bg-stone-200", navigatorOpen && "bg-stone-200 text-stone-950")} onClick={() => setNavigatorOpen(value => !value)} aria-label={navigatorOpen ? "Close page navigator" : "Open page navigator"} title="Thumbnails and bookmarks"><PanelLeft className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => changeZoom(-1)} disabled={!pdf || loading} aria-label="Zoom out"><ZoomOut className="size-4" /></Button>
          <output aria-live="polite" className="min-w-12 text-center font-[family-name:var(--font-mono)] text-[11px] font-semibold text-stone-700">{effectiveZoom}%</output>
          <label className="sr-only" htmlFor="continuous-zoom-level">Zoom level</label><select id="continuous-zoom-level" value={selectedZoom} onChange={event => setPreset(event.target.value)} disabled={!pdf || loading} className="h-10 rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-700 outline-none transition focus:border-[#355d54] focus:ring-2 focus:ring-[#355d54]/25 disabled:opacity-40"><option value="fit-width">Fit width</option><option value="fit-page">Fit page</option>{ZOOM_PRESETS.map(preset => <option key={preset} value={preset}>{preset}%</option>)}{selectedZoom === "custom" && <option value="custom" disabled>{effectiveZoom}%</option>}</select>
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => changeZoom(1)} disabled={!pdf || loading} aria-label="Zoom in"><ZoomIn className="size-4" /></Button>
          <Button variant="ghost" size="icon" className={cn("size-10 rounded-xl text-stone-700 hover:bg-stone-200", fitMode === "width" && "bg-stone-200 text-stone-950")} onClick={() => setFitMode("width")} disabled={!pdf || loading} aria-label="Fit PDF to width" title="Fit to width"><ScanLine className="size-4" /></Button>
          <Button variant="ghost" className={cn("h-10 rounded-xl px-3 text-xs text-stone-700 hover:bg-stone-200", fitMode === "page" && "bg-stone-200 text-stone-950")} onClick={() => setFitMode("page")} disabled={!pdf || loading} aria-label="Fit complete PDF page">Fit page</Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={rotate} disabled={!pdf || loading} aria-label="Rotate page clockwise" title="Rotate"><RotateCw className="size-4" /></Button>
          <span className="hidden h-6 w-px bg-stone-300 sm:block" />
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => window.open(access.viewerUrl, "_blank", "noopener,noreferrer")} aria-label="Open PDF in a new tab" title="Open in new tab"><ExternalLink className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-35" onClick={() => access.downloadUrl && window.open(access.downloadUrl, "_blank", "noopener,noreferrer")} disabled={!access.downloadUrl} aria-label="Download PDF" title={access.downloadUrl ? "Download PDF" : "Downloads are not permitted"}><Download className="size-4" /></Button>
          <form aria-label="Search document text" className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-stone-300 bg-white px-1.5" onSubmit={event => { event.preventDefault(); moveSearchResult(1); }}><label className="sr-only" htmlFor="pdf-text-search">Search document text</label><div className="relative w-32 sm:w-36 xl:w-44"><Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-stone-400" /><Input ref={searchInputRef} id="pdf-text-search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search text" className="h-8 w-full border-0 bg-transparent py-1 pl-7 pr-6 text-xs shadow-none focus-visible:ring-0" /><button type="button" onClick={() => setSearchQuery("")} className={cn("absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355d54]", !searchQuery && "invisible")} aria-label="Clear document search"><X className="size-3.5" /></button></div><output aria-live="polite" aria-label={isIndexingText ? `Indexing ${indexedPages} of ${pageCount} pages` : searchQuery ? searchMatches.length ? `${searchResultCount} occurrences on ${searchMatches.length} matching pages` : "No text matches found" : "Type to search document text"} title={isIndexingText ? `Indexing ${indexedPages}/${pageCount}` : searchQuery ? searchMatches.length ? `${searchResultCount} occurrences on ${searchMatches.length} pages` : "No text matches found" : "Type to search"} className="min-w-12 text-center font-[family-name:var(--font-mono)] text-[10px] font-semibold text-stone-600">{isIndexingText ? `${indexedPages}/${pageCount}` : searchQuery ? searchMatches.length ? `${searchResultCount} matches · ${searchMatches.length} pg` : "No results" : "Find"}</output><Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg text-stone-700 hover:bg-stone-100" onClick={() => moveSearchResult(-1)} disabled={!searchMatches.length} aria-label="Previous matching page"><ChevronLeft className="size-3.5" /></Button><Button type="submit" variant="ghost" size="icon" className="size-8 rounded-lg text-stone-700 hover:bg-stone-100" disabled={!searchMatches.length} aria-label="Next matching page"><ChevronRight className="size-3.5" /></Button></form>
          <Button variant="ghost" className="h-10 rounded-xl px-3 text-xs text-stone-700 hover:bg-stone-200" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit reader fullscreen" : "Enter reader fullscreen"}>{isFullscreen ? <><Minimize2 className="mr-1.5 size-4" />Exit</> : <Maximize2 className="size-4" />}</Button>
        </div>
      </div>
    </header>
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {navigatorOpen && <aside className="absolute inset-y-0 left-0 z-30 flex w-[min(18rem,86vw)] shrink-0 flex-col border-r border-stone-300 bg-[#fbfaf7] shadow-xl lg:static lg:w-72 lg:shadow-none"><div className="flex items-center justify-between border-b border-stone-200 px-3 py-3"><div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1"><button onClick={() => setNavigatorTab("thumbnails")} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold", navigatorTab === "thumbnails" ? "bg-white text-[#244b42] shadow-sm" : "text-stone-500 hover:text-stone-700")}><Image className="size-3.5" />Pages</button><button onClick={() => setNavigatorTab("bookmarks")} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold", navigatorTab === "bookmarks" ? "bg-white text-[#244b42] shadow-sm" : "text-stone-500 hover:text-stone-700")}><Bookmark className="size-3.5" />Bookmarks</button></div><Button variant="ghost" size="icon" className="size-8 rounded-lg text-stone-600 hover:bg-stone-200" onClick={() => setNavigatorOpen(false)} aria-label="Close page navigator"><X className="size-4" /></Button></div><div ref={setThumbnailRoot} className="min-h-0 flex-1 overflow-y-auto p-2">{navigatorTab === "thumbnails" ? !pdf ? <div className="flex h-full items-center justify-center text-xs text-stone-500">Loading pages…</div> : <div className="space-y-1">{Array.from({ length: pageCount }, (_, index) => <Thumbnail key={index + 1} pdf={pdf} pageNumber={index + 1} active={page === index + 1} rotation={rotation} root={thumbnailRoot} onSelect={() => { scrollToPage(index + 1); if (window.innerWidth < 1024) setNavigatorOpen(false); }} />)}</div> : outline.length ? <nav aria-label="Document bookmarks" className="space-y-1">{outline.map((item, index) => <button key={`${item.title}-${index}`} onClick={() => item.page && scrollToPage(item.page)} disabled={!item.page} style={{ paddingLeft: `${0.65 + item.depth * 0.75}rem` }} className="flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"><ListTree className="size-3.5 shrink-0 text-[#52776f]" /><span className="min-w-0 flex-1 truncate">{item.title}</span>{item.page && <span className="font-[family-name:var(--font-mono)] text-[10px] text-stone-400">{item.page}</span>}</button>)}</nav> : <div className="flex h-full flex-col items-center justify-center px-5 text-center"><Bookmark className="mb-3 size-7 text-stone-300" /><p className="text-sm font-semibold text-stone-700">No embedded bookmarks</p><p className="mt-1 text-xs leading-5 text-stone-500">This PDF does not include an outline.</p></div>}</div></aside>}
      <div ref={node => { scrollRef.current = node; setScrollRoot(node); }} className="pdf-viewport relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-5" onScroll={handleScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1 : -1); } }}>
        {loading && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#eceae4]/90 text-stone-600"><Loader2 className="size-7 animate-spin text-[#355d54]" /><p className="text-sm font-medium">Preparing continuous document view…</p></div>}
        {error ? <div className="mx-auto my-auto flex min-h-full max-w-md items-center justify-center"><div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-7 text-center shadow-sm"><div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="size-5" /></div><h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">Document cannot be opened</h2><p className="mt-2 text-sm leading-6 text-stone-600">{error}</p><Button variant="outline" className="mt-5 rounded-full border-stone-300 bg-white" onClick={() => setRetryVersion(version => version + 1)}><RefreshCw className="mr-2 size-4" />Retry document</Button></div></div> : pdf && basePageSize ? readerMode === "continuous" ? <div className="mx-auto flex min-w-0 flex-col gap-5 pb-5">{Array.from({ length: pageCount }, (_, index) => <div key={index + 1} ref={node => { if (node) pageRefs.current.set(index + 1, node); else pageRefs.current.delete(index + 1); }} className="relative flex justify-center" style={{ minHeight: Math.max(120, rotatedBaseSize!.height * renderScale) }}><ContinuousPage pdf={pdf} pageNumber={index + 1} scale={renderScale} rotation={rotation} scrollRoot={scrollRoot} onError={setError} /><span className="absolute -left-1 top-2 rounded-r bg-stone-900/75 px-2 py-1 font-[family-name:var(--font-mono)] text-[10px] text-white opacity-0 transition group-hover:opacity-100">{index + 1}</span></div>)}</div> : <div key={`single-${page}`} ref={node => { if (node) pageRefs.current.set(page, node); }} className="mx-auto flex min-h-full min-w-0 items-start justify-center py-1" style={{ minHeight: Math.max(120, rotatedBaseSize!.height * renderScale) }}><ContinuousPage pdf={pdf} pageNumber={page} scale={renderScale} rotation={rotation} scrollRoot={scrollRoot} onError={setError} /></div> : null}
        {fullscreenNotice && <div role="status" className="sticky bottom-3 z-30 mx-auto max-w-xl rounded-xl border border-stone-300 bg-white/95 px-4 py-3 text-center text-xs leading-5 text-stone-700 shadow-lg backdrop-blur"><span>{fullscreenNotice}</span><button className="ml-3 font-semibold text-[#355d54] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#355d54]" onClick={() => setFullscreenNotice(null)}>Dismiss</button></div>}
      </div>
    </div>
    <footer className="continuous-reader-footer flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-stone-300/80 bg-[#f8f7f3] px-3 py-2.5 sm:gap-4 sm:px-5"><Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => scrollToPage(Math.max(1, page - 1))} disabled={!pdf || page <= 1} aria-label="Previous page"><ChevronLeft className="size-4" /></Button><label className="sr-only" htmlFor="continuous-page-number">Current page</label><Input id="continuous-page-number" inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={applyPageInput} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyPageInput(); } }} disabled={!pdf} className="h-10 w-14 border-stone-300 bg-white px-2 text-center font-[family-name:var(--font-mono)] text-xs shadow-none focus-visible:ring-[#355d54]" aria-label={`Current page, of ${pageCount || "unknown"}`} /><span className="font-[family-name:var(--font-mono)] text-[11px] text-stone-600">of {pageCount || "—"}</span><Button variant="ghost" size="icon" className="size-10 rounded-xl text-stone-700 hover:bg-stone-200" onClick={() => scrollToPage(Math.min(pageCount, page + 1))} disabled={!pdf || page >= pageCount} aria-label="Next page"><ChevronRight className="size-4" /></Button></footer>
  </section>;
}
