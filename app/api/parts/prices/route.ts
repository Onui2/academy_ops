import { NextResponse } from "next/server";
import { equipmentParts } from "@/lib/ops-data";
import { fetchLivePricesForParts } from "@/lib/part-price-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids")?.trim() ?? "";
  const ids = idsParam ? idsParam.split(",").map((item) => item.trim()).filter(Boolean) : equipmentParts.map((part) => part.id);
  const selectedIds = new Set(ids);
  const selectedParts = equipmentParts.filter((part) => selectedIds.has(part.id));

  const payload = await fetchLivePricesForParts(selectedParts);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
