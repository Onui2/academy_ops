import { CheckCircle2, CircleDot, Timer } from "lucide-react";

const steps = [
  { label: "요청 접수", icon: CheckCircle2, done: true },
  { label: "예산 검토", icon: CheckCircle2, done: true },
  { label: "경영 승인", icon: CircleDot, done: false },
  { label: "구매 실행", icon: Timer, done: false }
];

export function ApprovalLane() {
  return (
    <section className="rounded border border-border bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">승인 레인</h2>
          <p className="text-sm text-muted-foreground">전산 장비 구매 표준 흐름</p>
        </div>
        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">2건 지연</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {steps.map((step) => {
          const Icon = step.icon;

          return (
            <div key={step.label} className={`rounded border p-3 ${step.done ? "border-emerald-200 bg-emerald-50" : "border-border bg-muted/40"}`}>
              <Icon className={`h-5 w-5 ${step.done ? "text-emerald-700" : "text-muted-foreground"}`} aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{step.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
