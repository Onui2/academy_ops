import { NextResponse } from "next/server";
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
  try {
    const security = runSecurityHarness(request);
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const metrics = await getDashboardMetricsForActor(supabase, security.actor, security.auditContext);
    return NextResponse.json(metrics);
  } catch (error) {
    return errorResponse(error, "대시보드 지표를 불러오지 못했습니다.");
  }
}
