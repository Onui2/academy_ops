import { NextResponse } from "next/server";
import { runAuditHarness } from "@/lib/harness/audit/audit-harness";
import { runSecurityHarness } from "@/lib/harness/security/security-harness";
import { isHarnessError } from "@/lib/harness/harness-error";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { createRequestCommentForActor, getRequestDetailForActor } from "@/lib/services/request-hub-service";
import type { RequestCommentCreatePayload } from "@/types/request";

function errorResponse(error: unknown, fallback: string) {
  if (isHarnessError(error)) {
    return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
  }

  console.error("[request-comments]", error);
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function GET(
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

    const detail = await getRequestDetailForActor(supabase, security.actor, requestNo);
    if (!detail) {
      return NextResponse.json({ message: "요청을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ comments: detail.comments });
  } catch (error) {
    if (actor && auditContext) {
      const supabase = createServiceSupabaseClient();
      if (supabase && isHarnessError(error) && error.status === 403) {
        const { requestNo } = await context.params;
        await runAuditHarness(supabase, {
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          actionType: "REQUEST_ACCESS_DENIED",
          targetType: "comment",
          targetId: requestNo,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          summary: `${requestNo} 댓글 조회 접근이 거부되었습니다.`
        }).catch(() => undefined);
      }
    }

    return errorResponse(error, "댓글을 불러오지 못했습니다.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ requestNo: string }> }
) {
  let actor: ReturnType<typeof runSecurityHarness<RequestCommentCreatePayload>>["actor"] | null = null;
  let auditContext: ReturnType<typeof runSecurityHarness<RequestCommentCreatePayload>>["auditContext"] | null = null;

  try {
    const body = (await request.json()) as RequestCommentCreatePayload;
    const { requestNo } = await context.params;
    const security = runSecurityHarness(request, body);
    actor = security.actor;
    auditContext = security.auditContext;
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const comment = await createRequestCommentForActor(supabase, security.actor, requestNo, security.payload ?? body, security.auditContext);
    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    if (actor && auditContext) {
      const supabase = createServiceSupabaseClient();
      if (supabase && isHarnessError(error) && error.status === 403) {
        const { requestNo } = await context.params;
        await runAuditHarness(supabase, {
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          actionType: "REQUEST_ACCESS_DENIED",
          targetType: "comment",
          targetId: requestNo,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          summary: `${requestNo} 댓글 등록 접근이 거부되었습니다.`
        }).catch(() => undefined);
      }
    }

    return errorResponse(error, "댓글을 저장하지 못했습니다.");
  }
}
