import { ArrowUpRight } from "lucide-react";
import { modules } from "@/lib/ops-data";

export function ModuleGrid() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {modules.map((module) => {
        const Icon = module.icon;

        return (
          <article key={module.name} className="rounded border border-border bg-white p-4 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded ${module.tone}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <button className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground" aria-label={`${module.name} 열기`}>
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-bold">{module.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{module.description}</p>
              <p className="mt-3 text-2xl font-bold">{module.count}</p>
              <p className="text-xs text-muted-foreground">진행 중</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
