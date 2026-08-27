import { cn } from "@/lib/utils";

export const KPI_KEY_TOOLTIP = "Key Performance Indicator";

export function KpiKeyMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <circle cx="9" cy="12" r="6.25" fill="#F7CE62" stroke="#FFF3C4" strokeWidth="1.25" />
    <path d="M13.8 15.8H27.2V19.1H24.4V22H21.4V19.1H18.7V17.8H13.8V15.8Z" fill="#F7CE62" stroke="#FFF3C4" strokeLinejoin="round" strokeWidth="1.1" />
    <path d="M6.75 14.1V11.9M9 14.1V9.1M11.25 14.1V10.35" stroke="#1890CF" strokeLinecap="round" strokeWidth="1.45" />
  </svg>;
}

export function KpiKeyLoader({ className }: { className?: string }) {
  return <span className={cn("kpi-key-loader", className)} aria-hidden="true"><KpiKeyMark className="size-full" /></span>;
}
