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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireSuperAdmin(request);
  if (!userId) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const { id } = await context.params;
  const body = (await request.json()) as { label?: string; enabled?: boolean; events?: string[] };
  const admin = await getAdminSupabase();
  if (!admin) return NextResponse.json({ message: "서버 설정 오류" }, { status: 500 });

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined) updates.label = body.label;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.events !== undefined) updates.events = body.events;

  const { error } = await admin.from("webhook_configs").update(updates).eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireSuperAdmin(request);
  if (!userId) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });

  const { id } = await context.params;
  const admin = await getAdminSupabase();
  if (!admin) return NextResponse.json({ message: "서버 설정 오류" }, { status: 500 });

  const { error } = await admin.from("webhook_configs").delete().eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
