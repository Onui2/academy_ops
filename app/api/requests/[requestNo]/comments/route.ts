import { NextResponse } from "next/server";
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
  try {
    const { requestNo } = await context.params;
    const security = runSecurityHarness(request);
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
    return errorResponse(error, "댓글을 불러오지 못했습니다.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ requestNo: string }> }
) {
  try {
    const body = (await request.json()) as RequestCommentCreatePayload;
    const { requestNo } = await context.params;
    const security = runSecurityHarness(request, body);
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ message: "서버 설정이 완료되지 않았습니다." }, { status: 503 });
    }

    const comment = await createRequestCommentForActor(supabase, security.actor, requestNo, security.payload ?? body, security.auditContext);
    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    return errorResponse(error, "댓글을 저장하지 못했습니다.");
  }
}
