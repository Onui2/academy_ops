import { HardDrive, LockKeyhole, Wifi } from "lucide-react";
import type { NasMetric } from "@/types/ops";

const nasMetrics: NasMetric[] = [
  { label: "전체 용량", value: "32TB", detail: "24TB 사용 중 (75%)", health: "정상" },
  { label: "활성 사용자", value: "142명", detail: "현재 접속 18명", health: "정상" },
  { label: "시스템 상태", value: "Optimal", detail: "CPU 12%, RAM 45%", health: "정상" },
  { label: "백업 상태", value: "성공", detail: "오늘 오전 03:00 완료", health: "정상" }
];

const healthClasses: Record<NasMetric["health"], string> = {
  정상: "bg-emerald-100 text-emerald-800",
  주의: "bg-amber-100 text-amber-800",
  위험: "bg-rose-100 text-rose-800"
};

export function NasPanel() {
  return (
    <section className="rounded border border-border bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">NAS 현황</h2>
          <p className="text-sm text-muted-foreground">용량, 권한, 접속 상태</p>
        </div>
        <HardDrive className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>

      <div className="mt-4 space-y-3">
        {nasMetrics.map((metric: NasMetric) => (
          <div key={metric.label} className="rounded border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{metric.label}</span>
              <span className={`rounded px-2 py-1 text-xs font-semibold ${healthClasses[metric.health]}`}>{metric.health}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <strong className="text-2xl">{metric.value}</strong>
              <span className="text-right text-xs text-muted-foreground">{metric.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded bg-primary px-3 text-sm font-semibold text-primary-foreground">
          <Wifi className="h-4 w-4" aria-hidden="true" />
          접속 안내
        </button>
        <button className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded border border-border px-3 text-sm font-semibold">
          <LockKeyhole className="h-4 w-4" aria-hidden="true" />
          권한 검토
        </button>
      </div>
    </section>
  );
}
