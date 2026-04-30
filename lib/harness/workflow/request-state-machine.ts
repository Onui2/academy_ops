import { HarnessError } from "@/lib/harness/harness-error";
import { workflowRules } from "@/lib/harness/workflow/workflow-rule";
import type { RequestWorkflowStatus } from "@/types/workflow";

export function assertWorkflowTransition(
  currentStatus: RequestWorkflowStatus,
  nextStatus: RequestWorkflowStatus,
  options?: { allowResubmit?: boolean }
) {
  if (currentStatus === nextStatus) return;

  if (options?.allowResubmit && currentStatus === "REJECTED" && nextStatus === "SUBMITTED") {
    return;
  }

  const allowed = workflowRules[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new HarnessError(`Workflow transition ${currentStatus} -> ${nextStatus} is not allowed.`, 422, "허용되지 않는 상태 변경입니다.");
  }
}
