import {
  Bot,
  Database,
  FileCheck2,
  HardDrive,
  Headphones,
  PackageCheck,
  ShieldCheck,
  Truck
} from "lucide-react";
import type { ModuleSummary, NasMetric, WorkItem } from "@/types/ops";

export const modules: ModuleSummary[] = [
  {
    name: "전산 장비 구매",
    description: "요청, 예산 검토, 최종 승인, 구매 완료",
    count: 12,
    icon: PackageCheck,
    tone: "bg-cyan-50 text-cyan-700"
  },
  {
    name: "A/S 자동화",
    description: "증상 분류, FAQ 확인, 업체 접수",
    count: 8,
    icon: Headphones,
    tone: "bg-rose-50 text-rose-700"
  },
  {
    name: "서블리 출판",
    description: "견적, 승인, 발주, 배송 추적",
    count: 5,
    icon: Truck,
    tone: "bg-amber-50 text-amber-700"
  },
  {
    name: "NAS 관리",
    description: "용량, 사용자, 권한, 접속 안내",
    count: 3,
    icon: HardDrive,
    tone: "bg-emerald-50 text-emerald-700"
  }
];

export const workItems: WorkItem[] = [
  {
    id: "AOH-1042",
    module: "전산 장비",
    title: "신규 강의실 노트북 12대 구매 승인",
    requester: "강남캠퍼스",
    owner: "경영지원",
    status: "승인 대기",
    priority: "긴급",
    due: "오늘",
    audit: "예산 코드 확인 완료",
    amount: "12대 / 18,000,000원",
    vendor: "TechOne"
  },
  {
    id: "AOH-1038",
    module: "A/S",
    title: "3층 빔프로젝터 화면 깜박임",
    requester: "송파캠퍼스",
    owner: "전산",
    status: "진행",
    priority: "높음",
    due: "내일",
    audit: "FAQ 실패 후 업체 티켓 생성",
    vendor: "AV Care"
  },
  {
    id: "AOH-1031",
    module: "서블리",
    title: "겨울 방학 홍보물 추가 인쇄",
    requester: "마케팅",
    owner: "구매",
    status: "검토",
    priority: "보통",
    due: "4월 30일",
    audit: "견적 2건 대기",
    amount: "1,500부"
  },
  {
    id: "AOH-1029",
    module: "NAS",
    title: "신규 직원 RaiDrive 접속 권한",
    requester: "인사",
    owner: "NAS 관리자",
    status: "접수",
    priority: "낮음",
    due: "5월 2일",
    audit: "MFA 확인 필요"
  }
];

export const nasMetrics: NasMetric[] = [
  {
    label: "공용 NAS 용량",
    value: "72%",
    detail: "2.1TB / 2.9TB 사용",
    health: "주의"
  },
  {
    label: "활성 사용자",
    value: "128",
    detail: "최근 24시간 접속 46명",
    health: "정상"
  },
  {
    label: "권한 변경",
    value: "7",
    detail: "승인 대기 2건",
    health: "정상"
  }
];

export const aiHarnessSteps = [
  { label: "Router", icon: Bot, text: "요청을 코드, 문서, DB, 보안, UI 작업으로 분류" },
  { label: "Builder", icon: Database, text: "Frontend, Backend, SQL, Infra 산출물 생성" },
  { label: "Reviewer", icon: FileCheck2, text: "버그, 성능, 보안, 유지보수성 검토" },
  { label: "Auditor", icon: ShieldCheck, text: "권한 누락, 감사 로그, 데이터 정합성 검증" }
];
