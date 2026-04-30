import { categoryPolicyMap } from "@/lib/harness/policy/category-policy";
import type { RequestCategory, RequestCreatePayload } from "@/types/request";

export function inferCategoryFromPayload(payload: RequestCreatePayload): RequestCategory {
  const raw = payload.category ?? payload.metadata?.category;
  if (typeof raw === "string") {
    return raw as RequestCategory;
  }

  if (payload.item.module === "전산 장비") return "equipment";
  if (payload.item.module === "부품 구매") return "parts";
  if (payload.item.module === "A/S") return "as";
  if (payload.item.module === "NAS") return "nas";
  if (payload.item.module === "태블릿") return "tablet";
  return "other";
}

export function collectPolicyViolations(payload: RequestCreatePayload) {
  const category = inferCategoryFromPayload(payload);
  const metadata = payload.metadata ?? {};
  const violations: string[] = [];
  const requiredFields = categoryPolicyMap[category].requiredFields;

  requiredFields.forEach((field) => {
    const value =
      metadata[field] ??
      (field === "requestedDate" ? payload.item.requestedDate : undefined) ??
      (field === "requestItem" ? payload.item.module : undefined);

    if (value === undefined || value === null || String(value).trim() === "") {
      violations.push(field);
    }
  });

  if (payload.item.priority === "긴급" && !String(metadata.urgentReason ?? payload.item.urgentReason ?? "").trim()) {
    violations.push("urgentReason");
  }

  return { category, violations };
}
