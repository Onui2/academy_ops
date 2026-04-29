import { NextResponse } from "next/server";

const BRANCHES_URL = process.env.FLIPEDU_BRANCHES_URL ?? "https://www.flipedu.net/api/v2/branches";

type BranchPayload = {
  id?: string | number;
  name?: string | null;
};

type BranchEnvelope = {
  value?: unknown;
};

type BranchItem = {
  value: string;
  label1: string;
  label2: string | null;
};

function normalizeItems(payload: unknown): BranchItem[] {
  const values =
    payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray((payload as BranchEnvelope).value)
      ? ((payload as BranchEnvelope).value as unknown[])
      : Array.isArray(payload)
        ? payload
        : [];

  return values
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const typedItem = item as BranchPayload;
      const value = String(typedItem.id ?? "").trim();
      const label1 = String(typedItem.name ?? "").trim();

      if (!value || !label1) return null;
      return { value, label1, label2: null };
    })
    .filter((item): item is BranchItem => Boolean(item));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sysSeq = url.searchParams.get("sysSeq")?.trim() ?? "";
  const brand = url.searchParams.get("brand")?.trim() ?? "";

  if (!sysSeq || !brand) {
    return NextResponse.json({ items: [] });
  }

  const upstreamUrl = new URL(BRANCHES_URL);
  upstreamUrl.searchParams.set("sys", sysSeq);
  upstreamUrl.searchParams.set("brand", brand);

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json, text/plain, */*"
      },
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ message: "지점 목록을 불러오지 못했습니다." }, { status: 502 });
  }

  let payload: unknown = null;

  try {
    payload = await upstreamResponse.json();
  } catch {
    payload = null;
  }

  if (!upstreamResponse.ok) {
    return NextResponse.json({ message: "지점 조회에 실패했습니다." }, { status: upstreamResponse.status });
  }

  return NextResponse.json({ items: normalizeItems(payload) });
}
