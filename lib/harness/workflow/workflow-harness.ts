import { assertWorkflowTransition } from "@/lib/harness/workflow/request-state-machine";
import { legacyStatusToWorkflowStatus, workflowStatusToLegacyStatus } from "@/types/workflow";
import type { RequestWorkflowStatus } from "@/types/workflow";

export function resolveWorkflowStatus(currentWorkflowStatus: string | null | undefined, legacyStatus: string | null | undefined): RequestWorkflowStatus {
  if (currentWorkflowStatus) {
    return currentWorkflowStatus as RequestWorkflowStatus;
  }

  if (legacyStatus && legacyStatusToWorkflowStatus[legacyStatus]) {
    return legacyStatusToWorkflowStatus[legacyStatus];
  }

  return "SUBMITTED";
}

export function resolveLegacyStatusFromWorkflowStatus(workflowStatus: RequestWorkflowStatus) {
  return workflowStatusToLegacyStatus[workflowStatus] ?? "접수";
}

export function runWorkflowHarness(
  currentWorkflowStatus: RequestWorkflowStatus,
  nextWorkflowStatus: RequestWorkflowStatus,
  options?: { allowResubmit?: boolean }
) {
  assertWorkflowTransition(currentWorkflowStatus, nextWorkflowStatus, options);
}
