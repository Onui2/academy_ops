export const requestWorkflowStatuses = [
  "DRAFT",
  "SUBMITTED",
  "TRIAGED",
  "APPROVAL_PENDING",
  "APPROVED",
  "REJECTED",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_USER",
  "WAITING_VENDOR",
  "COMPLETED",
  "CANCELED"
] as const;

export type RequestWorkflowStatus = (typeof requestWorkflowStatuses)[number];

export const legacyStatusToWorkflowStatus: Record<string, RequestWorkflowStatus> = {
  접수: "SUBMITTED",
  검토: "TRIAGED",
  "승인 대기": "APPROVAL_PENDING",
  진행: "IN_PROGRESS",
  완료: "COMPLETED",
  보류: "REJECTED"
};

export const workflowStatusToLegacyStatus: Partial<Record<RequestWorkflowStatus, string>> = {
  DRAFT: "접수",
  SUBMITTED: "접수",
  TRIAGED: "검토",
  APPROVAL_PENDING: "승인 대기",
  APPROVED: "검토",
  REJECTED: "보류",
  ASSIGNED: "진행",
  IN_PROGRESS: "진행",
  WAITING_USER: "진행",
  WAITING_VENDOR: "진행",
  COMPLETED: "완료",
  CANCELED: "보류"
};
