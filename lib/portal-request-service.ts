import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeacherSession } from "@/lib/teacher-session";
import type { UserRole, WorkItem, WorkPriority, WorkStatus } from "@/types/ops";

type DbStatus = "received" | "reviewing" | "approval_pending" | "in_progress" | "completed" | "blocked";
type DbPriority = "low" | "normal" | "high" | "urgent";
type ApprovalDecision = "pending" | "approved" | "rejected";

type DbRequestRow = {
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

type PortalRequestMeta = {
  source: "teacher_portal";
  username: string;
  brand: string;
  brandName: string | null;
  branch: string;
  branchName: string | null;
  portalRole: TeacherSession["portalRole"];
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

const PORTAL_META_PREFIX = "[[TEACHER_PORTAL_META]]";
const PORTAL_SYSTEM_EMAIL = process.env.TEACHER_PORTAL_SYSTEM_EMAIL ?? "teacher-portal@academy.local";
const PORTAL_SYSTEM_PASSWORD =
  process.env.TEACHER_PORTAL_SYSTEM_PASSWORD ?? `teacher-portal-${process.env.NODE_ENV ?? "dev"}-2026!`;

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

function isMissingRelationError(error: SupabaseLikeError | null | undefined, relation: string) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "PGRST205" || error.code === "42P01" || (message.includes("not found") && message.includes(relation));
}

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

export function buildPortalRequestMeta(session: TeacherSession): PortalRequestMeta {
  return {
    source: "teacher_portal",
    username: session.username,
    brand: session.brand,
    brandName: session.brandName,
    branch: session.branch,
    branchName: session.branchName,
    portalRole: session.portalRole
  };
}

function encodePortalMeta(meta: PortalRequestMeta) {
  return `${PORTAL_META_PREFIX}${Buffer.from(JSON.stringify(meta), "utf8").toString("base64url")}`;
}

export function injectPortalMeta(description: string, meta: PortalRequestMeta) {
  return `${encodePortalMeta(meta)}\n${description}`.trim();
}

export function stripPortalMeta(description: string) {
  const lines = description.split("\n");
  const firstLine = lines[0]?.trim();

  if (!firstLine?.startsWith(PORTAL_META_PREFIX)) {
    return { meta: null as PortalRequestMeta | null, description };
  }

  try {
    const encoded = firstLine.slice(PORTAL_META_PREFIX.length);
    const meta = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PortalRequestMeta;
    return {
      meta,
      description: lines.slice(1).join("\n").trim()
    };
  } catch {
    return { meta: null as PortalRequestMeta | null, description };
  }
}

function parseDueDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

let cachedPortalUserId: string | null = null;

export async function ensureTeacherPortalRequester(supabase: SupabaseClient) {
  if (cachedPortalUserId) return cachedPortalUserId;

  // Try to create the user first; if already exists, look up by listing with email filter.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: PORTAL_SYSTEM_EMAIL,
    password: PORTAL_SYSTEM_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Teacher Portal" }
  });

  let userId = created?.user?.id ?? null;

  if (!userId) {
    // User already exists — find by listing with a small page and matching email.
    if (createError && (createError as { status?: number }).status !== 422) throw createError;

    const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;

    userId = listed.users.find((u) => u.email?.toLowerCase() === PORTAL_SYSTEM_EMAIL.toLowerCase())?.id ?? null;
  }

  if (!userId) {
    throw new Error("Teacher portal requester user could not be provisioned.");
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email: PORTAL_SYSTEM_EMAIL,
      full_name: "Teacher Portal",
      role: "general",
      mfa_enabled: false
    },
    { onConflict: "id" }
  );

  if (profileError) throw profileError;

  cachedPortalUserId = userId;
  return userId;
}

export function dbRowToWorkItem(row: DbRequestRow): WorkItem {
  const { description } = stripPortalMeta(row.description);

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
    description,
    amount: row.amount_text ?? undefined,
    vendor: row.vendor ?? undefined,
    approvalNote: row.approval_note ?? undefined,
    rejectionNote: row.rejection_note ?? undefined,
    urgentReason: row.urgent_reason ?? undefined,
    urgentImpact: row.urgent_impact ?? undefined,
    evidenceFiles: row.evidence_files ?? undefined
  };
}

export function canTeacherSessionAccessRow(row: DbRequestRow, session: TeacherSession) {
  if (session.portalRole === "admin") {
    return true;
  }

  const { meta } = stripPortalMeta(row.description);
  if (!meta) return false;

  return meta.username === session.username && meta.branch === session.branch && meta.brand === session.brand;
}

export async function fetchPortalRequests(supabase: SupabaseClient, session: TeacherSession) {
  const { data, error } = await supabase
    .from("ops_requests")
    .select("id, request_no, module, title, description, status, priority, campus, due_date, vendor, amount_text, audit_note, approval_note, rejection_note, urgent_reason, urgent_impact, evidence_files, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = ((data ?? []) as DbRequestRow[]).filter((row) => canTeacherSessionAccessRow(row, session));
  return rows.map(dbRowToWorkItem);
}

export async function createPortalRequest(
  supabase: SupabaseClient,
  session: TeacherSession,
  item: WorkItem,
  extra?: {
    nasPermission?: {
      user_email: string;
      resource_name: string;
      permission_level: string;
    };
  }
) {
  const requesterId = await ensureTeacherPortalRequester(supabase);
  const meta = buildPortalRequestMeta(session);

  const { data, error } = await supabase
    .from("ops_requests")
    .insert({
      request_no: item.id,
      module: item.module,
      title: item.title,
      description: injectPortalMeta(item.description ?? "", meta),
      requester_id: requesterId,
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
    })
    .select("id")
    .single();

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

    if (approvalError && !isMissingRelationError(approvalError, "approvals")) throw approvalError;
  }

  if (extra?.nasPermission) {
    const { error: nasError } = await supabase.from("nas_permissions").insert({
      ...extra.nasPermission,
      requested_by: requesterId
    });

    if (nasError) throw nasError;
  }
}

export async function updatePortalRequest(
  supabase: SupabaseClient,
  requestNo: string,
  item: WorkItem,
  session?: TeacherSession
) {
  const { data: existing, error: existingError } = await supabase
    .from("ops_requests")
    .select("description")
    .eq("request_no", requestNo)
    .maybeSingle();

  if (existingError) throw existingError;

  const currentMeta = existing?.description ? stripPortalMeta(existing.description).meta : null;
  const meta = session ? buildPortalRequestMeta(session) : currentMeta;

  const { error } = await supabase
    .from("ops_requests")
    .update({
      module: item.module,
      title: item.title,
      description: meta ? injectPortalMeta(item.description ?? "", meta) : item.description ?? "",
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
    })
    .eq("request_no", requestNo);

  if (error) throw error;
}

export async function deletePortalRequest(supabase: SupabaseClient, requestNo: string) {
  const { error } = await supabase.from("ops_requests").delete().eq("request_no", requestNo);
  if (error) throw error;
}
