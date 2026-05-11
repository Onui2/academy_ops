import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(request: Request) {
  const userId = await requireSuperAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  }

  const admin = await getAdminSupabase();
  if (!admin) return NextResponse.json({ message: "서버 설정 오류" }, { status: 500 });

  const { data, error } = await admin
    .from("webhook_configs")
    .select("id, label, url, enabled, events, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const masked = (data ?? []).map((row) => ({
    ...row,
    url: maskUrl(row.url as string)
  }));

  return NextResponse.json({ configs: masked });
}

export async function POST(request: Request) {
  const userId = await requireSuperAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  }

  const body = (await request.json()) as { label?: string; url?: string; secret?: string; events?: string[] };
  if (!body.url?.trim()) {
    return NextResponse.json({ message: "URL을 입력해 주세요." }, { status: 422 });
  }

  try {
    new URL(body.url.trim());
  } catch {
    return NextResponse.json({ message: "유효하지 않은 URL 형식입니다." }, { status: 422 });
  }

  const admin = await getAdminSupabase();
  if (!admin) return NextResponse.json({ message: "서버 설정 오류" }, { status: 500 });

  const { data, error } = await admin
    .from("webhook_configs")
    .insert({
      label: body.label?.trim() ?? "",
      url: body.url.trim(),
      secret: body.secret?.trim() || null,
      events: body.events ?? [],
      enabled: true,
      created_by: userId
    })
    .select("id, label, url, enabled, events, created_at")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ config: { ...data, url: maskUrl(data.url as string) } }, { status: 201 });
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.slice(0, 20)}***`;
  } catch {
    return url.slice(0, 20) + "***";
  }
}
