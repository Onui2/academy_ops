import type { RequestCreatePayload } from "@/types/request";

function parseNumericAmount(amount: string | undefined) {
  if (!amount) return 0;
  const digits = amount.replace(/[^\d.]/g, "");
  return Number(digits || 0);
}

export function shouldRequireApproval(payload: RequestCreatePayload) {
  const metadata = payload.metadata ?? {};
  const quantity = Number(metadata.quantity ?? 0);
  const amountValue = Number(metadata.amountTotal ?? parseNumericAmount(payload.item.amount));
  return quantity >= 2 || amountValue >= 700000;
}
