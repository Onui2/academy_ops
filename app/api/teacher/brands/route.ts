import { NextResponse } from "next/server";

const BRANDS_URL = process.env.FLIPEDU_BRANDS_URL ?? "https://dev.flipedu.net/api/v2/vllist/brands";

type ValueLabelItem = {
  value?: string;
  label1?: string;
  label2?: string | null;
};

function normalizeItems(payload: unknown) {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const value = String((item as ValueLabelItem).value ?? "").trim();
      const label1 = String((item as ValueLabelItem).label1 ?? "").trim();
      const label2Raw = (item as ValueLabelItem).label2;
      const label2 = typeof label2Raw === "string" && label2Raw.trim() ? label2Raw.trim() : null;

      if (!value || !label1) return null;
      return { value, label1, label2 };
    })
    .filter((item): item is { value: string; label1: string; label2: string | null } => Boolean(item));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("name")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ items: [] });
  }

  const upstreamUrl = new URL(BRANDS_URL);
  upstreamUrl.searchParams.set("brandNm", query);

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json, text/plain, */*"
      },
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ message: "학원 목록을 불러오지 못했습니다." }, { status: 502 });
  }

  let payload: unknown = null;

  try {
    payload = await upstreamResponse.json();
  } catch {
    payload = null;
  }

  if (!upstreamResponse.ok) {
    return NextResponse.json({ message: "학원 목록 조회에 실패했습니다." }, { status: upstreamResponse.status });
  }

  return NextResponse.json({ items: normalizeItems(payload) });
}
