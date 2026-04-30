import { NextResponse } from "next/server";
import { HarnessError, isHarnessError } from "@/lib/harness/harness-error";
import { runAuditHarness } from "@/lib/harness/audit/audit-harness";
import { runSecurityHarness } from "@/lib/harness/security/security-harness";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { deleteRequestForActor, updateRequestFromPortalActor } from "@/lib/services/request-hub-service";
import type { WorkItem } from "@/types/ops";

function errorResponse(error: unknown, fallback: string) {
  if (isHarnessError(error)) {
    return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
  }

  console.error("[portal-request-item]", error);
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestNo: string }> }
) {
  try {
    const body = (await request.json()) as { item?: WorkItem };
    if (!body.item) {
      throw new HarnessError("Missing request payload.", 400, "수정할 요청 데이터가 없습니다.");
    }

    const { requestNo } = await context.params;
    const security = runSecurityHarness(request, body);
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    await updateRequestFromPortalActor(supabase, security.actor, requestNo, body.item, security.auditContext);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "요청을 수정하지 못했습니다.");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ requestNo: string }> }
) {
  let actor: ReturnType<typeof runSecurityHarness>["actor"] | null = null;
  let auditContext: ReturnType<typeof runSecurityHarness>["auditContext"] | null = null;

  try {
    const { requestNo } = await context.params;
    const security = runSecurityHarness(request);
    actor = security.actor;
    auditContext = security.auditContext;

    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    await deleteRequestForActor(supabase, actor, requestNo, auditContext);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (actor && auditContext) {
      const supabase = createServiceSupabaseClient();
      if (supabase && isHarnessError(error) && error.status === 403) {
        await runAuditHarness(supabase, {
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          actionType: "REQUEST_ACCESS_DENIED",
          targetType: "request",
          targetId: "request-delete",
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          summary: "요청 삭제 접근이 거부되었습니다."
        }).catch(() => undefined);
      }
    }

    return errorResponse(error, "요청을 삭제하지 못했습니다.");
  }
}
