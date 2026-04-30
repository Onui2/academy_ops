import type { WorkItem } from "@/types/ops";
import type { AuditLogEntry } from "@/types/audit";
import type { RequestWorkflowStatus } from "@/types/workflow";

export type RequestCategory = "equipment" | "as" | "nas" | "tablet" | "other" | "software" | "network" | "parts";
export type RequestPriorityCode = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type RequestVisibility = "public" | "internal";

export type RequestComment = {
  id: string;
  requestNo: string;
  userId: string;
  userName: string;
  comment: string;
  visibility: RequestVisibility;
  createdAt: string;
};

export type RequestAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
};

export type RequestSlaSnapshot = {
  dueAt: string | null;
  pausedAt: string | null;
  breached: boolean;
  remainingMinutes: number | null;
  displayLabel: string;
};

export type RequestDetail = {
  requestNo: string;
  workflowStatus: RequestWorkflowStatus;
  category: RequestCategory;
  subCategory: string | null;
  priorityCode: RequestPriorityCode;
  requesterName: string;
  requesterUserId: string | null;
  branchId: string | null;
  branchName: string | null;
  assignedDepartment: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  approvalState: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  metadata: Record<string, unknown>;
  workItem: WorkItem;
  sla: RequestSlaSnapshot;
  comments: RequestComment[];
  progressLogs: AuditLogEntry[];
  attachments: RequestAttachment[];
};

export type RequestCreatePayload = {
  item: WorkItem;
  category?: RequestCategory;
  metadata?: Record<string, unknown>;
  nasPermission?: {
    user_email: string;
    resource_name: string;
    permission_level: string;
  };
};

export type RequestCommentCreatePayload = {
  comment: string;
  visibility?: RequestVisibility;
};

export type RequestStatusUpdatePayload = {
  workflowStatus: RequestWorkflowStatus;
  note?: string;
  rejectionNote?: string;
  approvalNote?: string;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
};
