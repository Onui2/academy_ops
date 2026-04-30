import { NextResponse } from "next/server";
import { runAuditHarness } from "@/lib/harness/audit/audit-harness";
import { runSecurityHarness } from "@/lib/harness/security/security-harness";
import { isHarnessError } from "@/lib/harness/harness-error";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { getRequestDetailForActor } from "@/lib/services/request-hub-service";

function errorResponse(error: unknown, fallback: string) {
  if (isHarnessError(error)) {
    return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
  }

  console.error("[request-detail]", error);
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

    const detail = await getRequestDetailForActor(supabase, security.actor, requestNo, security.auditContext);
    if (!detail) {
      return NextResponse.json({ message: "요청을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ item: detail });
  } catch (error) {
    if (actor && auditContext) {
      const supabase = createServiceSupabaseClient();
      if (supabase && isHarnessError(error) && error.status === 403) {
        const { requestNo } = await context.params;
        await runAuditHarness(supabase, {
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          actionType: "REQUEST_ACCESS_DENIED",
          targetType: "request",
          targetId: requestNo,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          summary: `${requestNo} 요청 상세 접근이 거부되었습니다.`
        }).catch(() => undefined);
      }
    }

    return errorResponse(error, "요청 상세를 불러오지 못했습니다.");
  }
}
