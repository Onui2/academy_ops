"use client";

import { OpsConsole } from "@/components/ops-console";
import { TeacherAccessGate } from "@/components/teacher-access-gate";

export function AdminPortalEntry() {
  return (
    <TeacherAccessGate portal="admin">
      <OpsConsole />
    </TeacherAccessGate>
  );
}
