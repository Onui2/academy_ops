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
  rejectionNote?: string;
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

export type EquipmentPart = {
  id: string;
  category: "CPU" | "RAM" | "SSD" | "Mainboard" | "Power" | "Case" | "Graphic Card" | "Monitor" | "Keyboard" | "Mouse" | "Cables" | "Consumables" | "Etc";
  name: string;
  price: number;
  description: string;
  performanceNote: string;
  tier: "기본" | "업무용" | "고성능";
};

export type EquipmentConfig = {
  parts: Record<string, string>; // category -> partId
  totalPrice: number;
};

export type EquipmentPreset = {
  id: string;
  name: string;
  group: "강사용(기본)" | "행정용(표준)" | "전문가용(고성능)";
  parts: Record<string, string>;
};
