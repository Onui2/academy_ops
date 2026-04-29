import {
  Bot,
  ClipboardList,
  Database,
  FileCheck2,
  HardDrive,
  Headphones,
  PackageCheck,
  Search,
  ShieldCheck
} from "lucide-react";
import type { EquipmentPart, EquipmentPreset, ModuleSummary, WorkItem } from "@/types/ops";

export const partsCategories = [
  { id: "PC", name: "데스크톱 부품", icon: HardDrive, items: ["CPU", "RAM", "SSD", "Graphic Card", "Mainboard", "Power", "Case", "Monitor"] },
  { id: "Input", name: "주변기기", icon: Headphones, items: ["Keyboard", "Mouse"] },
  { id: "Cable", name: "케이블/허브", icon: Search, items: ["Cables"] },
  { id: "Supply", name: "사무 소모품", icon: ClipboardList, items: ["Consumables"] }
] as const;

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
    name: "NAS 관리",
    description: "용량, 사용자, 권한, 접속 안내",
    count: 3,
    icon: HardDrive,
    tone: "bg-emerald-50 text-emerald-700"
  },
  {
    name: "태블릿 렌탈",
    description: "대여 요청, 견적 확인, 배송 추적",
    count: 5,
    icon: PackageCheck,
    tone: "bg-amber-50 text-amber-700"
  },
  {
    name: "부품 구매",
    description: "키보드, 마우스, 소모품 간편 신청",
    count: 14,
    icon: Search,
    tone: "bg-slate-50 text-slate-700"
  }
];

export const workItems: WorkItem[] = [
  {
    id: "AOH-1042",
    module: "전산 장비",
    title: "신규 강의실 노트북 12대 구매 승인",
    requester: "학원(지점A)",
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
    requester: "학원(지점B)",
    owner: "전산",
    status: "진행",
    priority: "높음",
    due: "내일",
    audit: "FAQ 실패 후 업체 티켓 생성",
    vendor: "AV Care"
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

export const aiHarnessSteps = [
  { label: "Router", icon: Bot, text: "요청을 코드, 문서, DB, 보안, UI 작업으로 분류" },
  { label: "Builder", icon: Database, text: "Frontend, Backend, SQL, Infra 산출물 생성" },
  { label: "Reviewer", icon: FileCheck2, text: "버그, 성능, 보안, 유지보수성 검토" },
  { label: "Auditor", icon: ShieldCheck, text: "권한 누락, 감사 로그, 데이터 정합성 검증" }
];

export const equipmentParts: EquipmentPart[] = [
  // CPU
  { id: "cpu-2", category: "CPU", name: "AMD Ryzen 5 5600G", price: 165000, description: "표준 업무용", performanceNote: "내장 그래픽 포함이라 일반 학원 업무용 PC를 합리적으로 구성하기 좋습니다.", tier: "업무용" },
  { id: "cpu-3", category: "CPU", name: "AMD Ryzen 7 5700G", price: 245000, description: "고성능 업무용", performanceNote: "AM4 기반에서도 여유 있는 멀티태스킹과 내장 그래픽 성능을 제공합니다.", tier: "고성능" },
  
  // RAM
  { id: "ram-1", category: "RAM", name: "8GB DDR4", price: 35000, description: "최소 사양", performanceNote: "기본적인 업무 수행이 가능합니다.", tier: "기본" },
  { id: "ram-2", category: "RAM", name: "16GB DDR4", price: 65000, description: "표준 사양", performanceNote: "인터넷 창을 여러 개 띄워도 쾌적합니다.", tier: "업무용" },
  { id: "ram-3", category: "RAM", name: "32GB DDR4", price: 120000, description: "전문가용", performanceNote: "대용량 데이터와 그래픽 작업을 동시에 수행합니다.", tier: "고성능" },

  // SSD
  { id: "ssd-1", category: "SSD", name: "256GB NVMe", price: 50000, description: "저용량", performanceNote: "시스템 부팅과 기본 프로그램 운용에 적합합니다.", tier: "기본" },
  { id: "ssd-2", category: "SSD", name: "512GB NVMe", price: 85000, description: "표준 용량", performanceNote: "업무용 문서와 자료를 충분히 저장할 수 있습니다.", tier: "업무용" },
  { id: "ssd-3", category: "SSD", name: "1TB NVMe", price: 150000, description: "대용량", performanceNote: "영상과 사진등 대용량 파일을 넉넉하게 보관합니다.", tier: "고성능" },

  // Mainboard
  { id: "mb-1", category: "Mainboard", name: "A520M 보급형", price: 85000, description: "AM4 기본 안정성", performanceNote: "5600G 기반의 실속형 업무용 PC에 잘 맞는 보드입니다.", tier: "업무용" },
  { id: "mb-2", category: "Mainboard", name: "B550M 고급형", price: 145000, description: "AM4 확장 안정성", performanceNote: "5700G나 확장성 있는 업무용 구성에 균형이 좋습니다.", tier: "고성능" },

  // Power
  { id: "pwr-1", category: "Power", name: "500W 정격", price: 45000, description: "표준 전력", performanceNote: "일반 사무용 PC에 충분한 전력을 공급합니다.", tier: "업무용" },
  { id: "pwr-2", category: "Power", name: "750W 80PLUS Gold", price: 120000, description: "고효율 전력", performanceNote: "고성능 그래픽카드 장착 시 안정적인 전력을 공급합니다.", tier: "고성능" },

  // Graphic Card
  { id: "gpu-1", category: "Graphic Card", name: "내장 그래픽 (Radeon Graphics)", price: 0, description: "사무용", performanceNote: "일반적인 영상 시청과 문서 작업에 충분합니다.", tier: "기본" },
  { id: "gpu-2", category: "Graphic Card", name: "NVIDIA RTX 4060", price: 420000, description: "메인스트림", performanceNote: "배너 디자인, 영상 컷 편집이 수월해집니다.", tier: "업무용" },
  { id: "gpu-3", category: "Graphic Card", name: "NVIDIA RTX 4080", price: 1600000, description: "고성능 작업용", performanceNote: "3D 랜더링, 4K 영상 편집을 순식간에 끝냅니다.", tier: "고성능" },

  // Case
  { id: "case-1", category: "Case", name: "미니 타워 (심플)", price: 35000, description: "공간 절약", performanceNote: "데스크 위 공간 활용도가 높습니다.", tier: "업무용" },
  { id: "case-2", category: "Case", name: "미들 타워 (통풍형)", price: 65000, description: "우수한 쿨링", performanceNote: "내부 열 배출이 원활하여 장시간 사용 시 유리합니다.", tier: "고성능" },

  // Monitor
  { id: "mon-1", category: "Monitor", name: "24인치 FHD 75Hz", price: 140000, description: "표준 사무용", performanceNote: "가장 보편적인 업무용 사이즈입니다.", tier: "기본" },
  { id: "mon-2", category: "Monitor", name: "27인치 QHD 144Hz", price: 320000, description: "고해상도", performanceNote: "화면이 넓어 엑셀이나 문서를 두 개 띄우기 좋습니다.", tier: "업무용" },

  // Keyboard
  { id: "kb-1", category: "Keyboard", name: "무소음 무선 키보드", price: 35000, description: "행정 업무용", performanceNote: "조용한 사무실 환경에 적합합니다.", tier: "업무용" },
  { id: "kb-2", category: "Keyboard", name: "기계식 갈축 키보드", price: 85000, description: "고급 입력 장치", performanceNote: "장시간 타이핑 시 피로도가 적습니다.", tier: "고성능" },

  // Mouse
  { id: "ms-1", category: "Mouse", name: "무선 광마우스", price: 15000, description: "표준 사무용", performanceNote: "가볍고 끊김 없는 연결을 지원합니다.", tier: "기본" },
  { id: "ms-2", category: "Mouse", name: "버티컬 인체공학 마우스", price: 45000, description: "손목 보호용", performanceNote: "장시간 PC 사용 시 손목 부담을 줄여줍니다.", tier: "업무용" },

  // Cables/Adapters
  { id: "cb-1", category: "Cables", name: "HDMI to HDMI (2m)", price: 8000, description: "영상 연결용", performanceNote: "고해상도 4K 출력을 지원합니다.", tier: "기본" },
  { id: "cb-2", category: "Cables", name: "USB-C 멀티 허브 (7 in 1)", price: 55000, description: "노트북 확장용", performanceNote: "노트북에 다양한 주변기기를 한 번에 연결합니다.", tier: "업무용" },

  // Consumables
  { id: "con-1", category: "Consumables", name: "A4 복사용지 (1Box)", price: 25000, description: "표준 복사용지", performanceNote: "걸림이 적고 인쇄 품질이 우수합니다.", tier: "소모품" },
  { id: "con-2", category: "Consumables", name: "검정 토너 카트리지 (HP)", price: 95000, description: "정품 토너", performanceNote: "고품질 인쇄와 긴 수명을 보장합니다.", tier: "소모품" }
];

export const equipmentPresets: EquipmentPreset[] = [
  {
    id: "preset-basic",
    name: "강사용 수업 PC (기본)",
    group: "강사용(기본)",
    parts: {
      CPU: "cpu-2",
      RAM: "ram-1",
      SSD: "ssd-1",
      "Graphic Card": "gpu-1",
      Mainboard: "mb-1",
      Power: "pwr-1",
      Case: "case-1",
      Monitor: "mon-1"
    }
  },
  {
    id: "preset-standard",
    name: "데스크/관리자 PC (표준)",
    group: "행정용(표준)",
    parts: {
      CPU: "cpu-2",
      RAM: "ram-2",
      SSD: "ssd-2",
      "Graphic Card": "gpu-1",
      Mainboard: "mb-1",
      Power: "pwr-1",
      Case: "case-1",
      Monitor: "mon-1"
    }
  },
  {
    id: "preset-high",
    name: "전문 편집/대용량 엑셀 (고성능)",
    group: "전문가용(고성능)",
    parts: {
      CPU: "cpu-3",
      RAM: "ram-3",
      SSD: "ssd-3",
      "Graphic Card": "gpu-2",
      Mainboard: "mb-2",
      Power: "pwr-2",
      Case: "case-2",
      Monitor: "mon-2"
    }
  }
];
