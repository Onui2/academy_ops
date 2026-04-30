import { HarnessError } from "@/lib/harness/harness-error";
import { shouldRequireApproval } from "@/lib/harness/policy/approval-policy";
import { collectPolicyViolations } from "@/lib/harness/policy/request-policy";
import type { RequestCreatePayload } from "@/types/request";

const fieldLabels: Record<string, string> = {
  requestItem: "요청 품목",
  quantity: "수량",
  requestedDate: "희망 완료일",
  userEmail: "계정",
  folderName: "폴더명",
  permissionLevel: "권한 수준",
  rentalEndDate: "반납 예정일",
  userName: "사용자명",
  issueMessage: "증상",
  currentModel: "장비명",
  location: "위치",
  detail: "상세 내용",
  urgentReason: "긴급 사유"
};

export function runPolicyHarness(payload: RequestCreatePayload) {
  const { category, violations } = collectPolicyViolations(payload);

  if (violations.length > 0) {
    const missingFields = violations.map((field) => fieldLabels[field] ?? field).join(", ");
    throw new HarnessError(`Policy validation failed: ${missingFields}`, 422, `필수 입력값을 확인해 주세요. 누락 항목: ${missingFields}`);
  }

  return {
    category,
    requiresApproval: shouldRequireApproval(payload)
  };
}
