import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { WorkItem, WorkPriority, WorkStatus } from "@/types/ops";
import type { UserRole } from "@/types/ops";

type DbStatus = "received" | "reviewing" | "approval_pending" | "in_progress" | "completed" | "blocked";
type DbPriority = "low" | "normal" | "high" | "urgent";

type DbRequest = {
  id: string;
  request_no: string;
  module: string;
  title: string;
  description: string;
  status: DbStatus;
  priority: DbPriority;
  campus: string | null;
  due_date: string | null;
  vendor: string | null;
  amount_text: string | null;
  audit_note: string | null;
  approval_note: string | null;
  rejection_note: string | null;
  urgent_reason: string | null;
  urgent_impact: string | null;
  evidence_files: string[] | null;
  created_at: string;
};

type DbFaq = {
  id: string;
  keyword: string;
  category: string;
  answer: string;
  escalation_required: boolean;
};

type ApprovalDecision = "pending" | "approved" | "rejected";

const statusToDb: Record<WorkStatus, DbStatus> = {
  접수: "received",
  검토: "reviewing",
  "승인 대기": "approval_pending",
  진행: "in_progress",
  완료: "completed",
  보류: "blocked"
};

const statusFromDb: Record<DbStatus, WorkStatus> = {
  received: "접수",
  reviewing: "검토",
  approval_pending: "승인 대기",
  in_progress: "진행",
  completed: "완료",
  blocked: "보류"
};

const priorityToDb: Record<WorkPriority, DbPriority> = {
  낮음: "low",
  보통: "normal",
  높음: "high",
  긴급: "urgent"
};

const priorityFromDb: Record<DbPriority, WorkPriority> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  urgent: "긴급"
};

function buildApprovalFlow(item: WorkItem): Array<{ step_order: number; approver_role: UserRole }> {
  if (item.module === "NAS") {
    return [
      { step_order: 1, approver_role: "nas_admin" },
      { step_order: 2, approver_role: "super_admin" }
    ];
  }

  if (item.module === "전산 장비") {
    return [
      { step_order: 1, approver_role: "academy_admin" },
      { step_order: 2, approver_role: "executive" },
      { step_order: 3, approver_role: "super_admin" }
    ];
  }

  if (item.priority === "긴급") {
    return [
      { step_order: 1, approver_role: "academy_admin" },
      { step_order: 2, approver_role: "super_admin" }
    ];
  }

  return [{ step_order: 1, approver_role: "academy_admin" }];
}

export async function ensureProfile(supabase: SupabaseClient, user: User) {
  const email = user.email ?? "unknown@academy.local";
  const fullName = user.user_metadata?.full_name ?? email.split("@")[0];

  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return;

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    email,
    full_name: fullName,
    role: "general",
    mfa_enabled: false
  });

  if (error) throw error;
}

export async function fetchProfileRole(supabase: SupabaseClient, user: User): Promise<UserRole> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return (data?.role ?? "general") as UserRole;
}

export async function fetchRequests(supabase: SupabaseClient): Promise<WorkItem[]> {
  const { data, error } = await supabase
    .from("ops_requests")
    .select("id, request_no, module, title, description, status, priority, campus, due_date, vendor, amount_text, audit_note, approval_note, rejection_note, urgent_reason, urgent_impact, evidence_files, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as DbRequest[]).map(dbToWorkItem);
}

export async function createRequest(supabase: SupabaseClient, user: User, item: WorkItem) {
  const { data, error } = await supabase.from("ops_requests").insert({
    request_no: item.id,
    module: item.module,
    title: item.title,
    description: item.description ?? "",
    requester_id: user.id,
    status: statusToDb[item.status],
    priority: priorityToDb[item.priority],
    campus: item.requester,
    due_date: parseDueDate(item.due),
    vendor: item.vendor ?? null,
    amount_text: item.amount ?? null,
    audit_note: item.audit,
    approval_note: item.approvalNote ?? null,
    rejection_note: item.rejectionNote ?? null,
    urgent_reason: item.urgentReason ?? null,
    urgent_impact: item.urgentImpact ?? null,
    evidence_files: item.evidenceFiles ?? []
  }).select("id").single();

  if (error) throw error;

  if (!data?.id) return;

  const approvalFlow = buildApprovalFlow(item);
  if (approvalFlow.length > 0) {
    const { error: approvalError } = await supabase.from("approvals").insert(
      approvalFlow.map((step) => ({
        request_id: data.id,
        step_order: step.step_order,
        approver_role: step.approver_role,
        decision: "pending" satisfies ApprovalDecision
      }))
    );

    if (approvalError) throw approvalError;
  }
}

export async function updateRequestStatus(supabase: SupabaseClient, item: WorkItem) {
  const { error } = await supabase
    .from("ops_requests")
    .update({
      status: statusToDb[item.status],
      audit_note: item.audit,
      approval_note: item.approvalNote ?? null,
      rejection_note: item.rejectionNote ?? null
    })
    .eq("request_no", item.id);

  if (error) throw error;
}

export async function decideApprovalStep(
  supabase: SupabaseClient,
  requestNo: string,
  role: UserRole,
  decision: Exclude<ApprovalDecision, "pending">,
  note?: string
) {
  const { data: request, error: requestError } = await supabase
    .from("ops_requests")
    .select("id")
    .eq("request_no", requestNo)
    .maybeSingle();

  if (requestError) throw requestError;
  if (!request?.id) return;

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .select("id, step_order")
    .eq("request_id", request.id)
    .eq("approver_role", role)
    .eq("decision", "pending")
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (approvalError) throw approvalError;
  if (!approval?.id) return;

  const { error: updateError } = await supabase
    .from("approvals")
    .update({
      decision,
      note: note ?? null,
      decided_at: new Date().toISOString()
    })
    .eq("id", approval.id);

  if (updateError) throw updateError;
}

export async function deleteRequest(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("ops_requests").delete().eq("request_no", id);
  if (error) throw error;
}

export function dbToWorkItem(row: DbRequest): WorkItem {
  return {
    id: row.request_no,
    module: row.module,
    title: row.title,
    requester: row.campus ?? "운영팀",
    owner: row.module === "NAS" ? "NAS 관리자" : row.module === "A/S" ? "전산" : "경영지원",
    status: statusFromDb[row.status],
    priority: priorityFromDb[row.priority],
    due: row.due_date ?? "미정",
    audit: row.audit_note ?? "DB 동기화됨",
    description: row.description,
    amount: row.amount_text ?? undefined,
    vendor: row.vendor ?? undefined,
    approvalNote: row.approval_note ?? undefined,
    rejectionNote: row.rejection_note ?? undefined,
    urgentReason: row.urgent_reason ?? undefined,
    urgentImpact: row.urgent_impact ?? undefined,
    evidenceFiles: row.evidence_files ?? undefined
  };
}

function parseDueDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

export async function fetchFaqs(supabase: SupabaseClient): Promise<DbFaq[]> {
  const { data, error } = await supabase
    .from("as_faqs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbFaq[];
}

export async function createAuditLog(supabase: SupabaseClient, log: { request_id?: string; actor_id: string; actor_label: string; event: string; metadata?: Record<string, unknown> }) {
  const { error } = await supabase
    .from("audit_logs")
    .insert([log]);
  if (error) throw error;
}

export async function fetchNasPermissions(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("nas_permissions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createNasPermissionRequest(supabase: SupabaseClient, request: { user_email: string; resource_name: string; permission_level: string; requested_by: string }) {
  const { error } = await supabase
    .from("nas_permissions")
    .insert([request]);
  if (error) throw error;
}
