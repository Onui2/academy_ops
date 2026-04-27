import type { WorkStatus } from "@/types/ops";

const statusClasses: Record<WorkStatus, string> = {
  접수: "bg-slate-100 text-slate-700",
  검토: "bg-cyan-100 text-cyan-800",
  "승인 대기": "bg-amber-100 text-amber-800",
  진행: "bg-indigo-100 text-indigo-800",
  완료: "bg-emerald-100 text-emerald-800",
  보류: "bg-rose-100 text-rose-800"
};

export function StatusPill({ status }: { status: WorkStatus }) {
  return (
    <span className={`inline-flex min-w-[72px] items-center justify-center rounded px-2 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {status}
    </span>
  );
}
