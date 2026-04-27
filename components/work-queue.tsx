import { Clock3, SlidersHorizontal } from "lucide-react";
import { workItems } from "@/lib/ops-data";
import { StatusPill } from "@/components/status-pill";

const priorityClasses = {
  낮음: "text-slate-500",
  보통: "text-cyan-700",
  높음: "text-amber-700",
  긴급: "text-rose-700"
};

export function WorkQueue() {
  return (
    <section className="min-w-0 rounded border border-border bg-white shadow-panel">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-bold">업무 큐</h2>
          <p className="text-sm text-muted-foreground">승인 전후 요청 흐름</p>
        </div>
        <button className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded border border-border text-muted-foreground" aria-label="필터">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">번호</th>
              <th className="px-4 py-3 font-semibold">업무</th>
              <th className="px-4 py-3 font-semibold">상태</th>
              <th className="px-4 py-3 font-semibold">담당</th>
              <th className="px-4 py-3 font-semibold">기한</th>
              <th className="px-4 py-3 font-semibold">감사 메모</th>
            </tr>
          </thead>
          <tbody>
            {workItems.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3 font-semibold text-primary">{item.id}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{item.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.module} · {item.requester} · <span className={priorityClasses[item.priority]}>{item.priority}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={item.status} />
                </td>
                <td className="px-4 py-3">{item.owner}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {item.due}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.audit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
