"use client";

import { UserPortal } from "@/components/user-portal";
import { TeacherAccessGate } from "@/components/teacher-access-gate";

export function UserPortalEntry() {
  return (
    <TeacherAccessGate portal="user">
      <UserPortal />
    </TeacherAccessGate>
  );
}
