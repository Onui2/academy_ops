import { calculateSlaDueAt, getRemainingMinutes } from "@/lib/harness/sla/sla-calculator";
import type { RequestPriorityCode, RequestSlaSnapshot } from "@/types/request";
import type { RequestWorkflowStatus } from "@/types/workflow";

function formatSlaLabel(remainingMinutes: number | null, breached: boolean) {
  if (remainingMinutes === null) return "SLA 미설정";
  if (breached) return "SLA 초과";

  const totalMinutes = Math.max(remainingMinutes, 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}일 ${hours % 24}시간 남음`;
  }
  return `${hours}시간 ${minutes}분 남음`;
}

export function buildInitialSla(priority: RequestPriorityCode, createdAt = new Date()) {
  return calculateSlaDueAt(priority, createdAt).toISOString();
}

export function buildSlaSnapshot(input: {
  dueAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  workflowStatus: RequestWorkflowStatus;
}): RequestSlaSnapshot {
  const reference = input.workflowStatus === "WAITING_USER" && input.pausedAt ? new Date(input.pausedAt) : new Date();
  const remainingMinutes = getRemainingMinutes(input.dueAt, reference);
  const breached = input.completedAt ? new Date(input.completedAt).getTime() > new Date(input.dueAt ?? input.completedAt).getTime() : (remainingMinutes ?? 0) < 0;

  return {
    dueAt: input.dueAt,
    pausedAt: input.pausedAt,
    breached,
    remainingMinutes,
    displayLabel: formatSlaLabel(remainingMinutes, breached)
  };
}

export function applySlaPauseState(input: {
  currentStatus: RequestWorkflowStatus;
  nextStatus: RequestWorkflowStatus;
  dueAt: string | null;
  pausedAt: string | null;
  changedAt: string;
}) {
  if (input.currentStatus !== "WAITING_USER" && input.nextStatus === "WAITING_USER") {
    return {
      dueAt: input.dueAt,
      pausedAt: input.changedAt
    };
  }

  if (input.currentStatus === "WAITING_USER" && input.pausedAt && input.nextStatus !== "WAITING_USER" && input.dueAt) {
    const pausedDurationMs = new Date(input.changedAt).getTime() - new Date(input.pausedAt).getTime();
    return {
      dueAt: new Date(new Date(input.dueAt).getTime() + pausedDurationMs).toISOString(),
      pausedAt: null
    };
  }

  return {
    dueAt: input.dueAt,
    pausedAt: input.pausedAt
  };
}
