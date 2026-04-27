import { ChevronRight } from "lucide-react";
import { aiHarnessSteps } from "@/lib/ops-data";

export function AiHarnessPanel() {
  return (
    <section className="rounded border border-border bg-white p-4 shadow-panel">
      <div>
        <h2 className="text-base font-bold">AI Harness</h2>
        <p className="text-sm text-muted-foreground">개발, 검토, 감사 자동화 흐름</p>
      </div>
      <div className="mt-4 space-y-3">
        {aiHarnessSteps.map((step, index) => {
          const Icon = step.icon;

          return (
            <div key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded bg-muted text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                {index < aiHarnessSteps.length - 1 ? <div className="h-8 w-px bg-border" /> : null}
              </div>
              <div className="min-w-0 pb-3">
                <div className="flex items-center gap-1 text-sm font-bold">
                  {step.label}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
