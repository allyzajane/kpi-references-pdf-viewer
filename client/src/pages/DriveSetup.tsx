import { KpiKeyMark } from "@/components/KpiKeyBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDriveConnectionStatus, type DriveConnectionStatus } from "@/lib/documentsApi";
import { AlertTriangle, CheckCircle2, ChevronLeft, FolderCheck, KeyRound, LockKeyhole, RefreshCw, ServerCog } from "lucide-react";
import { FormEvent, useState } from "react";

const statusPresentation = {
  connected: { label: "Connected", icon: CheckCircle2, color: "text-[#1890CF]", surface: "bg-[#E8F5FC]", border: "border-[#96D2F3]" },
  "needs-configuration": { label: "Needs configuration", icon: ServerCog, color: "text-amber-700", surface: "bg-amber-50", border: "border-amber-200" },
  unavailable: { label: "Connection unavailable", icon: AlertTriangle, color: "text-rose-700", surface: "bg-rose-50", border: "border-rose-200" },
} as const;

function StatusItem({ label, complete }: { label: string; complete: boolean }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-[#BFE4F8] bg-white px-4 py-3"><span className="text-sm font-medium text-stone-800">{label}</span><span className={complete ? "text-xs font-semibold text-[#1890CF]" : "text-xs font-semibold text-stone-500"}>{complete ? "Configured" : "Not configured"}</span></div>;
}

export default function DriveSetup() {
  const [operatorToken, setOperatorToken] = useState("");
  const [status, setStatus] = useState<DriveConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const presentation = status ? statusPresentation[status.status] : null;
  const StatusIcon = presentation?.icon ?? ServerCog;
  const isPreview = import.meta.env.DEV;

  async function checkConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = operatorToken.trim();
    if (!accessToken && !isPreview) { setError("Enter the operator access token to check this server-side configuration."); return; }
    setIsChecking(true);
    setError(null);
    try { setStatus(await getDriveConnectionStatus(accessToken)); }
    catch (requestError) { setStatus(null); setError(requestError instanceof Error ? requestError.message : "The configuration check could not be completed."); }
    finally { setIsChecking(false); }
  }

  return <main className="min-h-[100dvh] bg-[#E8F5FC] px-4 py-5 text-stone-900 sm:p-8"><section className="mx-auto max-w-3xl overflow-hidden rounded-[1.75rem] border border-[#BFE4F8] bg-white shadow-[0_18px_70px_rgba(24,144,207,0.14)]"><header className="flex items-center justify-between border-b border-[#BFE4F8] bg-[#E8F5FC] px-5 py-4 sm:px-7"><a href="/" className="inline-flex items-center gap-2 rounded-lg px-1 text-sm font-semibold text-stone-700 transition-colors hover:text-[#1890CF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#44AFE9]"><ChevronLeft className="size-4" />Document portal</a><div className="flex items-center gap-2"><div className="flex size-8 items-center justify-center rounded-xl bg-[#1890CF]"><KpiKeyMark className="size-[19px]" /></div><span className="hidden font-[family-name:var(--font-display)] text-base font-bold sm:inline">KPI References</span></div></header><div className="p-5 sm:p-8"><div><p className="font-[family-name:var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1890CF]">{isPreview ? "Local preview configuration" : "Protected server-side configuration"}</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-stone-900">Google Drive connection</h1><p className="mt-3 max-w-xl text-sm leading-6 text-stone-600">Check whether the portal can reach its configured Drive folder. This screen never displays, stores, or accepts Google Drive credential values.</p></div><form className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={checkConnection}>{isPreview ? <div className="flex-1 rounded-xl border border-[#BFE4F8] bg-[#E8F5FC] px-4 py-3 text-sm leading-5 text-stone-600">This managed preview checks the safe connection payload directly. Deployed Cloudflare Pages requires the operator token.</div> : <label className="min-w-0 flex-1"><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-800"><KeyRound className="size-4 text-[#1890CF]" />Operator access token</span><Input type="password" autoComplete="off" value={operatorToken} onChange={event => setOperatorToken(event.target.value)} placeholder="Enter the server-side status token" className="h-11 border-[#96D2F3] bg-white focus-visible:ring-[#44AFE9]" /></label>}<Button type="submit" disabled={isChecking} className="h-11 shrink-0 rounded-full bg-[#1890CF] px-5 text-white hover:bg-[#187BB3]"><RefreshCw className={isChecking ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />{isChecking ? "Checking…" : "Check connection"}</Button></form><p className="mt-2 text-xs leading-5 text-stone-500">{isPreview ? "Preview-only behavior: no operator token is requested or stored. Production retains the protected token session." : "This access token is submitted only to the status endpoint and is not saved in the browser."}</p>{error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><AlertTriangle className="mb-2 size-5" />{error}</div> : null}{status && presentation ? <><div className={`mt-7 rounded-2xl border p-5 ${presentation.border} ${presentation.surface}`}><div className="flex gap-3"><StatusIcon className={`mt-0.5 size-5 shrink-0 ${presentation.color}`} /><div><p className={`text-sm font-bold ${presentation.color}`}>{presentation.label}</p><p className="mt-1 text-sm leading-6 text-stone-700">{status.message}</p>{status.documentCount !== null ? <p className="mt-3 text-sm font-semibold text-stone-800">{status.documentCount} {status.documentCount === 1 ? "document" : "documents"} found</p> : null}</div></div></div><div className="mt-7 grid gap-3 sm:grid-cols-2"><StatusItem label="Drive folder" complete={status.folderConfigured} /><StatusItem label={status.accessMode === "private" ? "Service account" : "Drive API key"} complete={status.credentialConfigured} /></div><div className="mt-7 rounded-2xl border border-[#BFE4F8] bg-[#E8F5FC] p-5"><div className="flex gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-[#1890CF]" /><div><h2 className="text-sm font-bold text-stone-900">Credentials remain private</h2><p className="mt-1 text-sm leading-6 text-stone-600">Only configuration presence, access mode, and catalog availability are returned. Secret values, folder identifiers, and Google Drive resource keys are not included in this response.</p></div></div></div><div className="mt-5 flex gap-3 text-sm text-stone-500"><FolderCheck className="size-4 shrink-0 text-[#1890CF]" /><span>Last checked {new Date(status.checkedAt).toLocaleString()}.</span></div></> : null}</div></section></main>;
}
