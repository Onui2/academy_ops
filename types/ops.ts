import type { LucideIcon } from "lucide-react";

export type UserRole =
  | "general"
  | "academy_admin"
  | "executive"
  | "super_admin"
  | "nas_admin";

export type WorkStatus =
  | "접수"
  | "검토"
  | "승인 대기"
  | "진행"
  | "완료"
  | "보류";

export type WorkPriority = "낮음" | "보통" | "높음" | "긴급";

export type WorkItem = {
  id: string;
  module: string;
  title: string;
  requester: string;
  owner: string;
  status: WorkStatus;
  priority: WorkPriority;
  due: string;
  audit: string;
  description?: string;
  amount?: string;
  vendor?: string;
  approvalStep?: number;
  source?: "user_portal" | "admin_console";
  approvedByAcademyAdmin?: boolean;
  approvalNote?: string;
  urgentReason?: string;
  urgentImpact?: string;
  evidenceFiles?: string[];
};

export type ModuleSummary = {
  name: string;
  description: string;
  count: number;
  icon: LucideIcon;
  tone: string;
};

export type NasMetric = {
  label: string;
  value: string;
  detail: string;
  health: "정상" | "주의" | "위험";
};
