import { NextResponse } from "next/server";
import { isHarnessError } from "@/lib/harness/harness-error";
import { runAuditHarness } from "@/lib/harness/audit/audit-harness";
import { runSecurityHarness } from "@/lib/harness/security/security-harness";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { createRequestWithHarness, listRequestsForActor } from "@/lib/services/request-hub-service";
import type { RequestCreatePayload } from "@/types/request";

function errorResponse(error: unknown, fallback: string) {
  if (isHarnessError(error)) {
    return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
  }

  console.error("[portal-requests]", error);
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  let actor: ReturnType<typeof runSecurityHarness>["actor"] | null = null;
  let auditContext: ReturnType<typeof runSecurityHarness>["auditContext"] | null = null;

  try {
    const security = runSecurityHarness(request);
    actor = security.actor;
    auditContext = security.auditContext;

    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const items = await listRequestsForActor(supabase, actor);
    return NextResponse.json({ items });
  } catch (error) {
    if (actor && auditContext) {
      const supabase = createServiceSupabaseClient();
      if (supabase && isHarnessError(error) && error.status === 403) {
        await runAuditHarness(supabase, {
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          actionType: "REQUEST_ACCESS_DENIED",
          targetType: "request",
          targetId: "request-list",
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          summary: "요청 목록 접근이 거부되었습니다."
        }).catch(() => undefined);
      }
    }

    return errorResponse(error, "요청 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  let actor: ReturnType<typeof runSecurityHarness<RequestCreatePayload>>["actor"] | null = null;
  let auditContext: ReturnType<typeof runSecurityHarness<RequestCreatePayload>>["auditContext"] | null = null;

  try {
    const rawBody = (await request.json()) as RequestCreatePayload;
    const security = runSecurityHarness(request, rawBody);
    actor = security.actor;
    auditContext = security.auditContext;

    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const created = await createRequestWithHarness(supabase, actor, security.payload ?? rawBody, auditContext);
    return NextResponse.json({ ok: true, requestNo: created.requestNo });
  } catch (error) {
    if (actor && auditContext) {
      const supabase = createServiceSupabaseClient();
      if (supabase && isHarnessError(error) && error.status === 422) {
        await runAuditHarness(supabase, {
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          actionType: "POLICY_VIOLATION",
          targetType: "policy",
          targetId: "request-create",
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          summary: "정책 위반으로 요청 생성이 차단되었습니다."
        }).catch(() => undefined);
      }
    }

    return errorResponse(error, "요청을 저장하지 못했습니다.");
  }
}
