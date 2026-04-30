import type { SupabaseClient } from "@supabase/supabase-js";
import { HarnessError } from "@/lib/harness/harness-error";
import { runAuditHarness } from "@/lib/harness/audit/audit-harness";
import { listAuditLogsForRequest } from "@/lib/harness/audit/audit-log.service";
import { ensurePermission } from "@/lib/harness/permission/permission-harness";
import type { RequestPermissionSubject } from "@/lib/harness/permission/permission-checker";
import { runPolicyHarness } from "@/lib/harness/policy/policy-harness";
import { buildInitialSla, buildSlaSnapshot, applySlaPauseState } from "@/lib/harness/sla/sla-harness";
import { resolveLegacyStatusFromWorkflowStatus, resolveWorkflowStatus, runWorkflowHarness } from "@/lib/harness/workflow/workflow-harness";
import {
  canTeacherSessionAccessRow,
  dbRowToWorkItem,
  ensureTeacherPortalRequester,
  injectPortalMeta,
  stripPortalMeta
} from "@/lib/portal-request-service";
import type { AuthenticatedActor } from "@/types/user-role";
import type { RequestComment, RequestCommentCreatePayload, RequestCreatePayload, RequestDetail, RequestPriorityCode } from "@/types/request";
import type { RequestWorkflowStatus } from "@/types/workflow";
import type { WorkItem } from "@/types/ops";

type DbStatus = "received" | "reviewing" | "approval_pending" | "in_progress" | "completed" | "blocked";
type DbPriority = "low" | "normal" | "high" | "urgent";

type RequestRow = {
  id: string;
  request_no: string;
  module: string;
  title: string;
  description: string;
  status: DbStatus;
  priority: DbPriority;
  requester_id: string;
  owner_id: string | null;
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
  updated_at: string;
  request_category: string | null;
  sub_category: string | null;
  requester_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  assigned_department: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  workflow_status: string | null;
  sla_due_at: string | null;
  sla_paused_at: string | null;
  completed_at: string | null;
  request_metadata: Record<string, unknown> | null;
};

type ApprovalRow = {
  decision: "pending" | "approved" | "rejected";
};

type RequestCommentRow = {
  id: string;
  user_id: string;
  user_name: string;
  comment: string;
  visibility: "public" | "internal";
  created_at: string;
};

type AuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

const requestSelect =
  "id, request_no, module, title, description, status, priority, requester_id, owner_id, campus, due_date, vendor, amount_text, audit_note, approval_note, rejection_note, urgent_reason, urgent_impact, evidence_files, created_at, updated_at, request_category, sub_category, requester_name, branch_id, branch_name, assigned_department, assigned_user_id, assigned_user_name, workflow_status, sla_due_at, sla_paused_at, completed_at, request_metadata";

const legacyToDbStatus: Record<string, DbStatus> = {
  접수: "received",
  검토: "reviewing",
  "승인 대기": "approval_pending",
  진행: "in_progress",
  완료: "completed",
  보류: "blocked"
};

const dbToPriorityCode: Record<DbPriority, RequestPriorityCode> = {
  low: "LOW",
  normal: "NORMAL",
  high: "HIGH",
  urgent: "URGENT"
};

const legacyPriorityToDb: Record<string, DbPriority> = {
  낮음: "low",
  보통: "normal",
  높음: "high",
  긴급: "urgent"
};

function normalizeLegacyStatus(status?: string | null) {
  if (!status) return "접수";
  if (status === "접수" || status === "?묒닏") return "접수";
  if (status === "검토" || status === "寃??") return "검토";
  if (status === "승인 대기" || status === "?뱀씤 ?湲?") return "승인 대기";
  if (status === "진행" || status === "진행 중" || status === "吏꾪뻾" || status === "吏꾪뻾 以?") return "진행";
  if (status === "완료" || status === "?꾨즺") return "완료";
  if (status === "보류" || status === "蹂대쪟") return "보류";
  return status;
}

function normalizeLegacyPriority(priority?: string | null) {
  if (!priority) return "보통";
  if (priority === "긴급" || priority === "湲닿툒") return "긴급";
  if (priority === "높음" || priority === "?믪쓬") return "높음";
  if (priority === "낮음" || priority === "??쓬") return "낮음";
  return "보통";
}

function inferAssignedDepartment(category: string) {
  switch (category) {
    case "nas":
      return "INFRA_NAS";
    case "as":
      return "IT_SUPPORT";
    case "tablet":
      return "ASSET_MANAGEMENT";
    case "equipment":
    case "parts":
      return "GENERAL_PURCHASE";
    default:
      return "OPERATIONS_DESK";
  }
}

function parseDueDate(value?: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

function toPriorityCode(priority?: string | null): RequestPriorityCode {
  const normalized = normalizeLegacyPriority(priority);
  if (normalized === "긴급") return "URGENT";
  if (normalized === "높음") return "HIGH";
  if (normalized === "낮음") return "LOW";
  return "NORMAL";
}

function buildPermissionSubject(row: RequestRow): RequestPermissionSubject {
  const { meta } = stripPortalMeta(row.description);
  const workflowStatus = resolveWorkflowStatus(row.workflow_status, normalizeLegacyStatus(dbRowToWorkItem(row).status));

  return {
    requestNo: row.request_no,
    requesterUserId: row.requester_id,
    requesterUsername: meta?.username ?? null,
    branchId: row.branch_id ?? meta?.branch ?? null,
    brandId: meta?.brand ?? null,
    assignedUserId: row.assigned_user_id,
    workflowStatus
  };
}

function buildPortalMetaFromActor(actor: AuthenticatedActor) {
  return {
    source: "teacher_portal" as const,
    username: actor.username ?? actor.actorUserId,
    brand: actor.brandId ?? "",
    brandName: actor.brandName,
    branch: actor.branchId ?? "",
    branchName: actor.branchName,
    portalRole: actor.portalRole ?? "user"
  };
}

function withExtendedWorkItem(row: RequestRow) {
  const item = dbRowToWorkItem(row) as WorkItem & {
    workflowStatus?: RequestWorkflowStatus;
    slaDueAt?: string | null;
    slaPausedAt?: string | null;
    completedAt?: string | null;
    assignedDepartment?: string | null;
    assignedUserId?: string | null;
    assignedUserName?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };

  item.workflowStatus = resolveWorkflowStatus(row.workflow_status, normalizeLegacyStatus(item.status));
  item.slaDueAt = row.sla_due_at;
  item.slaPausedAt = row.sla_paused_at;
  item.completedAt = row.completed_at;
  item.assignedDepartment = row.assigned_department;
  item.assignedUserId = row.assigned_user_id;
  item.assignedUserName = row.assigned_user_name;
  item.createdAt = row.created_at;
  item.updatedAt = row.updated_at;
  return item;
}

function buildApprovalFlow(item: WorkItem, category: string, requiresApproval: boolean) {
  if (category === "nas") {
    return [
      { step_order: 1, approver_role: "nas_admin" },
      { step_order: 2, approver_role: "super_admin" }
    ];
  }

  if (requiresApproval) {
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

async function fetchRequestRowByNo(supabase: SupabaseClient, requestNo: string) {
  const { data, error } = await supabase
    .from("ops_requests")
    .select(requestSelect)
    .eq("request_no", requestNo)
    .maybeSingle();

  if (error) throw error;
  return (data as RequestRow | null) ?? null;
}

async function listCommentsByRequestId(supabase: SupabaseClient, requestId: string, includeInternal: boolean) {
  const { data, error } = await supabase
    .from("request_comments")
    .select("id, user_id, user_name, comment, visibility, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as RequestCommentRow[])
    .filter((row) => includeInternal || row.visibility === "public")
    .map<RequestComment>((row) => ({
      id: row.id,
      requestNo: requestId,
      userId: row.user_id,
      userName: row.user_name,
      comment: row.comment,
      visibility: row.visibility,
      createdAt: row.created_at
    }));
}

async function resolveApprovalState(supabase: SupabaseClient, requestId: string): Promise<RequestDetail["approvalState"]> {
  const { data, error } = await supabase
    .from("approvals")
    .select("decision")
    .eq("request_id", requestId)
    .order("step_order", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as ApprovalRow[];
  if (!rows.length) return "NOT_REQUIRED";
  if (rows.some((row) => row.decision === "rejected")) return "REJECTED";
  if (rows.every((row) => row.decision === "approved")) return "APPROVED";
  return "PENDING";
}

export async function listRequestsForActor(supabase: SupabaseClient, actor: AuthenticatedActor) {
  ensurePermission(actor, "request:list");

  const { data, error } = await supabase
    .from("ops_requests")
    .select(requestSelect)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = ((data ?? []) as RequestRow[]).filter((row) => {
    if (actor.isAdmin) return true;
    return canTeacherSessionAccessRow(
      {
        request_no: row.request_no,
        description: row.description,
        branch_id: row.branch_id
      } as RequestRow,
      {
        username: actor.username ?? "",
        brand: actor.brandId ?? "",
        brandName: actor.brandName,
        branch: actor.branchId ?? "",
        branchName: actor.branchName,
        portalRole: actor.portalRole ?? "user",
        type: "STAFF",
        authenticatedAt: "",
        profile: null
      }
    );
  });

  return rows.map(withExtendedWorkItem);
}

export async function createRequestWithHarness(
  supabase: SupabaseClient,
  actor: AuthenticatedActor,
  payload: RequestCreatePayload,
  auditContext: AuditContext
) {
  ensurePermission(actor, "request:create");

  const { category, requiresApproval } = runPolicyHarness(payload);
  const priorityCode = toPriorityCode(payload.item.priority);
  const workflowStatus: RequestWorkflowStatus = requiresApproval ? "APPROVAL_PENDING" : "SUBMITTED";
  const legacyStatus = resolveLegacyStatusFromWorkflowStatus(workflowStatus);
  const requesterId = await ensureTeacherPortalRequester(supabase);
  const createdAt = new Date();
  const slaDueAt = buildInitialSla(priorityCode, createdAt);
  const metadata = {
    ...(payload.metadata ?? {}),
    category
  };

  const insertPayload = {
    request_no: payload.item.id,
    module: payload.item.module,
    title: payload.item.title,
    description: injectPortalMeta(payload.item.description ?? "", buildPortalMetaFromActor(actor)),
    requester_id: requesterId,
    status: legacyToDbStatus[legacyStatus],
    priority: legacyPriorityToDb[normalizeLegacyPriority(payload.item.priority)],
    campus: payload.item.requester,
    due_date: parseDueDate(payload.item.requestedDate ?? payload.item.due),
    vendor: payload.item.vendor ?? null,
    amount_text: payload.item.amount ?? null,
    audit_note: payload.item.audit ?? "요청 생성",
    approval_note: payload.item.approvalNote ?? null,
    rejection_note: payload.item.rejectionNote ?? null,
    urgent_reason: payload.item.urgentReason ?? null,
    urgent_impact: payload.item.urgentImpact ?? null,
    evidence_files: payload.item.evidenceFiles ?? [],
    request_category: category,
    sub_category: typeof metadata.requestItem === "string" ? metadata.requestItem : null,
    requester_name: actor.actorName,
    branch_id: actor.branchId,
    branch_name: actor.branchName,
    assigned_department: inferAssignedDepartment(category),
    assigned_user_id: null,
    assigned_user_name: null,
    workflow_status: workflowStatus,
    sla_due_at: slaDueAt,
    sla_paused_at: null,
    completed_at: null,
    request_metadata: metadata
  };

  const { data, error } = await supabase.from("ops_requests").insert(insertPayload).select("id").single();
  if (error) throw error;

  const requestId = data?.id as string | undefined;
  if (!requestId) {
    throw new HarnessError("Request id was not returned after insert.", 500, "요청 저장에 실패했습니다.");
  }

  const approvalFlow = buildApprovalFlow(payload.item, category, requiresApproval);
  if (approvalFlow.length > 0) {
    const { error: approvalError } = await supabase.from("approvals").insert(
      approvalFlow.map((step) => ({
        request_id: requestId,
        step_order: step.step_order,
        approver_role: step.approver_role,
        decision: "pending"
      }))
    );

    if (approvalError) throw approvalError;
  }

  if (payload.nasPermission) {
    const { error: nasError } = await supabase.from("nas_permissions").insert({
      ...payload.nasPermission,
      requested_by: requesterId
    });

    if (nasError) throw nasError;
  }

  await runAuditHarness(supabase, {
    actorUserId: actor.actorUserId,
    actorName: actor.actorName,
    actionType: "REQUEST_CREATED",
    targetType: "request",
    targetId: payload.item.id,
    afterValue: {
      status: legacyStatus,
      workflowStatus,
      priority: normalizeLegacyPriority(payload.item.priority),
      category
    },
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    requestId,
    summary: `${payload.item.id} 요청이 접수되었습니다.`
  });

  return {
    requestNo: payload.item.id,
    requestId
  };
}

export async function getRequestDetailForActor(
  supabase: SupabaseClient,
  actor: AuthenticatedActor,
  requestNo: string,
  auditContext?: AuditContext
) {
  const row = await fetchRequestRowByNo(supabase, requestNo);
  if (!row) {
    return null;
  }

  const subject = buildPermissionSubject(row);
  ensurePermission(actor, "request:read", subject, "요청을 조회할 권한이 없습니다.");

  const comments = await listCommentsByRequestId(supabase, row.id, actor.isAdmin);
  const progressLogs = await listAuditLogsForRequest(supabase, row.id);
  const approvalState = await resolveApprovalState(supabase, row.id);
  const workItem = withExtendedWorkItem(row);
  const workflowStatus = resolveWorkflowStatus(row.workflow_status, normalizeLegacyStatus(workItem.status));

  if (auditContext) {
    await runAuditHarness(supabase, {
      actorUserId: actor.actorUserId,
      actorName: actor.actorName,
      actionType: "REQUEST_VIEWED",
      targetType: "request",
      targetId: requestNo,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      requestId: row.id,
      summary: `${requestNo} 요청 상세를 조회했습니다.`
    });
  }

  return {
    requestNo,
    workflowStatus,
    category: (row.request_category as RequestDetail["category"] | null) ?? "other",
    subCategory: row.sub_category,
    priorityCode: dbToPriorityCode[row.priority],
    requesterName: row.requester_name ?? workItem.requester,
    requesterUserId: row.requester_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    assignedDepartment: row.assigned_department,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    approvalState,
    metadata: row.request_metadata ?? {},
    workItem,
    sla: buildSlaSnapshot({
      dueAt: row.sla_due_at,
      pausedAt: row.sla_paused_at,
      completedAt: row.completed_at,
      workflowStatus
    }),
    comments,
    progressLogs,
    attachments: (row.evidence_files ?? []).map((fileName, index) => ({
      id: `${requestNo}-attachment-${index + 1}`,
      fileName,
      fileUrl: "",
      fileSize: 0,
      mimeType: "",
      uploadedBy: row.requester_name ?? actor.actorName,
      createdAt: row.created_at
    }))
  } satisfies RequestDetail;
}

export async function createRequestCommentForActor(
  supabase: SupabaseClient,
  actor: AuthenticatedActor,
  requestNo: string,
  payload: RequestCommentCreatePayload,
  auditContext: AuditContext
) {
  const row = await fetchRequestRowByNo(supabase, requestNo);
  if (!row) {
    throw new HarnessError("Request not found.", 404, "요청을 찾을 수 없습니다.");
  }

  const subject = buildPermissionSubject(row);
  ensurePermission(actor, "request:comment", subject, "댓글을 작성할 권한이 없습니다.");

  if (!payload.comment.trim()) {
    throw new HarnessError("Comment body is empty.", 422, "댓글 내용을 입력해 주세요.");
  }

  const visibility = payload.visibility ?? "public";
  const { data, error } = await supabase
    .from("request_comments")
    .insert({
      request_id: row.id,
      user_id: actor.actorUserId,
      user_name: actor.actorName,
      comment: payload.comment,
      visibility
    })
    .select("id, user_id, user_name, comment, visibility, created_at")
    .single();

  if (error) throw error;

  await runAuditHarness(supabase, {
    actorUserId: actor.actorUserId,
    actorName: actor.actorName,
    actionType: "REQUEST_COMMENT_CREATED",
    targetType: "comment",
    targetId: String(data?.id ?? ""),
    afterValue: {
      requestNo,
      visibility
    },
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    requestId: row.id,
    summary: `${requestNo} 요청에 댓글이 등록되었습니다.`
  });

  return {
    id: String(data?.id ?? ""),
    requestNo,
    userId: String(data?.user_id ?? actor.actorUserId),
    userName: String(data?.user_name ?? actor.actorName),
    comment: String(data?.comment ?? payload.comment),
    visibility,
    createdAt: String(data?.created_at ?? new Date().toISOString())
  } satisfies RequestComment;
}

export async function updateRequestFromPortalActor(
  supabase: SupabaseClient,
  actor: AuthenticatedActor,
  requestNo: string,
  item: WorkItem,
  auditContext: AuditContext
) {
  const row = await fetchRequestRowByNo(supabase, requestNo);
  if (!row) {
    throw new HarnessError("Request not found.", 404, "요청을 찾을 수 없습니다.");
  }

  const subject = buildPermissionSubject(row);
  const currentWorkflowStatus = resolveWorkflowStatus(row.workflow_status, normalizeLegacyStatus(dbRowToWorkItem(row).status));
  const nextLegacyStatus = normalizeLegacyStatus(item.status);
  const nextWorkflowStatus = resolveWorkflowStatus(undefined, nextLegacyStatus);
  const allowResubmit = !actor.isAdmin && currentWorkflowStatus === "REJECTED" && nextWorkflowStatus === "SUBMITTED";

  if (actor.isAdmin) {
    ensurePermission(actor, "request:status:update", subject, "요청을 수정할 권한이 없습니다.");
  } else if (!allowResubmit) {
    ensurePermission(actor, "request:read", subject, "요청을 수정할 권한이 없습니다.");
  }

  runWorkflowHarness(currentWorkflowStatus, nextWorkflowStatus, { allowResubmit });

  const changedAt = new Date().toISOString();
  const slaState = applySlaPauseState({
    currentStatus: currentWorkflowStatus,
    nextStatus: nextWorkflowStatus,
    dueAt: row.sla_due_at,
    pausedAt: row.sla_paused_at,
    changedAt
  });

  const updatedFields = {
    module: item.module,
    title: item.title,
    description: injectPortalMeta(item.description ?? "", buildPortalMetaFromActor(actor)),
    status: legacyToDbStatus[nextLegacyStatus],
    priority: legacyPriorityToDb[normalizeLegacyPriority(item.priority)],
    campus: item.requester,
    due_date: parseDueDate(item.requestedDate ?? item.due),
    vendor: item.vendor ?? null,
    amount_text: item.amount ?? null,
    audit_note: item.audit ?? row.audit_note,
    approval_note: item.approvalNote ?? null,
    rejection_note: item.rejectionNote ?? null,
    urgent_reason: item.urgentReason ?? null,
    urgent_impact: item.urgentImpact ?? null,
    evidence_files: item.evidenceFiles ?? [],
    workflow_status: nextWorkflowStatus,
    sla_due_at: slaState.dueAt,
    sla_paused_at: slaState.pausedAt,
    completed_at: nextWorkflowStatus === "COMPLETED" ? changedAt : row.completed_at
  };

  const { error } = await supabase.from("ops_requests").update(updatedFields).eq("request_no", requestNo);
  if (error) throw error;

  await runAuditHarness(supabase, {
    actorUserId: actor.actorUserId,
    actorName: actor.actorName,
    actionType: currentWorkflowStatus !== nextWorkflowStatus ? "REQUEST_STATUS_CHANGED" : "REQUEST_UPDATED",
    targetType: "request",
    targetId: requestNo,
    beforeValue: {
      status: resolveLegacyStatusFromWorkflowStatus(currentWorkflowStatus),
      workflowStatus: currentWorkflowStatus
    },
    afterValue: {
      status: nextLegacyStatus,
      workflowStatus: nextWorkflowStatus
    },
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    requestId: row.id,
    summary: currentWorkflowStatus !== nextWorkflowStatus ? `${requestNo} 요청 상태가 변경되었습니다.` : `${requestNo} 요청이 수정되었습니다.`
  });
}

export async function deleteRequestForActor(supabase: SupabaseClient, actor: AuthenticatedActor, requestNo: string, auditContext: AuditContext) {
  const row = await fetchRequestRowByNo(supabase, requestNo);
  if (!row) {
    throw new HarnessError("Request not found.", 404, "요청을 찾을 수 없습니다.");
  }

  const subject = buildPermissionSubject(row);
  ensurePermission(actor, "request:cancel", subject, "요청을 취소할 권한이 없습니다.");

  runWorkflowHarness(resolveWorkflowStatus(row.workflow_status, normalizeLegacyStatus(dbRowToWorkItem(row).status)), "CANCELED");

  const { error } = await supabase
    .from("ops_requests")
    .update({
      status: legacyToDbStatus["보류"],
      workflow_status: "CANCELED",
      completed_at: new Date().toISOString()
    })
    .eq("request_no", requestNo);

  if (error) throw error;

  await runAuditHarness(supabase, {
    actorUserId: actor.actorUserId,
    actorName: actor.actorName,
    actionType: "REQUEST_STATUS_CHANGED",
    targetType: "request",
    targetId: requestNo,
    afterValue: {
      status: "보류",
      workflowStatus: "CANCELED"
    },
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    requestId: row.id,
    summary: `${requestNo} 요청이 취소되었습니다.`
  });
}

export async function getDashboardMetricsForActor(supabase: SupabaseClient, actor: AuthenticatedActor, auditContext: AuditContext) {
  ensurePermission(actor, "dashboard:read", undefined, "대시보드를 조회할 권한이 없습니다.");

  const { data, error } = await supabase.from("ops_requests").select("status, workflow_status, sla_due_at, completed_at, created_at");
  if (error) throw error;

  const now = new Date();
  const rows = (data ?? []) as Array<{
    status: string;
    workflow_status: string | null;
    sla_due_at: string | null;
    completed_at: string | null;
    created_at: string;
  }>;

  const overdueCount = rows.filter((row) => {
    if (!row.sla_due_at || row.completed_at) return false;
    return new Date(row.sla_due_at).getTime() < now.getTime();
  }).length;

  const approvalPendingCount = rows.filter((row) => resolveWorkflowStatus(row.workflow_status, row.status) === "APPROVAL_PENDING").length;
  const inProgressCount = rows.filter((row) => {
    const workflow = resolveWorkflowStatus(row.workflow_status, row.status);
    return workflow === "IN_PROGRESS" || workflow === "ASSIGNED" || workflow === "WAITING_USER" || workflow === "WAITING_VENDOR";
  }).length;

  const todayLabel = now.toISOString().slice(0, 10);
  const todaySubmittedCount = rows.filter((row) => row.created_at.slice(0, 10) === todayLabel).length;

  await runAuditHarness(supabase, {
    actorUserId: actor.actorUserId,
    actorName: actor.actorName,
    actionType: "DASHBOARD_VIEWED",
    targetType: "dashboard",
    targetId: "metrics",
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    summary: "운영 대시보드 지표를 조회했습니다."
  });

  return {
    todaySubmittedCount,
    inProgressCount,
    approvalPendingCount,
    overdueCount
  };
}
