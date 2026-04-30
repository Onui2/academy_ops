import { NextResponse } from "next/server";
import { runAuditHarness } from "@/lib/harness/audit/audit-harness";
import { runSecurityHarness } from "@/lib/harness/security/security-harness";
import { isHarnessError } from "@/lib/harness/harness-error";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { getDashboardMetricsForActor } from "@/lib/services/request-hub-service";

function errorResponse(error: unknown, fallback: string) {
  if (isHarnessError(error)) {
    return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
  }

  console.error("[dashboard-metrics]", error);
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

    const metrics = await getDashboardMetricsForActor(supabase, security.actor, security.auditContext);
    return NextResponse.json(metrics);
  } catch (error) {
    if (actor && auditContext) {
      const supabase = createServiceSupabaseClient();
      if (supabase && isHarnessError(error) && error.status === 403) {
        await runAuditHarness(supabase, {
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          actionType: "DASHBOARD_ACCESS_DENIED",
          targetType: "dashboard",
          targetId: "metrics",
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          summary: "운영 대시보드 접근이 거부되었습니다."
        }).catch(() => undefined);
      }
    }

    return errorResponse(error, "대시보드 지표를 불러오지 못했습니다.");
  }
}
