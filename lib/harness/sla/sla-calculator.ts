import { addBusinessDays } from "@/lib/harness/sla/business-time";
import type { RequestPriorityCode } from "@/types/request";

export function calculateSlaDueAt(priority: RequestPriorityCode, createdAt = new Date()) {
  const dueAt = new Date(createdAt);

  switch (priority) {
    case "URGENT":
      dueAt.setHours(dueAt.getHours() + 4);
      return dueAt;
    case "HIGH":
      return addBusinessDays(dueAt, 1);
    case "LOW":
      return addBusinessDays(dueAt, 7);
    case "NORMAL":
    default:
      return addBusinessDays(dueAt, 3);
  }
}

export function getRemainingMinutes(dueAt: string | null, referenceDate = new Date()) {
  if (!dueAt) return null;
  return Math.round((new Date(dueAt).getTime() - referenceDate.getTime()) / 60000);
}
