import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { AlertTriangle, BookOpen, ChevronLeft, ChevronRight, Download, ExternalLink, FileQuestion, FileText, FolderOpen, Loader2, Maximize2, Minimize2, RefreshCw, Search, ScanLine, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type PortalDocument = { id: string; name: string; mimeType: "application/pdf"; modifiedTime: string | null; size: number | null; description: string | null; category: string; canDownload: boolean; driveUrl: string | null };
type DocumentAccess = { document: PortalDocument; viewerUrl: string; downloadUrl: string | null };
type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

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

function ViewerCanvas({ selectedDocument, access }: { selectedDocument: PortalDocument; access: DocumentAccess }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url: access.viewerUrl, withCredentials: false });
    setPdf(null); setPage(1); setZoom(1); setFitWidth(true); setLoading(true); setError(null);
    task.promise.then(loaded => { if (!cancelled) setPdf(loaded); }).catch(reason => {
      if (!cancelled) setError(`Unable to display this document. ${reason instanceof Error ? reason.message : "The PDF could not be opened."}`);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; task.destroy(); };
  }, [access.viewerUrl, retryVersion, selectedDocument.id]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(globalThis.document.fullscreenElement));
    globalThis.document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => globalThis.document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !viewportRef.current || error) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    const renderPage = async () => {
      setRendering(true);
      try {
        const pdfPage = await pdf.getPage(page);
        const nativeViewport = pdfPage.getViewport({ scale: 1 });
        const containerWidth = Math.max((viewportRef.current?.clientWidth ?? 640) - 48, 280);
        const scale = fitWidth ? containerWidth / nativeViewport.width : zoom;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context || cancelled) return;
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = pdfPage.render({ canvas, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] });
        await renderTask.promise;
      } catch (reason) {
        if (!cancelled && !(reason instanceof Error && reason.name === "RenderingCancelledException")) setError(`Unable to render this document. ${reason instanceof Error ? reason.message : "The current page could not be rendered."}`);
      } finally { if (!cancelled) setRendering(false); }
    };
    void renderPage();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [error, fitWidth, page, pdf, zoom]);

  useEffect(() => {
    if (!fitWidth || !viewportRef.current) return;
    const observer = new ResizeObserver(() => setZoom(current => current));
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [fitWidth]);

  const pageCount = pdf?.numPages ?? 0;
  const changeZoom = (direction: 1 | -1) => { setFitWidth(false); setZoom(current => Math.min(2.5, Math.max(0.5, Number((current + direction * 0.15).toFixed(2))))); };
  const toggleFullscreen = async () => {
    try { if (globalThis.document.fullscreenElement) await globalThis.document.exitFullscreen(); else await stageRef.current?.requestFullscreen(); }
    catch { setFullscreenNotice("Fullscreen is blocked in this embedded preview. Use “Open in a new tab” or publish the portal to use fullscreen."); }
  };

  return <section ref={stageRef} className="flex min-h-0 flex-1 flex-col bg-[#eceae4]">
    <div className="flex flex-col gap-4 border-b border-stone-300/80 bg-[#f8f7f3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500"><FileText className="size-3.5" />Reading room</p><h1 className="truncate font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900 sm:text-2xl">{selectedDocument.name}</h1></div>
      <div className="flex items-center gap-1 self-end sm:self-auto">
        <Button variant="ghost" size="icon" className="size-9 rounded-full text-stone-600 hover:bg-stone-200" onClick={() => changeZoom(-1)} disabled={!pdf || loading} aria-label="Zoom out"><ZoomOut className="size-4" /></Button>
        <span className="min-w-14 text-center font-[family-name:var(--font-mono)] text-[11px] text-stone-600">{fitWidth ? "FIT" : `${Math.round(zoom * 100)}%`}</span>
        <Button variant="ghost" size="icon" className="size-9 rounded-full text-stone-600 hover:bg-stone-200" onClick={() => changeZoom(1)} disabled={!pdf || loading} aria-label="Zoom in"><ZoomIn className="size-4" /></Button>
        <Button variant="ghost" size="icon" className={cn("size-9 rounded-full text-stone-600 hover:bg-stone-200", fitWidth && "bg-stone-200 text-stone-900")} onClick={() => setFitWidth(true)} disabled={!pdf || loading} aria-label="Fit page to width"><ScanLine className="size-4" /></Button>
        <span className="mx-1 h-5 w-px bg-stone-300" />
        <Button variant="ghost" size="icon" className="size-9 rounded-full text-stone-600 hover:bg-stone-200" onClick={() => window.open(access.viewerUrl, "_blank", "noopener,noreferrer")} aria-label="Open PDF in a new tab"><ExternalLink className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-9 rounded-full text-stone-600 hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-35" onClick={() => access.downloadUrl && window.open(access.downloadUrl, "_blank", "noopener,noreferrer")} disabled={!access.downloadUrl} title={access.downloadUrl ? "Download PDF" : "Downloads are not permitted"} aria-label="Download PDF"><Download className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-9 rounded-full text-stone-600 hover:bg-stone-200" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
      </div>
    </div>
    <div ref={viewportRef} className="relative flex min-h-[470px] flex-1 items-start justify-center overflow-auto p-5 sm:p-8">
      {loading && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#eceae4]/90 text-stone-600"><Loader2 className="size-7 animate-spin text-[#355d54]" /><p className="text-sm font-medium">Fetching secure document…</p></div>}
      {error ? <div className="mx-auto my-auto max-w-md rounded-[1.5rem] border border-amber-200 bg-amber-50 p-7 text-center shadow-sm"><div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="size-5" /></div><h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">Document cannot be opened</h2><p className="mt-2 text-sm leading-6 text-stone-600">{error}</p><Button variant="outline" className="mt-5 rounded-full border-stone-300 bg-white" onClick={() => setRetryVersion(version => version + 1)}>Retry document</Button></div> : <div className={cn("relative bg-white shadow-[0_16px_45px_rgba(37,34,29,0.16)]", rendering && "opacity-80")}><canvas ref={canvasRef} className="block max-w-none" aria-label={`Page ${page} of ${selectedDocument.name}`} />{rendering && !loading && <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-stone-200"><div className="h-full w-1/3 animate-pulse bg-[#355d54]" /></div>}</div>}
      {fullscreenNotice && <div role="status" className="absolute inset-x-4 bottom-4 z-20 mx-auto max-w-xl rounded-xl border border-stone-300 bg-white/95 px-4 py-3 text-center text-xs leading-5 text-stone-700 shadow-lg backdrop-blur"><span>{fullscreenNotice}</span><button className="ml-3 font-semibold text-[#355d54] hover:underline" onClick={() => setFullscreenNotice(null)}>Dismiss</button></div>}
    </div>
    <div className="flex items-center justify-center gap-4 border-t border-stone-300/80 bg-[#f8f7f3] px-5 py-3"><Button variant="ghost" size="icon" className="size-9 rounded-full text-stone-700 hover:bg-stone-200" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={!pdf || page <= 1} aria-label="Previous page"><ChevronLeft className="size-4" /></Button><span className="min-w-24 text-center font-[family-name:var(--font-mono)] text-[11px] text-stone-600">{pageCount ? `${page} / ${pageCount}` : "— / —"}</span><Button variant="ghost" size="icon" className="size-9 rounded-full text-stone-700 hover:bg-stone-200" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={!pdf || page >= pageCount} aria-label="Next page"><ChevronRight className="size-4" /></Button></div>
  </section>;
}

function Navigator({ documents, selectedId, onSelect, search, onSearch, onRefresh, isRefreshing }: { documents: PortalDocument[]; selectedId: string | null; onSelect: (id: string) => void; search: string; onSearch: (value: string) => void; onRefresh: () => void; isRefreshing: boolean }) {
  const groups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matching = documents.filter(item => !query || [item.name, item.category, item.description].filter(Boolean).join(" ").toLocaleLowerCase().includes(query));
    return matching.reduce<Record<string, PortalDocument[]>>((result, item) => { (result[item.category] ??= []).push(item); return result; }, {});
  }, [documents, search]);
  return <aside className="flex w-full shrink-0 flex-col border-b border-stone-200 bg-[#fbfaf7] lg:w-[348px] lg:border-r lg:border-b-0">
    <div className="border-b border-stone-200 px-5 pb-4 pt-5"><div className="mb-5 flex items-start justify-between gap-3"><div><p className="mb-1 font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.17em] text-[#52776f]">Google Drive folder</p><h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-stone-900">Documents</h2></div><Button variant="outline" size="icon" className="size-9 rounded-full border-stone-300 bg-white text-stone-600 hover:bg-stone-100" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh document list"><RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} /></Button></div><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><Input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search the archive" className="h-10 rounded-xl border-stone-200 bg-white pl-9 text-sm shadow-none placeholder:text-stone-400 focus-visible:ring-[#355d54]" /></div><p className="mt-3 text-xs text-stone-500"><span className="font-semibold text-stone-700">{documents.length}</span> {documents.length === 1 ? "document" : "documents"} available</p></div>
    <div className="min-h-[250px] max-h-[42vh] overflow-y-auto px-3 py-3 lg:max-h-none lg:flex-1">
      {documents.length === 0 ? <div className="flex min-h-[215px] flex-col items-center justify-center px-5 text-center"><FolderOpen className="mb-4 size-8 text-stone-300" /><h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-stone-800">No PDFs found</h3><p className="mt-2 text-sm leading-5 text-stone-500">Add PDF files to the configured Drive folder, then refresh this collection.</p></div> : Object.keys(groups).length === 0 ? <div className="flex min-h-[215px] flex-col items-center justify-center px-5 text-center"><FileQuestion className="mb-4 size-8 text-stone-300" /><h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-stone-800">No matching documents</h3><p className="mt-2 text-sm leading-5 text-stone-500">Try a different name, category, or keyword.</p></div> : <div className="space-y-5">{Object.entries(groups).sort(([first], [second]) => first.localeCompare(second)).map(([category, files]) => <div key={category}><p className="px-2 pb-2 font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">{category}</p><div className="space-y-1">{files.map(item => { const active = item.id === selectedId; return <button key={item.id} onClick={() => onSelect(item.id)} className={cn("group flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition duration-150", active ? "bg-[#e2eee9] text-[#244b42] shadow-[inset_3px_0_0_#355d54]" : "text-stone-700 hover:bg-stone-100")}><span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-[#c9dfd7] text-[#355d54]" : "bg-stone-100 text-stone-500 group-hover:bg-stone-200")}><FileText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold leading-5">{item.name}</span><span className="mt-1 block truncate font-[family-name:var(--font-mono)] text-[10px] text-stone-500">{formatDate(item.modifiedTime)} · {formatBytes(item.size)}</span><span className="mt-1 block truncate font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wide text-stone-400">ID {item.id}</span></span></button>; })}</div></div>)}</div>}
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
  useEffect(() => { if (!documentsQuery.data) return; setSelectedId(current => { if (current && documents.some(item => item.id === current)) return current; const savedId = window.localStorage.getItem(LAST_DOCUMENT_KEY); return (savedId ? documents.find(item => item.id === savedId) : undefined)?.id ?? documents[0]?.id ?? null; }); }, [documents, documentsQuery.data]);
  useEffect(() => { if (!selectedDocument) { if (documentsQuery.data) window.localStorage.removeItem(LAST_DOCUMENT_KEY); return; } window.localStorage.setItem(LAST_DOCUMENT_KEY, selectedDocument.id); }, [documentsQuery.data, selectedDocument]);
  const listError = documentsQuery.error?.message || refreshMutation.error?.message;
  const isRefreshing = documentsQuery.isFetching || refreshMutation.isPending;
  const viewerArea = !selectedDocument ? <section className="flex min-h-[480px] flex-1 items-center justify-center bg-[#eceae4] p-7"><div className="max-w-md text-center"><div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-white text-[#355d54] shadow-sm"><BookOpen className="size-7" /></div><h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-stone-900">Your reading room awaits</h1><p className="mt-3 text-sm leading-6 text-stone-600">Select a PDF from the collection to view it here without leaving the portal.</p></div></section> : documentAccessQuery.isLoading ? <section className="flex min-h-[480px] flex-1 flex-col items-center justify-center gap-3 bg-[#eceae4] text-stone-600"><Loader2 className="size-7 animate-spin text-[#355d54]" /><p className="text-sm font-medium">Securing document access…</p></section> : documentAccessQuery.error || !access ? <section className="flex min-h-[480px] flex-1 items-center justify-center bg-[#eceae4] p-7"><div className="max-w-md rounded-[1.5rem] border border-amber-200 bg-amber-50 p-7 text-center shadow-sm"><div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="size-5" /></div><h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">Document unavailable</h2><p className="mt-2 text-sm leading-6 text-stone-600">{documentAccessQuery.error?.message || "The portal could not verify access to this document."}</p><Button variant="outline" className="mt-5 rounded-full border-stone-300 bg-white" onClick={() => void documentAccessQuery.refetch()}>Try again</Button></div></section> : <ViewerCanvas key={selectedDocument.id} selectedDocument={selectedDocument} access={access} />;
  return <main className="min-h-screen bg-[#f3f1ec] p-0 text-stone-900 lg:p-5"><div className="mx-auto flex min-h-screen max-w-[1520px] flex-col overflow-hidden bg-[#fbfaf7] shadow-[0_18px_70px_rgba(45,41,34,0.13)] lg:min-h-[calc(100vh-2.5rem)] lg:rounded-[1.75rem]"><header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-[#fbfaf7] px-5 py-4 sm:px-7"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-[#355d54] text-[#f8f7f3] shadow-sm"><BookOpen className="size-[18px]" /></div><div><p className="font-[family-name:var(--font-display)] text-lg font-bold leading-none tracking-tight text-stone-900">Folio</p><p className="mt-1 font-[family-name:var(--font-mono)] text-[9px] font-medium uppercase tracking-[0.16em] text-stone-500">Document portal</p></div></div><div className="hidden items-center gap-2 text-xs text-stone-500 sm:flex"><span className="size-2 rounded-full bg-[#6c9b75]" />Auto-refreshes every minute</div></header>{documentsQuery.isLoading ? <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#f8f7f3] text-stone-600"><Loader2 className="size-7 animate-spin text-[#355d54]" /><p className="text-sm font-medium">Loading your document collection…</p></div> : listError ? <div className="flex flex-1 items-center justify-center bg-[#f8f7f3] p-6"><div className="max-w-lg rounded-[1.75rem] border border-amber-200 bg-amber-50 p-8 text-center shadow-sm"><div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="size-5" /></div><h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-stone-900">The collection is unavailable</h1><p className="mt-3 text-sm leading-6 text-stone-600">{listError}</p><Button className="mt-6 rounded-full bg-[#355d54] px-5 text-white hover:bg-[#244b42]" onClick={() => void documentsQuery.refetch()}><RefreshCw className="mr-2 size-4" />Retry connection</Button></div></div> : <div className="flex min-h-0 flex-1 flex-col lg:flex-row"><Navigator documents={documents} selectedId={selectedId} onSelect={setSelectedId} search={search} onSearch={setSearch} onRefresh={() => refreshMutation.mutate()} isRefreshing={isRefreshing} />{viewerArea}</div>}</div></main>;
}
