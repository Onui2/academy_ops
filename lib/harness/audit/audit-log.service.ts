import type { SupabaseClient } from "@supabase/supabase-js";
import { redactSensitiveFields } from "@/lib/harness/security/sanitize-input";
import type { AuditLogEntry } from "@/types/audit";
import type { AuditWriteInput } from "@/lib/harness/audit/audit-log.model";

function isUuid(value: string | null | undefined) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function writeAuditLog(supabase: SupabaseClient, input: AuditWriteInput) {
  const beforeValue = redactSensitiveFields(input.beforeValue ?? null);
  const afterValue = redactSensitiveFields(input.afterValue ?? null);

  const payload = {
    request_id: input.requestId ?? null,
    actor_id: isUuid(input.actorUserId) ? input.actorUserId : null,
    actor_label: input.actorName,
    event: input.summary,
    metadata: {
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId
    },
    actor_user_id: input.actorUserId,
    actor_name: input.actorName,
    action_type: input.actionType,
    target_type: input.targetType,
    target_id: input.targetId,
    before_value: beforeValue,
    after_value: afterValue,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null
  };

  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error) throw error;
}

export async function listAuditLogsForRequest(supabase: SupabaseClient, requestId: string): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, actor_user_id, actor_name, actor_label, action_type, target_type, target_id, before_value, after_value, ip_address, user_agent, created_at, event")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorName: (row.actor_name as string | null) ?? (row.actor_label as string | null) ?? "System",
    actionType: String(row.action_type ?? "REQUEST_UPDATED") as AuditLogEntry["actionType"],
    targetType: String(row.target_type ?? "request") as AuditLogEntry["targetType"],
    targetId: String(row.target_id ?? requestId),
    beforeValue: (row.before_value as Record<string, unknown> | null) ?? null,
    afterValue: (row.after_value as Record<string, unknown> | null) ?? null,
    ipAddress: (row.ip_address as string | null) ?? null,
    userAgent: (row.user_agent as string | null) ?? null,
    createdAt: String(row.created_at),
    summary: String(row.event ?? "")
  }));
}
