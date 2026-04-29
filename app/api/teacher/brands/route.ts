import { NextResponse } from "next/server";

const BRANDS_URL = process.env.FLIPEDU_BRANDS_URL ?? "https://www.flipedu.net/api/v2/partners";

type PartnerPayload = {
  sysSeq?: string | number;
  brandNo?: string | number;
  brandNm?: string | null;
  name?: string | null;
};

type AcademyItem = {
  value: string;
  label1: string;
  label2: string | null;
  sysSeq: string;
};

function normalizeItems(payload: unknown, fallbackName: string): AcademyItem[] {
  const source = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];

  return source
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const typedItem = item as PartnerPayload;
      const value = String(typedItem.brandNo ?? "").trim();
      const label1 = String(typedItem.brandNm ?? typedItem.name ?? fallbackName).trim();
      const sysSeq = String(typedItem.sysSeq ?? "").trim();

      if (!value || !label1 || !sysSeq) return null;
      return { value, label1, label2: null, sysSeq };
    })
    .filter((item): item is AcademyItem => Boolean(item));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("name")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ items: [] });
  }

  const upstreamUrl = new URL(BRANDS_URL);
  upstreamUrl.searchParams.set("name", query);

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
    return NextResponse.json({ message: "학원 조회에 실패했습니다." }, { status: upstreamResponse.status });
  }

  return NextResponse.json({ items: normalizeItems(payload, query) });
}
