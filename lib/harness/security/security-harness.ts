import { requireAuthenticatedActor, getRequestAuditContext } from "@/lib/harness/security/auth-guard";
import { sanitizeRecord } from "@/lib/harness/security/sanitize-input";
import { validateAttachmentNames } from "@/lib/harness/security/upload-policy";

export function runSecurityHarness<T extends { item?: { title?: string; description?: string; evidenceFiles?: string[] } }>(
  request: Request,
  payload?: T
) {
  const actor = requireAuthenticatedActor(request);
  const auditContext = getRequestAuditContext(request);
  const sanitizedPayload = payload ? sanitizeRecord(payload) : payload;

  if (sanitizedPayload?.item?.evidenceFiles?.length) {
    validateAttachmentNames(sanitizedPayload.item.evidenceFiles);
  }

  return {
    actor,
    auditContext,
    payload: sanitizedPayload
  };
}
