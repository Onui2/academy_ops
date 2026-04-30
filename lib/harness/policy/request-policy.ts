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

function extractLabeledValue(description: string | undefined, labels: string[]) {
  if (!description) return "";

  for (const label of labels) {
    const pattern = new RegExp(`^${label}\\s*:\\s*(.+)$`, "im");
    const match = description.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return "";
}

function extractRequesterName(requester: string | undefined) {
  if (!requester) return "";
  const tokens = requester.trim().split(/\s+/);
  return tokens[tokens.length - 1] ?? "";
}

function resolveFieldValue(payload: RequestCreatePayload, field: string) {
  const metadata = payload.metadata ?? {};
  const description = payload.item.description ?? "";

  if (metadata[field] !== undefined && metadata[field] !== null && String(metadata[field]).trim() !== "") {
    return metadata[field];
  }

  switch (field) {
    case "requestItem":
      return extractLabeledValue(description, ["요청 품목", "요청 장비"]) || payload.item.title;
    case "quantity":
      return extractLabeledValue(description, ["필요 수량", "수량"]) || payload.item.amount?.match(/\d+/)?.[0] || "";
    case "requestedDate":
      return payload.item.requestedDate ?? (/^\d{4}-\d{2}-\d{2}$/.test(payload.item.due) ? payload.item.due : "");
    case "userEmail":
      return payload.nasPermission?.user_email ?? extractLabeledValue(description, ["사용자 이메일", "계정"]);
    case "folderName":
      return payload.nasPermission?.resource_name ?? extractLabeledValue(description, ["필요 폴더", "폴더명"]);
    case "permissionLevel":
      return payload.nasPermission?.permission_level ?? extractLabeledValue(description, ["권한 수준"]);
    case "rentalEndDate":
      return metadata.usageDuration ?? extractLabeledValue(description, ["반납 예정일", "사용 기간"]);
    case "userName":
      return extractLabeledValue(description, ["사용자명", "사용자"]) || extractRequesterName(payload.item.requester);
    case "issueMessage":
      return extractLabeledValue(description, ["증상/에러 문구", "증상"]);
    case "currentModel":
      return extractLabeledValue(description, ["기존 장비/모델", "장비명", "모델"]);
    case "location":
      return extractLabeledValue(description, ["설치 위치", "발생 위치", "위치"]);
    case "detail":
      return description.trim();
    case "urgentReason":
      return payload.item.urgentReason ?? extractLabeledValue(description, ["긴급 사유"]);
    default:
      return metadata[field];
  }
}

export function collectPolicyViolations(payload: RequestCreatePayload) {
  const category = inferCategoryFromPayload(payload);
  const violations: string[] = [];
  const requiredFields = categoryPolicyMap[category].requiredFields;

  requiredFields.forEach((field) => {
    const value = resolveFieldValue(payload, field);

    if (value === undefined || value === null || String(value).trim() === "") {
      violations.push(field);
    }
  });

  if (payload.item.priority === "긴급" && !String(resolveFieldValue(payload, "urgentReason") ?? "").trim()) {
    violations.push("urgentReason");
  }

  return { category, violations };
}
