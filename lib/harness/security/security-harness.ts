import { requireAuthenticatedActor, getRequestAuditContext } from "@/lib/harness/security/auth-guard";
import { sanitizeRecord } from "@/lib/harness/security/sanitize-input";
import { validateAttachmentNames } from "@/lib/harness/security/upload-policy";

type SecurityPayloadShape = {
  item?: {
    title?: string;
    description?: string;
    evidenceFiles?: string[];
  };
};

export function runSecurityHarness<T>(
  request: Request,
  payload?: T
) {
  const actor = requireAuthenticatedActor(request);
  const auditContext = getRequestAuditContext(request);
  const sanitizedPayload = payload ? sanitizeRecord(payload) : payload;
  const attachmentNames = (sanitizedPayload as SecurityPayloadShape | undefined)?.item?.evidenceFiles;

  if (attachmentNames?.length) {
    validateAttachmentNames(attachmentNames);
  }

  return {
    actor,
    auditContext,
    payload: sanitizedPayload
  };
}
