import type { RequestWorkflowStatus } from "@/types/workflow";

export const workflowRules: Record<RequestWorkflowStatus, RequestWorkflowStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["TRIAGED", "CANCELED"],
  TRIAGED: ["ASSIGNED", "APPROVAL_PENDING"],
  APPROVAL_PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["ASSIGNED"],
  REJECTED: [],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_USER", "WAITING_VENDOR", "COMPLETED"],
  WAITING_USER: ["IN_PROGRESS"],
  WAITING_VENDOR: ["IN_PROGRESS"],
  COMPLETED: [],
  CANCELED: []
};
