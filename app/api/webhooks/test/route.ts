import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTestWebhook } from "@/lib/services/webhook-service";

async function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireSuperAdmin(request: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) return null;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;

  const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;

  const admin = await getAdminSupabase();
  if (!admin) return null;

  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "super_admin") return null;

  return user.id;
}

export async function POST(request: Request) {
  const userId = await requireSuperAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  }

  const body = (await request.json()) as { url?: string; secret?: string };
  if (!body.url?.trim()) {
    return NextResponse.json({ message: "URL을 입력해 주세요." }, { status: 422 });
  }

  const result = await sendTestWebhook(body.url.trim(), body.secret?.trim() || null);

  return NextResponse.json({
    success: result.success,
    statusCode: result.statusCode,
    error: result.error
  });
}

export async function GET(request: Request) {
  const userId = await requireSuperAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  }

  const admin = await getAdminSupabase();
  if (!admin) return NextResponse.json({ message: "서버 설정 오류" }, { status: 500 });

  const { data, error } = await admin
    .from("webhook_delivery_logs")
    .select("id, config_id, event, request_no, url_masked, status_code, success, error_message, delivered_at")
    .order("delivered_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [] });
}
