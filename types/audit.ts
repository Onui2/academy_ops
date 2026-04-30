export type AuditActionType =
  | "REQUEST_CREATED"
  | "REQUEST_UPDATED"
  | "REQUEST_STATUS_CHANGED"
  | "REQUEST_VIEWED"
  | "REQUEST_COMMENT_CREATED"
  | "REQUEST_ACCESS_DENIED"
  | "POLICY_VIOLATION"
  | "DASHBOARD_VIEWED"
  | "DASHBOARD_ACCESS_DENIED";

export type AuditTargetType = "request" | "comment" | "dashboard" | "policy";

export type AuditLogEntry = {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actionType: AuditActionType;
  targetType: AuditTargetType;
  targetId: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  summary: string;
};
