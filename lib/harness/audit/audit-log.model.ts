import type { AuditActionType, AuditTargetType } from "@/types/audit";

export type AuditWriteInput = {
  actorUserId: string | null;
  actorName: string;
  actionType: AuditActionType;
  targetType: AuditTargetType;
  targetId: string;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  summary: string;
};
