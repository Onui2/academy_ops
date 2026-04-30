import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/harness/audit/audit-log.service";
import type { AuditWriteInput } from "@/lib/harness/audit/audit-log.model";

export async function runAuditHarness(supabase: SupabaseClient, input: AuditWriteInput) {
  await writeAuditLog(supabase, input);
}
