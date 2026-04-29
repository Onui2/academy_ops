"use client";

import { TeacherAccessGate } from "@/components/teacher-access-gate";

export default function LoginPage() {
  return (
    <TeacherAccessGate portal="user">
      <div />
    </TeacherAccessGate>
  );
}
