"use client";

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  HardDrive,
  HelpCircle,
  Laptop,
  LogOut,
  Megaphone,
  MemoryStick,
  Cpu,
  Database,
  Monitor as MonitorIcon,
  MousePointer2,
  Keyboard as KeyboardIcon,
  Usb,
  PackageCheck,
  Paperclip,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Wrench,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { fetchFaqs } from "@/lib/ops-repository";
import { diagnosisPatterns, getDiagnosis } from "@/lib/diagnosis-data";
import { equipmentParts, equipmentPresets, partsCategories } from "@/lib/ops-data";
import { buildDanawaSearchUrl, buildGmarketSearchUrl, resolveDanawaQuery, resolveGmarketQuery } from "@/lib/part-price-catalog";
import { useLivePartPrices } from "@/lib/use-live-part-prices";
import type { TeacherSession } from "@/lib/teacher-session";
import type { BasketItem, EquipmentPart, EquipmentPreset, WorkItem, WorkPriority } from "@/types/ops";
import type { User } from "@supabase/supabase-js";

type Category = "equipment" | "as" | "software" | "network" | "nas" | "tablet" | "parts" | "other";

type RequestDraft = {
  category: Category;
  requestItem?: string;
  title: string;
  academy: string;
  location: string;
  quantity: string;
  usagePurpose: string;
  currentModel: string;
  replacementStatus: string;
  issueStartedAt: string;
  issueMessage: string;
  attemptedAction: string;
  userEmail: string;
  folderName: string;
  permissionLevel: "" | "read" | "write" | "admin";
  tabletAction: "" | "신규 대여" | "연장" | "반납";
  usageDuration: string;
  impactScope: string;
  detail: string;
  urgency: "보통" | "빠름" | "긴급";
  urgentReason: string;
  urgentImpact: string;
  resubmitId?: string;
  requestedDate?: string;
};

function createEmptyDraft(category: Category = "equipment", requestItem = "데스크톱"): RequestDraft {
  return {
    category,
    requestItem: category === "equipment" ? requestItem : undefined,
    title: "",
    academy: "",
    location: "",
    quantity: "",
    usagePurpose: "",
    currentModel: "",
    replacementStatus: "",
    issueStartedAt: "",
    issueMessage: "",
    attemptedAction: "",
    userEmail: "",
    folderName: "",
    permissionLevel: "",
    tabletAction: "",
    usageDuration: "",
    impactScope: "",
    detail: "",
    urgency: "보통",
    urgentReason: "",
    urgentImpact: "",
    requestedDate: undefined
  };
}

function extractCleanName(rawName: string) {
  if (!rawName) return "직원";
  let name = rawName.replace(/[\{\[\(\<].*?[\}\]\)\>]/g, "");
  name = name.replace(/[^가-힣a-zA-Z]/g, "");
  return name || "직원";
}

const categories = [
  {
    id: "equipment" as const,
    title: "장비가 필요해요",
    desc: "노트북, 데스크톱, 소모품, 모니터, 네트워크/NAS",
    icon: Laptop,
    tone: "bg-blue-50 text-blue-700"
  },
  {
    id: "as" as const,
    title: "고장났어요",
    desc: "인터넷, 화면, 소리, 프린터 문제",
    icon: Wrench,
    tone: "bg-red-50 text-red-700"
  },
  {
    id: "nas" as const,
    title: "NAS 접속",
    desc: "RaiDrive, 폴더 권한, 계정 추가",
    icon: HardDrive,
    tone: "bg-emerald-50 text-emerald-700"
  },
  {
    id: "tablet" as const,
    title: "태블릿 렌탈",
    desc: "신규 대여, 연장, 반납 요청",
    icon: Laptop,
    tone: "bg-purple-50 text-purple-700"
  },
  {
    id: "other" as const,
    title: "잘 모르겠어요",
    desc: "운영팀이 분류해서 처리",
    icon: HelpCircle,
    tone: "bg-slate-100 text-slate-700"
  }
];

const adminStorageKey = "academy-ops-hub-state-v2";
const teacherLoginHintStorageKey = "flipedu-teacher-login-hint";
const teacherSessionPollMs = 15000;

function readAdminQueueFromStorage() {
  const raw = window.localStorage.getItem(adminStorageKey);
  if (!raw) return { items: [] as WorkItem[] };

  try {
    const parsed = JSON.parse(raw) as { items?: WorkItem[] };
    return { items: parsed.items ?? [] };
  } catch {
    window.localStorage.removeItem(adminStorageKey);
    return { items: [] as WorkItem[] };
  }
}

async function fetchPortalRequestHistory() {
  const response = await fetch("/api/portal/requests", {
    method: "GET",
    cache: "no-store"
  });

  const data = (await response.json()) as { items?: WorkItem[]; message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "요청 목록을 불러오지 못했습니다.");
  }

  return Array.isArray(data.items) ? data.items : [];
}

async function patchPortalRequest(requestNo: string, item: WorkItem) {
  const response = await fetch(`/api/portal/requests/${encodeURIComponent(requestNo)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ item })
  });

  const data = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "요청 수정에 실패했습니다.");
  }
}

async function createPortalRequestEntry(payload: {
  item: WorkItem;
  category: Category;
  metadata: Record<string, unknown>;
  nasPermission?: {
    user_email: string;
    resource_name: string;
    permission_level: string;
  };
}) {
  const response = await fetch("/api/portal/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "요청 접수에 실패했습니다.");
  }
}

const samples = [
  "3층 빔프로젝터 화면이 깜박여요",
  "신규 선생님 NAS 접속 권한이 필요해요",
  "강의실 노트북 2대가 더 필요해요",
  "모니터가 갑자기 안 나와요"
];

const asFaqCategories = [
  {
    id: "display",
    title: "자주 묻는 화면/모니터 문제",
    desc: "모니터, 화면 출력, 빔프로젝터 관련 질문",
    items: diagnosisPatterns.filter((item) => item.keywords.some((keyword) => ["모니터", "화면", "검은색", "빔", "프로젝터"].includes(keyword)))
  },
  {
    id: "network",
    title: "자주 묻는 인터넷 문제",
    desc: "와이파이, 인터넷, 네트워크 연결 질문",
    items: diagnosisPatterns.filter((item) => item.keywords.some((keyword) => ["인터넷", "네트워크", "와이파이"].includes(keyword)))
  },
  {
    id: "printer",
    title: "자주 묻는 프린터 문제",
    desc: "프린터, 인쇄, 복사기 관련 질문",
    items: diagnosisPatterns.filter((item) => item.keywords.some((keyword) => ["프린터", "인쇄", "복사기"].includes(keyword)))
  },
  {
    id: "slow",
    title: "자주 묻는 속도 문제",
    desc: "느림, 버벅임, 성능 저하 관련 질문",
    items: diagnosisPatterns.filter((item) => item.keywords.some((keyword) => ["느려요", "버벅임", "렉"].includes(keyword)))
  }
] as const;

type ToastItem = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
};

const portalWorkflowSteps = [
  {
    title: "1. 요청 접수",
    description: "학원, 장비, 증상, 긴급도를 정리해 운영팀으로 전달합니다."
  },
  {
    title: "2. 운영팀 분류",
    description: "장비 구매, A/S, NAS, 태블릿 중 담당 흐름으로 자동 분기됩니다."
  },
  {
    title: "3. 검토 및 보완",
    description: "정보가 부족하면 보류로 돌아오고, 충분하면 바로 담당자에게 넘어갑니다."
  },
  {
    title: "4. 처리 완료",
    description: "진행과 완료 상태는 내 접수 현황에서 계속 확인할 수 있습니다."
  }
] as const;

const categoryWorkflowGuide: Record<
  Category,
  {
    eta: string;
    checklist: string[];
    tips: string[];
  }
> = {
  equipment: {
    eta: "예산/수량 확인이 필요하면 승인 대기까지 1~2단계가 더 생길 수 있습니다.",
    checklist: ["필요 수량", "설치 장소", "언제부터 써야 하는지", "기존 장비 교체 여부"],
    tips: ["데스크톱은 예상 사양이나 용도를 적으면 견적 왕복이 줄어듭니다.", "소모품은 정확한 모델명까지 적으면 재확인이 빨라집니다."]
  },
  as: {
    eta: "자가 진단으로 안 풀리면 운영팀 분류 후 업체 또는 전산 담당으로 연결됩니다.",
    checklist: ["증상 발생 위치", "언제부터 문제인지", "화면/에러 문구", "이미 시도한 조치"],
    tips: ["같은 증상이 반복되면 사진이나 영상 한 장이 가장 도움이 됩니다.", "수업 직전 장애면 긴급 사유를 꼭 함께 적어주세요."]
  },
  nas: {
    eta: "권한 생성, 폴더 확인, 계정 안내 순서로 처리됩니다.",
    checklist: ["사용자 이메일", "필요한 폴더명", "읽기/쓰기 권한", "언제까지 필요한지"],
    tips: ["신규 입사자는 이름보다 이메일을 적는 편이 정확합니다.", "읽기만 필요한지 쓰기까지 필요한지 구분해 주세요."]
  },
  tablet: {
    eta: "대여 가능 재고와 사용 기간 확인 후 승인 또는 배정으로 넘어갑니다.",
    checklist: ["필요 대수", "사용 시작일", "사용 기간", "사용 목적"],
    tips: ["반납 일정이 보이면 배정 속도가 더 빨라집니다.", "단기 행사면 행사명도 같이 적어주세요."]
  },
  other: {
    eta: "운영팀이 먼저 분류한 뒤 적절한 담당에게 넘깁니다.",
    checklist: ["문제 요약", "장소", "필요 시점", "영향 범위"],
    tips: ["모르는 요청이라도 장소와 급한 이유만 있으면 분류 속도가 빨라집니다.", "업무 중단 여부를 적어두면 우선순위 판단에 도움이 됩니다."]
  },
  network: {
    eta: "현장 점검이나 공유기/회선 확인이 필요하면 A/S 흐름으로 연결됩니다.",
    checklist: ["발생 위치", "영향 인원", "유선/무선 여부", "반복 시간대"],
    tips: ["인터넷 끊김은 특정 교실인지 전체인지 꼭 적어주세요.", "가능하면 공유기 재부팅 여부를 함께 남겨주세요."]
  },
  parts: {
    eta: "부품 재고와 구매 여부 확인 후 운영팀 요청 큐로 올라갑니다.",
    checklist: ["필요 부품명", "수량", "사용 장비 모델", "예상 사용일"],
    tips: ["호환이 필요한 부품은 기존 장비 모델명을 같이 적어주세요.", "한 번에 필요한 품목을 함께 담으면 처리 횟수가 줄어듭니다."]
  },
  software: {
    eta: "계정 생성이나 라이선스 확인이 필요하면 운영팀 검토 후 배정됩니다.",
    checklist: ["프로그램명", "사용자", "필요 기능", "사용 시작일"],
    tips: ["기존 계정이 있는지 먼저 적어주면 중복 생성이 줄어듭니다.", "라이선스가 필요한 프로그램은 사용 인원도 함께 적어주세요."]
  }
};

export function UserPortal() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<"request-start" | "request-status" | "request-workflow" | "request-help">("request-start");
  const [draft, setDraft] = useState<RequestDraft>(createEmptyDraft("other"));
  const [submitted, setSubmitted] = useState<WorkItem[]>([]);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [supabase] = useState(() => createClient());
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [teacherSession, setTeacherSession] = useState<TeacherSession | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [asStep, setAsStep] = useState<"searching" | "form">("searching");
  const [symptomQuery, setSymptomQuery] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [diagnosis, setDiagnosis] = useState<{
    diagnosis: string;
    solution: string[];
    original: { id: string; keyword: string; category: string; answer: string; escalation_required: boolean };
  } | null>(null);
  const [partsBasket, setPartsBasket] = useState<BasketItem[]>([]);
  const [partQuery, setPartQuery] = useState("");
  const [selectedPartCategory, setSelectedPartCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [equipmentWizardStep, setEquipmentWizardStep] = useState(0);
  const [desktopBuildMode, setDesktopBuildMode] = useState<"preset" | "custom" | null>(null);
  const shouldLoadPartPrices =
    draft.category === "equipment" && (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기");

  // Load Korean public holidays for current + next year using date-holidays
  useEffect(() => {
    void (async () => {
      try {
        const { default: Holidays } = await import("date-holidays");
        const hd = new Holidays("KR");
        const years = [new Date().getFullYear(), new Date().getFullYear() + 1];
        const dateSet = new Set<string>();
        for (const year of years) {
          for (const h of hd.getHolidays(year)) {
            dateSet.add(h.date.slice(0, 10));
          }
        }
        setHolidays(dateSet);
      } catch {
        // gracefully degrade if package unavailable
      }
    })();
  }, []);

  useEffect(() => {
    if (!isComposerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isComposerOpen]);

  const allPartIds = useMemo(() => equipmentParts.map((part) => part.id), []);
  const { quotes: livePartQuotes, isLoading: isPartPriceLoading, lastCheckedAt, refresh: refreshPartPrices } = useLivePartPrices(allPartIds, shouldLoadPartPrices);
  const liveEquipmentParts = useMemo(
    () =>
      equipmentParts.map((part) => ({
        ...part,
        price: livePartQuotes[part.id]?.price ?? part.price
      })),
    [livePartQuotes]
  );
  const submittedQueue = useMemo(() => [...submitted].sort((left, right) => right.id.localeCompare(left.id)), [submitted]);
  const queueSummary = useMemo(() => {
    const needsAction = submittedQueue.filter((item) => normalizeStatus(item.status) === "보류").length;
    const inProgress = submittedQueue.filter((item) => {
      const status = normalizeStatus(item.status);
      return status === "진행" || status === "진행 중";
    }).length;
    const waiting = submittedQueue.filter((item) => {
      const status = normalizeStatus(item.status);
      return status === "접수" || status === "승인 대기" || status === "검토";
    }).length;
    const completed = submittedQueue.filter((item) => normalizeStatus(item.status) === "완료").length;

    return {
      total: submittedQueue.length,
      needsAction,
      inProgress,
      waiting,
      completed
    };
  }, [submittedQueue]);
  const highlightedItems = useMemo(
    () =>
      submittedQueue.filter((item) => {
        const status = normalizeStatus(item.status);
        return status === "보류" || status === "승인 대기" || status === "진행" || status === "진행 중";
      }),
    [submittedQueue]
  );
  const currentWorkflowGuide = categoryWorkflowGuide[draft.category];
  const profileName = useMemo(() => {
    const teacherName = teacherSession?.profile?.name;
    let raw = "직원";
    if (typeof teacherName === "string" && teacherName.trim()) raw = teacherName.trim();
    else if (teacherSession?.username?.trim()) raw = teacherSession.username.trim();
    else if (supabaseUser?.email?.trim()) raw = supabaseUser.email.trim();
    return extractCleanName(raw);
  }, [teacherSession, supabaseUser]);
  const profileSubtitle = useMemo(() => {
    if (teacherSession?.branchName?.trim()) return teacherSession.branchName.trim();
    if (teacherSession?.brandName?.trim()) return teacherSession.brandName.trim();
    return "Teacher Portal";
  }, [teacherSession]);
  const sessionAcademy = useMemo(() => {
    if (teacherSession?.branchName?.trim()) return teacherSession.branchName.trim();
    if (teacherSession?.brandName?.trim()) return teacherSession.brandName.trim();
    return "";
  }, [teacherSession]);

  const pushToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, type }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, type === "error" ? 5200 : 3600);
  }, []);

  const loadHistory = useCallback(async () => {
    if (teacherSession) {
      try {
        const rows = await fetchPortalRequestHistory();
        const localItems = readAdminQueueFromStorage().items;
        const merged = [...rows, ...localItems.filter((item) => !rows.some((row) => row.id === item.id))];
        setSubmitted(merged);
      } catch (_e) {
        console.error("Failed to load history from DB", _e);
        setSubmitted(readAdminQueueFromStorage().items);
      }
    } else if (teacherSession) {
      try {
        const response = await fetch("/api/portal/requests", {
          method: "GET",
          cache: "no-store"
        });

        const data = (await response.json()) as { items?: WorkItem[]; message?: string };
        if (!response.ok) {
          throw new Error(data.message ?? "teacher 요청 목록을 불러오지 못했습니다.");
        }

        const remoteItems = Array.isArray(data.items) ? data.items : [];
        const localItems = readAdminQueueFromStorage().items;
        const merged = [...remoteItems, ...localItems.filter((item) => !remoteItems.some((row) => row.id === item.id))];
        setSubmitted(merged);
      } catch (error) {
        console.error("Failed to load history from teacher API", error);
        setSubmitted(readAdminQueueFromStorage().items);
      }
    } else {
      setSubmitted(readAdminQueueFromStorage().items);
    }
  }, [teacherSession]);

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setSupabaseUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user ?? null);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;

    const loadTeacherSession = async () => {
      try {
        const response = await fetch("/api/teacher/session", {
          method: "GET",
          cache: "no-store"
        });

        if (!active) return;
        if (!response.ok) {
          setTeacherSession(null);
          return;
        }

        const data = (await response.json()) as { session?: TeacherSession };
        setTeacherSession(data.session ?? null);
      } catch {
        if (!active) return;
        setTeacherSession(null);
      }
    };

    void loadTeacherSession();

    return () => {
      active = false;
    };
  }, []);

  const [dbFaqs, setDbFaqs] = useState<{ id: string; keyword: string; category: string; answer: string; escalation_required: boolean }[]>([]);

  useEffect(() => {
    if (supabase && supabaseUser) {
      fetchFaqs(supabase).then(setDbFaqs).catch(console.error);
    }
  }, [supabase, supabaseUser]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!teacherSession) return;

    const syncHistory = () => {
      if (document.visibilityState === "visible") {
        void loadHistory();
      }
    };

    const intervalId = window.setInterval(syncHistory, teacherSessionPollMs);
    window.addEventListener("focus", syncHistory);
    document.addEventListener("visibilitychange", syncHistory);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncHistory);
      document.removeEventListener("visibilitychange", syncHistory);
    };
  }, [teacherSession, loadHistory]);

  useEffect(() => {
    if (!supabase || !supabaseUser) return;

    const channel = supabase
      .channel("user_portal_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ops_requests" },
        () => {
          void loadHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, supabaseUser, loadHistory]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === adminStorageKey) {
        void loadHistory();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadHistory]);

  useEffect(() => {
    if (draft.category === "as" && symptomQuery.length > 1) {
      const normalizedSymptom = symptomQuery.toLowerCase().replace(/\s/g, "");
      const match = dbFaqs.find((faq) => normalizedSymptom.includes(faq.keyword.toLowerCase().replace(/\s/g, "")));
      if (match) {
        setDiagnosis({
          diagnosis:
            match.category === "device"
              ? "영상 장비 장애"
              : match.category === "network"
                ? "네트워크 장애"
                : match.category === "nas"
                  ? "NAS 접속 이슈"
                  : "시스템 오류",
          solution: match.answer.split(/[,.]\s+/).filter(Boolean),
          original: match
        });
      } else {
        const fallback = getDiagnosis(symptomQuery);
        setDiagnosis(
          fallback
            ? {
                diagnosis: fallback.diagnosis,
                solution: fallback.solution,
                original: {
                  id: `fallback-${fallback.symptom}`,
                  keyword: fallback.symptom,
                  category: fallback.module,
                  answer: fallback.solution.join(", "),
                  escalation_required: true
                }
              }
            : null
        );
      }
    } else {
      setDiagnosis(null);
    }
  }, [symptomQuery, draft.category, dbFaqs]);

  const desktopPartCategories = partsCategories.find((category) => category.id === "PC")?.items ?? [];

  const filteredParts = useMemo(() => {
    let result = liveEquipmentParts;
    if (selectedPartCategory) {
      const catObj = partsCategories.find((c) => c.id === selectedPartCategory);
      if (catObj) {
        result = result.filter((p) => (catObj.items as readonly string[]).includes(p.category));
      }
    }
    if (selectedSubCategory) {
      result = result.filter((p) => p.category === selectedSubCategory);
    }
    if (partQuery) {
      result = result.filter(
        (p) => p.name.toLowerCase().includes(partQuery.toLowerCase()) || p.category.toLowerCase().includes(partQuery.toLowerCase())
      );
    }
    return result;
  }, [liveEquipmentParts, partQuery, selectedPartCategory, selectedSubCategory]);

  useEffect(() => {
    setEquipmentWizardStep(0);
    setDesktopBuildMode(null);
  }, [draft.category, draft.requestItem]);

  useEffect(() => {
    if (!sessionAcademy) return;
    setDraft((current) => (current.academy === sessionAcademy ? current : { ...current, academy: sessionAcademy }));
  }, [sessionAcademy]);

  useEffect(() => {
    setPartsBasket((current) =>
      current.map((item) => {
        const quote = item.partId ? livePartQuotes[item.partId] : null;
        if (!quote || item.price === quote.price) return item;
        return {
          ...item,
          price: quote.price,
          priceSource: quote.source,
          checkedAt: quote.checkedAt
        };
      })
    );
  }, [livePartQuotes]);

  const addToBasket = (part: EquipmentPart) => {
    const quote = livePartQuotes[part.id];
    setPartsBasket([
      ...partsBasket,
      {
        ...part,
        id: Date.now() + Math.random(),
        partId: part.id,
        priceSource: quote?.source,
        checkedAt: quote?.checkedAt
      }
    ]);
  };

  const removeFromBasket = (id: BasketItem["id"]) => {
    setPartsBasket(partsBasket.filter((p) => p.id !== id));
  };

  const applyPreset = (preset: EquipmentPreset) => {
    const newBasket: BasketItem[] = [];
    Object.values(preset.parts).forEach((partId) => {
      const part = liveEquipmentParts.find((p) => p.id === partId);
      if (part) {
        const quote = livePartQuotes[part.id];
        newBasket.push({
          ...part,
          id: Date.now() + Math.random(),
          partId: part.id,
          priceSource: quote?.source,
          checkedAt: quote?.checkedAt
        });
      }
    });
    setPartsBasket(newBasket);
    pushToast(`${preset.name} 구성을 불러왔습니다.`, "success");
  };

  const openDanawa = (partId: string, fallbackName: string) => {
    const quote = livePartQuotes[partId];
    const url = quote?.searchUrl ?? buildDanawaSearchUrl(resolveDanawaQuery(partId, fallbackName));
    window.open(url, "_blank");
  };

  const openGmarket = (partId: string, fallbackName: string) => {
    const quote = livePartQuotes[partId];
    const url = quote?.gmarketUrl ?? buildGmarketSearchUrl(resolveGmarketQuery(partId, fallbackName));
    window.open(url, "_blank");
  };

  // Calendar helpers
  const defaultRequestedDate = useMemo(() => {
    // default = 8 days from today, skip weekends & holidays
    const d = new Date();
    d.setDate(d.getDate() + 8);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    // advance if holiday or weekend
    let safety = 0;
    while (safety < 14) {
      const ds = fmt(d);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6 && !holidays.has(ds)) break;
      d.setDate(d.getDate() + 1);
      safety++;
    }
    return fmt(d);
  }, [holidays]);

  const isDateDisabled = (dateStr: string) => {
    const d = new Date(dateStr);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return true;
    if (holidays.has(dateStr)) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d <= today) return true;
    return false;
  };

  const calendarDays = useMemo(() => {
    const year = calendarYear;
    const month = calendarMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${year}-${pad(month + 1)}-${pad(d)}`);
    }
    return days;
  }, [calendarYear, calendarMonth]);
  const requestedDateWarning = useMemo(() => {
    const selectedDate = draft.requestedDate ?? defaultRequestedDate;
    if (!selectedDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(selectedDate);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      return "희망 완료일이 7일 이내라 부품 수급이나 일정 상황에 따라 처리일이 조정될 수 있습니다.";
    }

    return null;
  }, [defaultRequestedDate, draft.requestedDate]);

  const loadForResubmit = (item: WorkItem) => {
    const categoryMap: Record<string, Category> = {
      "전산 장비": "equipment",
      "부품 구매": "equipment",
      "A/S": "as",
      "NAS": "nas",
      "태블릿": "tablet",
      "기타": "other"
    };

    const nextCategory = categoryMap[item.module] ?? "other";
    const nextRequestItem =
      item.module === "전산 장비" || item.module === "부품 구매"
        ? extractRequestItem(item.description)
        : undefined;

    setDraft({
      ...createEmptyDraft(nextCategory, nextRequestItem ?? "데스크톱"),
      title: item.title,
      academy: item.requester,
      detail: item.description ?? "",
      urgency: item.priority === "긴급" ? "긴급" : item.priority === "높음" ? "빠름" : "보통",
      urgentReason: item.urgentReason ?? "",
      urgentImpact: item.urgentImpact ?? "",
      requestedDate: item.requestedDate,
      resubmitId: item.id
    });

    setActiveSection("request-start");
    setIsComposerOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const applyCategoryDraft = useCallback(
    (categoryId: Category) => {
      const newDraft = createEmptyDraft(categoryId, "?곗뒪?ы넲");
      newDraft.academy = draft.academy;
      newDraft.requestedDate = draft.requestedDate;
      newDraft.urgency = draft.urgency;

      if (categoryId === "equipment") {
        newDraft.requestItem = "?곗뒪?ы넲";
        setSelectedPartCategory("PC");
        setSelectedSubCategory("CPU");
        setDesktopBuildMode(null);
      } else {
        setSelectedPartCategory(null);
        setSelectedSubCategory(null);
      }

      if (categoryId === "as") {
        setAsStep("searching");
      }

      setDraft(newDraft);
    },
    [draft.academy, draft.requestedDate, draft.urgency]
  );

  const selected = categories.find((item) => item.id === draft.category) ?? categories[0];
  const SelectedIcon = selected.icon;
  const helperText = useMemo(() => {
    if (draft.category === "as") return "가능하면 장비명, 위치, 증상 사진, 언제부터 발생했는지를 적어주세요.";
    if (draft.category === "nas") return "사용자 이메일, 필요한 폴더, 읽기/쓰기 권한을 적어주세요.";
    if (draft.category === "equipment") {
      if (draft.requestItem === "데스크톱") return "PC 구성을 위한 부품을 선택하거나 기본 견적을 요청할 수 있습니다.";
      if (draft.requestItem === "소모품/주변기기") return "필요한 소모품이나 주변기기를 담아 요청하세요.";
      return "장비 종류를 선택해서 운영팀 요청 큐로 바로 접수할 수 있어요.";
    }
    if (draft.category === "tablet") return "신규 대여, 연장, 반납 중 필요한 요청 유형과 사용 용도를 적어주세요.";
    return "무엇이 필요한지만 편하게 적어주세요. 담당자가 분류합니다.";
  }, [draft.category, draft.requestItem]);
  const isEquipmentWizard =
    draft.category === "equipment" && (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기");
  const equipmentWizardSteps = useMemo(
    () =>
      draft.requestItem === "소모품/주변기기"
        ? [
            { title: "1. 품목 선택", description: "카테고리를 먼저 고르고 필요한 품목을 골라 담습니다." },
            { title: "2. 세부 선택", description: "검색과 가격 확인 후 장바구니를 구성합니다." },
            { title: "3. 요청 정보", description: "수량, 설치 위치, 사용 목적을 간단히 적습니다." },
            { title: "4. 최종 점검", description: "접수 전 내용을 한 번 더 확인하고 요청합니다." }
          ]
        : [
            { title: "1. 구성 방식", description: "추천 구성으로 시작할지, 직접 부품을 고를지 정합니다." },
            { title: "2. 장비 선택", description: "선택한 방식에 따라 견적안이나 부품을 구성합니다." },
            { title: "3. 요청 정보", description: "수량, 설치 위치, 사용 목적과 추가 요청을 적습니다." },
            { title: "4. 최종 점검", description: "장바구니와 요청 내용을 확인한 뒤 접수합니다." }
          ],
    [draft.requestItem]
  );
  const validationMessage = useMemo(() => {
    if (!draft.title.trim()) return "요청 제목을 입력해주세요.";
    if (!draft.academy.trim()) return "학원(지점)을 선택해주세요.";

    if (draft.category === "equipment") {
      if (!draft.requestItem?.trim()) return "장비 종류를 선택해주세요.";
      if (!draft.quantity.trim()) return "필요 수량을 입력해주세요.";
      if (!draft.location.trim()) return "설치 또는 사용 위치를 입력해주세요.";
      if (!draft.usagePurpose.trim()) return "장비 사용 목적을 입력해주세요.";
      if (!draft.detail.trim()) return "추가 요청 내용을 입력해주세요.";
    }

    if (draft.category === "as") {
      if (!draft.location.trim()) return "문제가 발생한 위치를 입력해주세요.";
      if (!draft.issueStartedAt.trim()) return "문제가 언제부터 발생했는지 입력해주세요.";
      if (!draft.issueMessage.trim()) return "증상 또는 에러 문구를 입력해주세요.";
      if (!draft.attemptedAction.trim()) return "이미 시도한 조치를 입력해주세요.";
      if (!draft.detail.trim()) return "상세 설명을 입력해주세요.";
    }

    if (draft.category === "nas") {
      if (!draft.userEmail.trim()) return "접속이 필요한 사용자 이메일을 입력해주세요.";
      if (!draft.folderName.trim()) return "필요한 폴더명 또는 공유 경로를 입력해주세요.";
      if (!draft.permissionLevel) return "필요 권한 수준을 선택해주세요.";
      if (!draft.detail.trim()) return "추가 요청 내용을 입력해주세요.";
    }

    if (draft.category === "tablet") {
      if (!draft.tabletAction) return "태블릿 요청 유형을 선택해주세요.";
      if (!draft.quantity.trim()) return "필요 대수를 입력해주세요.";
      if (!draft.location.trim()) return "사용 장소를 입력해주세요.";
      if (!draft.usageDuration.trim()) return "사용 기간을 입력해주세요.";
      if (!draft.usagePurpose.trim()) return "사용 목적을 입력해주세요.";
      if (!draft.detail.trim()) return "추가 요청 내용을 입력해주세요.";
    }

    if (draft.category === "other") {
      if (!draft.location.trim()) return "발생 위치 또는 필요한 장소를 입력해주세요.";
      if (!draft.impactScope.trim()) return "영향 범위를 입력해주세요.";
      if (!draft.detail.trim()) return "상세 내용을 입력해주세요.";
    }

    if (draft.urgency === "긴급" && !draft.urgentReason.trim()) return "긴급 사유를 입력해주세요.";
    if (draft.urgency === "긴급" && !draft.urgentImpact.trim()) return "영향 범위를 입력해주세요.";
    return null;
  }, [draft]);
  const priorityLabel: WorkPriority = draft.urgency === "긴급" ? "긴급" : draft.urgency === "빠름" ? "높음" : "보통";
  const priorityTone =
    priorityLabel === "긴급"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : priorityLabel === "높음"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
  const estimatedOwner = draft.category === "nas" ? "NAS 관리자" : draft.category === "as" ? "전산" : "학원 관리자";
  const defaultTitle = ["equipment", "as"].includes(draft.category) ? selected.title : `${selected.title} 요청`;

  const submit = async () => {
    if (validationMessage) {
      pushToast(validationMessage, "error");
      return;
    }
    const finalTitle = draft.title.trim() || defaultTitle;

    setIsLoading(true);

    const priority: WorkPriority = draft.urgency === "긴급" ? "긴급" : draft.urgency === "빠름" ? "높음" : "보통";

    const user = supabaseUser;

    const basketDesc = partsBasket.map((p) => `- ${p.name}: ${p.price.toLocaleString()}원`).join("\n");
    const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);

    const permissionLabel =
      draft.permissionLevel === "write" ? "읽기/쓰기" : draft.permissionLevel === "admin" ? "관리자" : draft.permissionLevel === "read" ? "읽기" : "";

    const description = [
      draft.category === "equipment" && draft.requestItem ? `요청 장비: ${draft.requestItem}` : "",
      draft.category === "equipment" ? `필요 수량: ${draft.quantity}\n설치 위치: ${draft.location}\n사용 목적: ${draft.usagePurpose}` : "",
      draft.category === "equipment" && draft.currentModel ? `기존 장비/모델: ${draft.currentModel}` : "",
      draft.category === "equipment" && draft.replacementStatus ? `교체 여부: ${draft.replacementStatus}` : "",
      draft.category === "as" ? `발생 위치: ${draft.location}\n문제 시작 시점: ${draft.issueStartedAt}\n증상/에러 문구: ${draft.issueMessage}\n이미 시도한 조치: ${draft.attemptedAction}${draft.impactScope ? `\n영향 범위: ${draft.impactScope}` : ""}` : "",
      draft.category === "nas" ? `사용자 이메일: ${draft.userEmail}\n필요 폴더: ${draft.folderName}\n권한 수준: ${permissionLabel || "미지정"}\n안내: 권한 요청 처리 후 접속 가이드가 함께 발송됩니다.` : "",
      draft.category === "tablet" ? `처리 유형: ${draft.tabletAction}\n필요 대수: ${draft.quantity}\n사용 장소: ${draft.location}\n사용 기간: ${draft.usageDuration}\n사용 목적: ${draft.usagePurpose}` : "",
      draft.category === "other" ? `발생 위치: ${draft.location}\n영향 범위: ${draft.impactScope}` : "",
      (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기") ? `요청 부품 목록:\n${basketDesc}\n\n합계: ${basketTotal.toLocaleString()}원` : "",
      draft.detail,
      files.length ? `\n첨부 파일: ${files.map((file) => file.name).join(", ")}` : ""
    ].filter(Boolean).join("\n");

    const amount = (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기") ? `${partsBasket.length}종 / ${basketTotal.toLocaleString()}원` : undefined;
    const requestMetadata = {
      category: draft.category,
      requestItem: draft.requestItem,
      quantity: draft.quantity,
      requestedDate: draft.requestedDate,
      userEmail: draft.userEmail,
      folderName: draft.folderName,
      permissionLevel: draft.permissionLevel,
      rentalEndDate: draft.usageDuration,
      userName: profileName,
      issueMessage: draft.issueMessage,
      currentModel: draft.currentModel,
      location: draft.location,
      detail: draft.detail,
      urgentReason: draft.urgentReason,
      urgentImpact: draft.urgentImpact
    };

    if (draft.resubmitId) {
      try {
        const existing = submitted.find(s => s.id === draft.resubmitId);
        if (existing) {
          const updated: WorkItem = {
            ...existing,
            title: finalTitle,
            requester: `${draft.academy} ${profileName}`.trim(),
            status: "접수", // Resubmitting resets to initial status
            priority,
            description,
            urgentReason: draft.urgency === "긴급" ? draft.urgentReason : undefined,
            urgentImpact: draft.urgency === "긴급" ? draft.urgentImpact : undefined,
            audit: `${existing.id} 보류 후 재접수됨`
          };

          if (teacherSession) {
            await patchPortalRequest(updated.id, updated);
          } else if (teacherSession) {
            const response = await fetch(`/api/portal/requests/${encodeURIComponent(updated.id)}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ item: updated })
            });

            const data = (await response.json()) as { message?: string };
            if (!response.ok) {
              throw new Error(data.message ?? "teacher 요청 재접수 저장에 실패했습니다.");
            }
          } else {
            updateInAdminQueue(updated);
          }
          pushToast("보류 요청을 다시 접수했습니다.", "success");
        }
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "재접수 중 오류가 발생했습니다.", "error");
        setIsLoading(false);
        return;
      }
    } else {
      const item: WorkItem = {
        id: makeRequestId(),
        module: categoryToModule(draft.category, draft.requestItem),
        title: finalTitle,
        requester: `${draft.academy} ${profileName}`.trim(),
        owner: "학원 관리자",
        status: "접수",
        priority,
        due: draft.requestedDate ?? (draft.urgency === "긴급" ? "오늘" : "신규"),
        audit: "사용자 포털 접수 - 학원 관리자 승인 대기",
        description,
        approvalStep: 0,
        source: "user_portal",
        approvedByAcademyAdmin: false,
        urgentReason: draft.urgency === "긴급" ? draft.urgentReason : undefined,
        urgentImpact: draft.urgency === "긴급" ? draft.urgentImpact : undefined,
        evidenceFiles: files.map((file) => file.name),
        amount,
        requestedDate: draft.requestedDate
      };

      try {
        if (teacherSession) {
          await createPortalRequestEntry({
            item,
            category: draft.category,
            metadata: requestMetadata,
            nasPermission:
              draft.category === "nas"
                ? {
                    user_email: draft.userEmail.trim() || user?.email || "unknown@academy.local",
                    resource_name: draft.folderName.trim() || finalTitle,
                    permission_level: draft.permissionLevel || "read"
                  }
                : undefined
          });
        } else if (teacherSession) {
          const response = await fetch("/api/portal/requests", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              item,
              category: draft.category,
              metadata: requestMetadata,
              nasPermission:
                draft.category === "nas"
                  ? {
                      user_email: draft.userEmail.trim() || "unknown@academy.local",
                      resource_name: draft.folderName.trim() || finalTitle,
                      permission_level: draft.permissionLevel || "read"
                    }
                  : undefined
            })
          });

          const data = (await response.json()) as { message?: string };
          if (!response.ok) {
            throw new Error(data.message ?? "teacher 요청 저장에 실패했습니다.");
          }
        } else {
          pushToAdminQueue(item);
        }
        pushToast(`${item.id} 요청이 접수되었습니다.`, "success");
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "요청 접수 중 오류가 발생했습니다.", "error");
        setIsLoading(false);
        return;
      }
    }

    await loadHistory();
    setActiveSection("request-status");
    setIsComposerOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setDraft(createEmptyDraft("equipment", "데스크톱"));
    setPartsBasket([]);
    setFiles([]);
    setAsStep("searching");
    setSymptomQuery("");
    setDiagnosis(null);
    setIsLoading(false);
  };

  const changeSection = useCallback(
    (sectionId: "request-start" | "request-status" | "request-workflow" | "request-help") => {
      setActiveSection(sectionId);
      setIsProfileOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    []
  );

  const handleProfileSignOut = useCallback(async () => {
    setIsProfileOpen(false);

    if (supabase) {
      await supabase.auth.signOut().catch(() => undefined);
    }

    await fetch("/api/teacher/session", {
      method: "DELETE"
    }).catch(() => undefined);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(teacherLoginHintStorageKey);
    }

    setTeacherSession(null);
    setSupabaseUser(null);
    router.replace("/");
    router.refresh();
  }, [router, supabase]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1560px] items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">경영지원 운영 허브</h1>
            <p className="text-sm text-slate-500">경영지원 통합 운영 시스템</p>
          </div>
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setIsProfileOpen((current) => !current)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-black text-slate-900">{profileName}</p>
                <p className="truncate text-xs text-slate-500">{profileSubtitle}</p>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isProfileOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            {isProfileOpen ? (
              <div className="absolute right-0 top-[calc(100%+12px)] z-20 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-black text-slate-900">{profileName}</p>
                  <p className="mt-1 text-xs text-slate-500">{profileSubtitle}</p>
                  {teacherSession?.portalRole === "admin" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileOpen(false);
                        router.push("/");
                      }}
                      className="mt-3 inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      관리자 화면으로
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void handleProfileSignOut()}
                  className="mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1560px] gap-6 px-4 py-6 lg:grid-cols-[230px_minmax(0,1fr)_260px]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Portal Menu</p>
            <h2 className="mt-2 text-lg font-black text-slate-900">사용자 업무 메뉴</h2>
            <div className="mt-4 grid gap-2">
              {[
                {
                  id: "request-start" as const,
                  title: "새 요청 작성",
                  desc: "장비, NAS, A/S 요청 접수",
                  count: categories.length,
                  icon: Megaphone
                },
                {
                  id: "request-status" as const,
                  title: "내 접수 현황",
                  desc: "보류, 진행, 완료 상태 확인",
                  count: queueSummary.total,
                  icon: ClipboardList
                },
                {
                  id: "request-workflow" as const,
                  title: "처리 흐름",
                  desc: "담당 배정과 승인 흐름 안내",
                  count: highlightedItems.length,
                  icon: Bot
                },
                {
                  id: "request-help" as const,
                  title: "빠른 해결",
                  desc: "보류 줄이는 작성 팁과 자가 해결",
                  count: samples.length,
                  icon: Search
                }
              ].map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => changeSection(item.id)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      active ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-black text-slate-900">{item.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-white text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                            {item.count}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">이번 주 알림</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <p>보완 필요: <span className="font-black text-rose-600">{queueSummary.needsAction}</span></p>
                <p>처리 중: <span className="font-black text-blue-700">{queueSummary.inProgress}</span></p>
                <p>완료: <span className="font-black text-emerald-600">{queueSummary.completed}</span></p>
              </div>
            </div>
          </div>
        </aside>

        <section className="grid content-start gap-6 self-start">
          <div className="overflow-x-auto lg:hidden">
            <div className="flex min-w-max gap-2 pb-1">
              {[
                { id: "request-start" as const, label: "새 요청" },
                { id: "request-status" as const, label: "내 접수 현황" },
                { id: "request-workflow" as const, label: "처리 흐름" },
                { id: "request-help" as const, label: "빠른 해결" }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => changeSection(item.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-bold ${
                    activeSection === item.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {activeSection === "request-start" ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">무엇을 도와드릴까요?</h2>
                  <p className="mt-1 text-sm text-gray-500">카테고리를 고른 뒤 `접수하기` 버튼으로 작성 패널을 열어 요청을 등록할 수 있습니다.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsComposerOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                  접수하기
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
                {categories.map((item) => {
                  const Icon = item.icon;
                  const active = draft.category === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => applyCategoryDraft(item.id)}
                      className={`rounded-lg border px-4 py-3 text-left transition ${active ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                    >
                      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${item.tone}`}>
                        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                      </div>
                      <p className="mt-2.5 whitespace-nowrap text-sm font-bold">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                현재 선택: <span className="font-black">{selected.title}</span>
                <span className="mx-2 text-blue-300">|</span>
                {draft.resubmitId ? "보류된 요청을 수정해서 다시 접수하는 상태입니다." : "선택한 카테고리를 기준으로 접수 패널이 열립니다."}
              </div>
            </div>
          ) : null}

          {activeSection === "request-status" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">My Request Board</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">내 접수 현황</h2>
                <p className="mt-1 text-sm text-slate-500">접수한 요청을 한 번에 보고, 보류된 건은 바로 수정해서 다시 올릴 수 있습니다.</p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-right">
                <p className="text-[11px] font-bold text-blue-600">현재 요청</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{submittedQueue.length}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-bold text-slate-400">접수/검토 중</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{queueSummary.waiting}</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
                <p className="text-[11px] font-bold text-blue-600">진행 중</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{queueSummary.inProgress}</p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4">
                <p className="text-[11px] font-bold text-rose-600">보완 필요</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{queueSummary.needsAction}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
                <p className="text-[11px] font-bold text-emerald-600">완료</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{queueSummary.completed}</p>
              </div>
            </div>

            {submittedQueue.length ? (
              <div className="mt-4 grid max-h-[360px] gap-3 overflow-y-auto pr-1">
                {submittedQueue.map((item) => {
                  const normalizedStatus = normalizeStatus(item.status);
                  const isRejected = normalizedStatus === "보류";
                  const isComplete = normalizedStatus === "완료";

                  return (
                    <div key={item.id} className={`rounded-xl border p-4 ${isRejected ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <CheckCircle2
                              className={`h-4 w-4 ${isComplete ? "text-emerald-600" : isRejected ? "text-rose-600" : "text-blue-600"}`}
                              aria-hidden="true"
                            />
                            <p className="truncate text-sm font-black text-slate-900">{item.title}</p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.id} · {normalizeModule(item.module)} · {normalizedStatus}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            isComplete
                              ? "bg-emerald-50 text-emerald-700"
                              : isRejected
                                ? "bg-rose-100 text-rose-700"
                                : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {normalizedStatus}
                        </span>
                      </div>

                      {item.rejectionNote && isRejected ? (
                        <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs font-medium text-rose-700">보류 사유: {item.rejectionNote}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>요청자: {item.requester}</span>
                        <span>담당: {item.owner}</span>
                        <span>우선순위: {normalizePriority(item.priority)}</span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/user/requests/${encodeURIComponent(item.id)}`)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          상세 보기
                        </button>
                        {isRejected ? (
                          <button
                            type="button"
                            onClick={() => loadForResubmit(item)}
                            className="inline-flex h-8 items-center justify-center rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                          >
                            내용 불러와서 다시 접수
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                아직 접수된 요청이 없습니다. 아래에서 카테고리를 선택해 바로 요청을 등록해보세요.
              </p>
            )}
          </section>
          ) : null}

          {activeSection === "request-start" && isComposerOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
            onClick={() => setIsComposerOpen(false)}
          >
          <section
            className="max-h-[calc(100vh-3rem)] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-gray-200 bg-white p-5 shadow-[0_30px_120px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Request Composer</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">{draft.resubmitId ? "요청 재접수" : "새 요청 접수"}</h2>
                <p className="mt-1 text-sm text-slate-500">긴 입력폼은 별도 패널에서 작성하고, 완료 후 바로 접수 현황으로 이동합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsComposerOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                aria-label="close request composer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-slate-50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Internal Request Form</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">경영지원 요청서</h2>
                  <p className="mt-2 text-sm text-slate-500">운영팀 검토와 승인 라우팅에 필요한 정보를 한 번에 정리하는 접수 문서입니다.</p>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-center shadow-sm ${priorityTone}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Processing</p>
                  <p className="mt-1 text-sm font-black">{priorityLabel}</p>
                  <p className="text-xs opacity-80">{draft.requestedDate ?? defaultRequestedDate}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${selected.tone}`}>
                <SelectedIcon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold">{selected.title}</h3>
                <p className="text-sm text-gray-500">{helperText}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {draft.category === "as" && asStep === "searching" ? (
                <div className="mt-2 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {asFaqCategories.map((category) => (
                      <article key={category.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
                            <Wrench className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <div>
                            <h3 className="font-black text-slate-900">{category.title}</h3>
                            <p className="text-xs text-slate-500">{category.desc}</p>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3">
                          {category.items.map((item) => (
                            <button
                              key={item.symptom}
                              onClick={() => setSymptomQuery(item.symptom)}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-blue-200 hover:bg-blue-50/40"
                            >
                              <p className="text-sm font-bold text-slate-800">{item.symptom}</p>
                              <p className="mt-1 text-xs text-slate-500">{item.solution[0]}</p>
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={symptomQuery}
                        onChange={(e) => setSymptomQuery(e.target.value)}
                        className="field pl-10"
                        placeholder="예: 모니터가 안 나와요, 인터넷이 끊겨요"
                      />
                    </div>

                    {diagnosis ? (
                      <div className="mt-4 rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 font-bold text-blue-800">
                          <Bot className="h-5 w-5" />
                          <span>자가 진단 결과: {diagnosis.diagnosis}</span>
                        </div>
                        <ul className="space-y-2">
                          {diagnosis.solution.map((step, i) => (
                            <li key={i} className="flex gap-2 text-sm text-slate-600">
                              <span className="font-bold text-blue-500">{i + 1}.</span>
                              {step}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-5 flex gap-2">
                          <button
                            onClick={() => {
                              setSymptomQuery("");
                              setDiagnosis(null);
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold hover:bg-slate-50"
                          >
                            해결되었습니다
                          </button>
                          <button
                            onClick={() => {
                              setAsStep("form");
                              setDraft({ ...draft, title: symptomQuery, detail: "FAQ/자가 진단을 시도했지만 해결되지 않았습니다." });
                            }}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                          >
                            해결 안 됨, 티켓 생성
                          </button>
                        </div>
                      </div>
                    ) : symptomQuery.length > 1 ? (
                      <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">
                        매칭되는 자가 해결 가이드가 없습니다.
                        <button
                          onClick={() => {
                            setAsStep("form");
                            setDraft({ ...draft, title: symptomQuery, detail: "FAQ 검색 결과 없음. 직접 점검이 필요합니다." });
                          }}
                          className="ml-2 font-bold text-blue-600 underline"
                        >
                          바로 문의하기
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <div className={`grid gap-3 ${draft.category === "equipment" ? "sm:grid-cols-[1fr_180px_160px]" : "sm:grid-cols-[1fr_160px]"}`}>
                    <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="field" placeholder={draft.category === "tablet" ? "요청 제목 (예: 태블릿 5대 신규 렌탈 요청)" : "요청 제목을 적어주세요"} />
                    {draft.category === "equipment" ? (
                      <select value={draft.requestItem ?? "데스크톱"} onChange={(event) => {
                        const val = event.target.value;
                        setDraft({ ...draft, requestItem: val });
                        if (val === "데스크톱") {
                          setSelectedPartCategory("PC");
                          setSelectedSubCategory("CPU");
                          setDesktopBuildMode(null);
                        } else {
                          setSelectedPartCategory(null);
                          setSelectedSubCategory(null);
                          setDesktopBuildMode(null);
                        }
                      }} className="field" aria-label="장비 종류">
                        <option>노트북</option>
                        <option>데스크톱</option>
                        <option>모니터</option>
                        <option>네트워크/NAS</option>
                        <option>소모품/주변기기</option>
                        <option>기타 장비</option>
                      </select>
                    ) : null}
                    {sessionAcademy ? (
                      <div className="field flex items-center bg-slate-100 text-slate-600">
                        접속 지점: <span className="ml-2 font-bold text-slate-900">{sessionAcademy}</span>
                      </div>
                    ) : (
                    <select
                      value={draft.academy}
                      onChange={(event) => setDraft({ ...draft, academy: event.target.value })}
                      className={`field ${!draft.academy ? "border-red-300 ring-1 ring-red-200" : ""}`}
                      aria-label="학원 (필수)"
                      required
                    >
                      <option value="" disabled>선택해주세요 *</option>
                      <option>통합학원(본사)</option>
                      <option>학원(지점A)</option>
                      <option>학원(지점B)</option>
                      <option>학원(지점C)</option>
                    </select>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">희망 완료일</p>
                    <p className="mt-1 text-sm text-slate-500">주말과 공휴일은 제외하고 요청 일정을 선택합니다.</p>
                    <div className="relative mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (!calendarOpen) {
                            const sel = draft.requestedDate ?? defaultRequestedDate;
                            const d = new Date(sel);
                            setCalendarYear(d.getFullYear());
                            setCalendarMonth(d.getMonth());
                            if (!draft.requestedDate) setDraft({ ...draft, requestedDate: sel });
                          }
                          setCalendarOpen((prev) => !prev);
                        }}
                        className="inline-flex h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <span>희망 완료일: <span className="text-blue-700">{draft.requestedDate ?? defaultRequestedDate}</span></span>
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      </button>
                      {requestedDateWarning ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          {requestedDateWarning}
                        </div>
                      ) : null}
                      {calendarOpen ? (
                        <div className="absolute left-0 top-14 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                          <div className="mb-3 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); }
                                else setCalendarMonth(m => m - 1);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100"
                            ><ChevronLeft className="h-4 w-4" /></button>
                            <span className="text-sm font-black text-slate-800">{calendarYear}년 {calendarMonth + 1}월</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); }
                                else setCalendarMonth(m => m + 1);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100"
                            ><ChevronRight className="h-4 w-4" /></button>
                          </div>
                          <div className="mb-1 grid grid-cols-7 text-center">
                            {["일","월","화","수","목","금","토"].map(d => (
                              <span key={d} className={`text-[10px] font-black pb-1 ${d === "일" ? "text-rose-500" : d === "토" ? "text-blue-500" : "text-slate-400"}`}>{d}</span>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-0.5">
                            {calendarDays.map((ds, i) => {
                              if (!ds) return <span key={`empty-${i}`} />;
                              const disabled = isDateDisabled(ds);
                              const selected = (draft.requestedDate ?? defaultRequestedDate) === ds;
                              const dow = new Date(ds).getDay();
                              const isHoliday = holidays.has(ds);
                              return (
                                <button
                                  key={ds}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => { setDraft({ ...draft, requestedDate: ds }); setCalendarOpen(false); }}
                                  className={`h-8 w-full rounded-lg text-xs font-bold transition-all ${
                                    selected
                                      ? "bg-blue-600 text-white shadow"
                                      : disabled
                                        ? "cursor-not-allowed text-slate-200"
                                        : isHoliday
                                          ? "text-rose-400 hover:bg-rose-50"
                                          : dow === 0
                                            ? "text-rose-500 hover:bg-rose-50"
                                            : dow === 6
                                              ? "text-blue-500 hover:bg-blue-50"
                                              : "text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  {Number(ds.slice(8))}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[10px] text-slate-400">• 과거, 금일, 주말, 공휴일은 선택불가</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {!isEquipmentWizard && draft.category === "equipment" ? (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                      <input
                        value={draft.quantity}
                        onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                        className="field bg-white"
                        placeholder="필요 수량 *"
                      />
                      <input
                        value={draft.location}
                        onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                        className="field bg-white"
                        placeholder="설치/사용 위치 *"
                      />
                      <input
                        value={draft.usagePurpose}
                        onChange={(event) => setDraft({ ...draft, usagePurpose: event.target.value })}
                        className="field bg-white"
                        placeholder="사용 목적 *"
                      />
                      <input
                        value={draft.currentModel}
                        onChange={(event) => setDraft({ ...draft, currentModel: event.target.value })}
                        className="field bg-white"
                        placeholder="기존 장비 모델명 또는 희망 사양"
                      />
                      <select
                        value={draft.replacementStatus}
                        onChange={(event) => setDraft({ ...draft, replacementStatus: event.target.value })}
                        className="field bg-white sm:col-span-2"
                      >
                        <option value="">교체 여부 선택</option>
                        <option value="신규 설치">신규 설치</option>
                        <option value="기존 장비 교체">기존 장비 교체</option>
                        <option value="추가 증설">추가 증설</option>
                      </select>
                    </div>
                  ) : null}

                  {isEquipmentWizard ? (
                    <div className="mt-2 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 animate-in fade-in slide-in-from-top-4 duration-300">
                      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white p-4">
                        <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                          {draft.requestItem === "데스크톱" ? (
                            <>
                              <HardDrive className="h-4 w-4 text-blue-600" />
                              PC 부품 사양 구성
                            </>
                          ) : (
                            <>
                              <PackageCheck className="h-4 w-4 text-blue-600" />
                              소모품 및 주변기기 선택
                            </>
                          )}
                        </div>
                        <div className="grid gap-3 lg:grid-cols-4">
                          {equipmentWizardSteps.map((step, index) => {
                            const active = equipmentWizardStep === index;
                            const done = equipmentWizardStep > index;
                            return (
                              <div
                                key={step.title}
                                className={`rounded-2xl border px-4 py-3 transition-all ${
                                  active
                                    ? "border-blue-600 bg-blue-50 shadow-sm"
                                    : done
                                      ? "border-emerald-200 bg-emerald-50"
                                      : "border-slate-200 bg-white"
                                }`}
                              >
                                <p className={`text-xs font-black ${active ? "text-blue-700" : done ? "text-emerald-700" : "text-slate-500"}`}>{step.title}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {equipmentWizardStep === 0 ? (
                        draft.requestItem === "데스크톱" ? (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => setDesktopBuildMode("preset")}
                                className={`rounded-2xl border p-5 text-left transition-all ${
                                  desktopBuildMode === "preset" ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm"
                                }`}
                              >
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Option 1</p>
                                <h4 className="mt-2 text-lg font-black text-slate-900">추천 구성으로 시작</h4>
                                <p className="mt-2 text-sm leading-6 text-slate-500">다음 단계에서 미리 정리된 추천안 중 하나를 선택합니다.</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDesktopBuildMode("custom")}
                                className={`rounded-2xl border p-5 text-left transition-all ${
                                  desktopBuildMode === "custom" ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm"
                                }`}
                              >
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Option 2</p>
                                <h4 className="mt-2 text-lg font-black text-slate-900">직접 부품 선택</h4>
                                <p className="mt-2 text-sm leading-6 text-slate-500">다음 단계에서 CPU, RAM, SSD, 모니터를 직접 고릅니다.</p>
                              </button>
                            </div>
                            <div className="hidden rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                              처음에는 추천 구성을 고르고, 필요하면 다음 단계에서 CPU·RAM·SSD 같은 부품을 세부 조정할 수 있습니다.
                            </div>
                            {false && desktopBuildMode === "preset" ? (
                            <div className="grid gap-3 sm:grid-cols-3">
                              {equipmentPresets.map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => applyPreset(preset)}
                                  className="group relative flex flex-col items-start overflow-hidden rounded-2xl border border-blue-100 bg-white p-5 text-left transition-all hover:border-blue-400 hover:shadow-lg"
                                >
                                  <div className="absolute right-0 top-0 -mr-4 -mt-4 h-16 w-16 rounded-full bg-blue-50 transition-transform group-hover:scale-150" />
                                  <span className="relative rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-black text-white uppercase">{preset.group}</span>
                                  <h5 className="relative mt-3 text-sm font-black text-slate-800">{preset.name}</h5>
                                  <p className="relative mt-1 text-[11px] font-medium text-slate-400">추천 조합을 한 번에 장바구니에 담습니다.</p>
                                  <div className="relative mt-4 flex items-center gap-1.5 text-xs font-bold text-blue-600">
                                    바로 구성하기 <ArrowRight className="h-3.5 w-3.5" />
                                  </div>
                                </button>
                              ))}
                            </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                              처음에는 필요한 품목군만 간단히 정하고, 다음 단계에서 검색 후 담아주시면 됩니다.
                            </div>
                            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
                              {partsCategories.map((cat) => {
                                const active = selectedPartCategory === cat.id;
                                const Icon = cat.icon;
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setSelectedPartCategory(active ? null : cat.id)}
                                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 transition-all ${
                                      active ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"
                                    }`}
                                  >
                                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <span className={`text-[11px] font-black tracking-tight ${active ? "text-blue-900" : "text-slate-600"}`}>{cat.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )
                      ) : null}

                      {equipmentWizardStep === 1 ? (
                        <div className="space-y-4">
                          {draft.requestItem === "?곗뒪?ы넲" && desktopBuildMode === "preset" ? (
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                                추천 구성 방식으로 선택했습니다. 아래 견적안 중 하나를 골라 장바구니에 담아주세요.
                              </div>
                              <div className="grid gap-3 sm:grid-cols-3">
                                {equipmentPresets.map((preset) => (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className="group relative flex flex-col items-start overflow-hidden rounded-2xl border border-blue-100 bg-white p-5 text-left transition-all hover:border-blue-400 hover:shadow-lg"
                                  >
                                    <div className="absolute right-0 top-0 -mr-4 -mt-4 h-16 w-16 rounded-full bg-blue-50 transition-transform group-hover:scale-150" />
                                    <span className="relative rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-black text-white uppercase">{preset.group}</span>
                                    <h5 className="relative mt-3 text-sm font-black text-slate-800">{preset.name}</h5>
                                    <p className="relative mt-1 text-[11px] font-medium text-slate-400">선택 즉시 장바구니가 추천 조합으로 채워집니다.</p>
                                    <div className="relative mt-4 flex items-center gap-1.5 text-xs font-bold text-blue-600">
                                      이 구성 선택 <ArrowRight className="h-3.5 w-3.5" />
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {draft.requestItem !== "?곗뒪?ы넲" || desktopBuildMode !== "preset" ? (
                            <>
                          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
                            {draft.requestItem === "데스크톱"
                              ? desktopPartCategories.map((sub) => {
                                  const active = selectedSubCategory === sub;
                                  let Icon = Cpu;
                                  if (sub === "RAM") Icon = MemoryStick;
                                  if (sub === "SSD") Icon = Database;
                                  if (sub === "Monitor") Icon = MonitorIcon;
                                  if ((sub as string) === "Keyboard") Icon = KeyboardIcon;
                                  if ((sub as string) === "Mouse") Icon = MousePointer2;
                                  if ((sub as string) === "Cables") Icon = Usb;
                                  if (["Power", "Mainboard", "Case", "Graphic Card"].includes(sub as string)) Icon = HardDrive;

                                  return (
                                    <button
                                      key={sub}
                                      type="button"
                                      onClick={() => setSelectedSubCategory(active ? null : sub)}
                                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-all ${
                                        active ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"
                                      }`}
                                    >
                                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                        <Icon className="h-4 w-4" />
                                      </div>
                                      <span className={`text-[10px] font-black uppercase tracking-tight ${active ? "text-blue-900" : "text-slate-600"}`}>{sub}</span>
                                    </button>
                                  );
                                })
                              : partsCategories.map((cat) => {
                                  const active = selectedPartCategory === cat.id;
                                  const Icon = cat.icon;
                                  return (
                                    <button
                                      key={cat.id}
                                      type="button"
                                      onClick={() => setSelectedPartCategory(active ? null : cat.id)}
                                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-all ${
                                        active ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"
                                      }`}
                                    >
                                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                        <Icon className="h-4 w-4" />
                                      </div>
                                      <span className={`text-[10px] font-black uppercase tracking-tight ${active ? "text-blue-900" : "text-slate-600"}`}>{cat.name}</span>
                                    </button>
                                  );
                                })}
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                              <div className="relative min-w-[220px] flex-1">
                                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                  value={partQuery}
                                  onChange={(event) => setPartQuery(event.target.value)}
                                  className="field h-11 pl-12 pr-4 text-sm"
                                  placeholder="모델명, 제조사, 부품명 검색"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => void refreshPartPrices()}
                                disabled={isPartPriceLoading}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${isPartPriceLoading ? "animate-spin" : ""}`} />
                                {isPartPriceLoading ? "가격 조회 중..." : "가격 새로고침"}
                              </button>
                            </div>
                            <p className="mb-4 text-[11px] font-medium text-slate-500">
                              {lastCheckedAt
                                ? `마지막 가격 확인 ${new Date(lastCheckedAt).toLocaleTimeString("ko-KR", {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}. 최신 기준가를 함께 검토할 수 있습니다.`
                                : "가격 정보를 불러오면 최신 기준가를 함께 검토할 수 있습니다."}
                            </p>

                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {filteredParts.map((part) => (
                                <article key={part.id} className="flex flex-col rounded-xl border border-slate-100 bg-slate-50 p-3 transition-all hover:border-blue-200 hover:shadow-sm">
                                  <div className="flex items-start justify-between">
                                    <span className="rounded-lg bg-white px-2 py-0.5 text-[9px] font-black text-slate-500 uppercase">{part.category}</span>
                                    <div className="text-right">
                                      <span className="block text-xs font-bold text-slate-900">{part.price.toLocaleString()}원</span>
                                      <span className="block text-[10px] font-bold text-emerald-600">{livePartQuotes[part.id]?.status === "live" ? "실시간가" : "기준가"}</span>
                                    </div>
                                  </div>
                                  <h4 className="mt-1.5 grow text-xs font-bold text-slate-800 line-clamp-1">{part.name}</h4>
                                  <div className="mt-2.5 flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openDanawa(part.id, part.name)}
                                      className="flex h-7 flex-1 items-center justify-center rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50"
                                    >
                                      다나와
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openGmarket(part.id, part.name)}
                                      className="flex h-7 flex-1 items-center justify-center rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50"
                                    >
                                      지마켓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => addToBasket(part)}
                                      className="flex h-7 flex-1 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-bold text-white hover:bg-blue-700"
                                    >
                                      담기
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-black text-slate-900">현재 장바구니</h4>
                              <span className="text-xs font-bold text-blue-700">{partsBasket.length}개 선택</span>
                            </div>
                            {partsBasket.length ? (
                              <div className="mt-3 space-y-2">
                                {partsBasket.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/70 bg-white px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-slate-800">{p.name}</p>
                                      <p className="text-xs text-slate-500">{p.category}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-black text-blue-700">{p.price.toLocaleString()}원</span>
                                      <button type="button" onClick={() => removeFromBasket(p.id)} className="text-slate-300 transition-colors hover:text-rose-500">
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-slate-500">아직 담은 항목이 없습니다. 필요한 부품이나 주변기기를 선택해 주세요.</p>
                            )}
                          </div>
                            </>
                          ) : null}
                        </div>
                      ) : null}

                      {equipmentWizardStep === 2 ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                            <input
                              value={draft.quantity}
                              onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                              className="field bg-slate-50"
                              placeholder="필요 수량 *"
                            />
                            <input
                              value={draft.location}
                              onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                              className="field bg-slate-50"
                              placeholder="설치/사용 위치 *"
                            />
                            <input
                              value={draft.usagePurpose}
                              onChange={(event) => setDraft({ ...draft, usagePurpose: event.target.value })}
                              className="field bg-slate-50"
                              placeholder="사용 목적 *"
                            />
                            <input
                              value={draft.currentModel}
                              onChange={(event) => setDraft({ ...draft, currentModel: event.target.value })}
                              className="field bg-slate-50"
                              placeholder="기존 장비 모델명 또는 현재 사양"
                            />
                            <select
                              value={draft.replacementStatus}
                              onChange={(event) => setDraft({ ...draft, replacementStatus: event.target.value })}
                              className="field bg-slate-50 sm:col-span-2"
                            >
                              <option value="">교체 여부 선택</option>
                              <option value="신규 설치">신규 설치</option>
                              <option value="기존 장비 교체">기존 장비 교체</option>
                              <option value="추가 증설">추가 증설</option>
                            </select>
                          </div>
                          <textarea
                            value={draft.detail}
                            onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
                            className="field min-h-[120px] resize-y"
                            placeholder="모델명, 선호 브랜드, 예산 범위, 설치 장소 특이사항 등 추가 요청을 적어주세요."
                          />
                        </div>
                      ) : null}

                      {equipmentWizardStep === 3 ? (
                        <div className="space-y-4">
                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Final Review</p>
                              <h4 className="mt-2 text-lg font-black text-slate-900">최종 점검 후 요청 접수</h4>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                  <p className="text-[11px] font-bold text-slate-400">요청 종류</p>
                                  <p className="mt-1 text-sm font-black text-slate-900">{draft.requestItem}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                  <p className="text-[11px] font-bold text-slate-400">희망 일정</p>
                                  <p className="mt-1 text-sm font-black text-slate-900">{draft.requestedDate ?? defaultRequestedDate}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                  <p className="text-[11px] font-bold text-slate-400">수량</p>
                                  <p className="mt-1 text-sm font-black text-slate-900">{draft.quantity || "-"}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                  <p className="text-[11px] font-bold text-slate-400">설치 위치</p>
                                  <p className="mt-1 text-sm font-black text-slate-900">{draft.location || "-"}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:col-span-2">
                                  <p className="text-[11px] font-bold text-slate-400">사용 목적</p>
                                  <p className="mt-1 text-sm font-black text-slate-900">{draft.usagePurpose || "-"}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:col-span-2">
                                  <p className="text-[11px] font-bold text-slate-400">추가 요청</p>
                                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{draft.detail || "추가 요청 없음"}</p>
                                </div>
                              </div>
                              {validationMessage ? (
                                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                  접수 전에 확인할 항목: {validationMessage}
                                </div>
                              ) : (
                                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                  필수 입력이 채워졌습니다. 아래에서 요청을 접수하면 됩니다.
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-black text-slate-900">선택 항목</h4>
                                <span className="text-xs font-bold text-blue-700">{partsBasket.length}개</span>
                              </div>
                              <div className="mt-3 space-y-2">
                                {partsBasket.length ? (
                                  partsBasket.map((p) => (
                                    <div key={p.id} className="rounded-xl border border-white/70 bg-white px-3 py-2">
                                      <p className="text-sm font-bold text-slate-800">{p.name}</p>
                                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                                        <span>{p.category}</span>
                                        <span className="font-bold text-blue-700">{p.price.toLocaleString()}원</span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="rounded-xl border border-dashed border-blue-200 bg-white/80 px-3 py-4 text-sm text-slate-500">
                                    아직 장바구니에 담긴 항목이 없습니다. 기본 견적 요청만 접수해도 괜찮습니다.
                                  </div>
                                )}
                              </div>
                              <div className="mt-4 flex items-center justify-between border-t border-blue-100 pt-4">
                                <span className="text-sm font-bold text-slate-600">예상 합계</span>
                                <span className="text-lg font-black text-blue-700">{partsBasket.reduce((sum, p) => sum + p.price, 0).toLocaleString()}원</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-2">
                        <button
                          type="button"
                          onClick={() => setEquipmentWizardStep((current) => Math.max(current - 1, 0))}
                          disabled={equipmentWizardStep === 0}
                          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          이전
                        </button>
                        <div className="text-xs text-slate-500">
                          Step {equipmentWizardStep + 1} / {equipmentWizardSteps.length}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEquipmentWizardStep((current) => Math.min(current + 1, equipmentWizardSteps.length - 1))}
                          disabled={
                            equipmentWizardStep === equipmentWizardSteps.length - 1 ||
                            (draft.requestItem === "데스크톱" && equipmentWizardStep === 0 && desktopBuildMode === null)
                          }
                          className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          다음
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {draft.category === "as" ? (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                      <input
                        value={draft.location}
                        onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                        className="field bg-white"
                        placeholder="문제 발생 위치 *"
                      />
                      <input
                        value={draft.issueStartedAt}
                        onChange={(event) => setDraft({ ...draft, issueStartedAt: event.target.value })}
                        className="field bg-white"
                        placeholder="언제부터 문제인지 *"
                      />
                      <input
                        value={draft.issueMessage}
                        onChange={(event) => setDraft({ ...draft, issueMessage: event.target.value })}
                        className="field bg-white sm:col-span-2"
                        placeholder="증상/에러 문구 *"
                      />
                      <input
                        value={draft.attemptedAction}
                        onChange={(event) => setDraft({ ...draft, attemptedAction: event.target.value })}
                        className="field bg-white sm:col-span-2"
                        placeholder="이미 시도한 조치 *"
                      />
                      <input
                        value={draft.impactScope}
                        onChange={(event) => setDraft({ ...draft, impactScope: event.target.value })}
                        className="field bg-white sm:col-span-2"
                        placeholder="영향 범위 (예: 2개 강의실 수업 차질)"
                      />
                    </div>
                  ) : null}

                  {draft.category === "nas" ? (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                      <input
                        value={draft.userEmail}
                        onChange={(event) => setDraft({ ...draft, userEmail: event.target.value })}
                        className="field bg-white"
                        placeholder="사용자 이메일 *"
                      />
                      <input
                        value={draft.folderName}
                        onChange={(event) => setDraft({ ...draft, folderName: event.target.value })}
                        className="field bg-white"
                        placeholder="필요 폴더명/공유 경로 *"
                      />
                      <select
                        value={draft.permissionLevel}
                        onChange={(event) => setDraft({ ...draft, permissionLevel: event.target.value as RequestDraft["permissionLevel"] })}
                        className="field bg-white"
                      >
                        <option value="">권한 수준 선택 *</option>
                        <option value="read">읽기</option>
                        <option value="write">읽기/쓰기</option>
                        <option value="admin">관리자</option>
                      </select>
                      <input
                        value={draft.location}
                        onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                        className="field bg-white"
                        placeholder="사용 부서/위치"
                      />
                    </div>
                  ) : null}

                  {draft.category === "tablet" ? (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                      <select
                        value={draft.tabletAction}
                        onChange={(event) => setDraft({ ...draft, tabletAction: event.target.value as RequestDraft["tabletAction"] })}
                        className="field bg-white"
                      >
                        <option value="">요청 유형 선택 *</option>
                        <option value="신규 대여">신규 대여</option>
                        <option value="연장">연장</option>
                        <option value="반납">반납</option>
                      </select>
                      <input
                        value={draft.quantity}
                        onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                        className="field bg-white"
                        placeholder="필요 대수 *"
                      />
                      <input
                        value={draft.location}
                        onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                        className="field bg-white"
                        placeholder="사용 장소 *"
                      />
                      <input
                        value={draft.usageDuration}
                        onChange={(event) => setDraft({ ...draft, usageDuration: event.target.value })}
                        className="field bg-white"
                        placeholder="사용 기간 *"
                      />
                      <input
                        value={draft.usagePurpose}
                        onChange={(event) => setDraft({ ...draft, usagePurpose: event.target.value })}
                        className="field bg-white sm:col-span-2"
                        placeholder="사용 목적 *"
                      />
                    </div>
                  ) : null}

                  {draft.category === "other" ? (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                      <input
                        value={draft.location}
                        onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                        className="field bg-white"
                        placeholder="발생 위치/필요 장소 *"
                      />
                      <input
                        value={draft.impactScope}
                        onChange={(event) => setDraft({ ...draft, impactScope: event.target.value })}
                        className="field bg-white"
                        placeholder="영향 범위 *"
                      />
                    </div>
                  ) : null}

                  {(draft.category === "equipment" && (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기")) && (
                    <div className="hidden mt-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                          {draft.requestItem === "데스크톱" ? (
                            <><HardDrive className="h-4 w-4 text-blue-600" /> PC 부품 사양 구성</>
                          ) : (
                            <><PackageCheck className="h-4 w-4 text-blue-600" /> 소모품 및 주변기기 선택</>
                          )}
                        </h4>
                      </div>

                      {draft.requestItem === "데스크톱" && (
                        <div className="grid gap-3 sm:grid-cols-3">
                          {equipmentPresets.map((preset) => (
                            <button
                              key={preset.id}
                              onClick={() => applyPreset(preset)}
                              className="group relative flex flex-col items-start overflow-hidden rounded-2xl border border-blue-100 bg-white p-5 transition-all hover:border-blue-400 hover:shadow-lg"
                            >
                              <div className="absolute right-0 top-0 -mr-4 -mt-4 h-16 w-16 rounded-full bg-blue-50 transition-transform group-hover:scale-150" />
                              <span className="relative rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-black text-white uppercase">{preset.group}</span>
                              <h5 className="relative mt-3 text-sm font-black text-slate-800">{preset.name}</h5>
                              <p className="relative mt-1 text-[11px] font-medium text-slate-400">최적의 부품 조합을 원클릭으로 장바구니에 담습니다.</p>
                              <div className="relative mt-4 flex items-center gap-1.5 text-xs font-bold text-blue-600">
                                바로 구성하기 <ArrowRight className="h-3.5 w-3.5" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Large Card-style Category Selection */}
                      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
                        {draft.requestItem === "데스크톱"
                          ? desktopPartCategories.map((sub) => {
                            const active = selectedSubCategory === sub;
                            let Icon = Cpu;
                            if (sub === "RAM") Icon = MemoryStick;
                            if (sub === "SSD") Icon = Database;
                            if (sub === "Monitor") Icon = MonitorIcon;
                            if ((sub as string) === "Keyboard") Icon = KeyboardIcon;
                            if ((sub as string) === "Mouse") Icon = MousePointer2;
                            if ((sub as string) === "Cables") Icon = Usb;
                            if (["Power", "Mainboard", "Case", "Graphic Card"].includes(sub as string)) Icon = HardDrive;

                            return (
                              <button
                                key={sub}
                                onClick={() => setSelectedSubCategory(active ? null : sub)}
                                className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-all ${active ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"}`}
                              >
                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                  <Icon className="h-4 w-4" />
                                </div>
                                <span className={`text-[10px] font-black uppercase tracking-tight ${active ? "text-blue-900" : "text-slate-600"}`}>{sub}</span>
                              </button>
                            );
                          })
                          : draft.requestItem === "소모품/주변기기"
                            ? partsCategories.map((cat) => {
                                const active = selectedPartCategory === cat.id;
                                const Icon = cat.icon;
                                return (
                                  <button
                                    key={cat.id}
                                    onClick={() => setSelectedPartCategory(active ? null : cat.id)}
                                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-all ${active ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"}`}
                                  >
                                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${active ? "text-blue-900" : "text-slate-600"}`}>{cat.name}</span>
                                  </button>
                                );
                              })
                            : null}
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="relative min-w-[220px] flex-1">
                          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            value={partQuery}
                            onChange={(event) => setPartQuery(event.target.value)}
                            className="field h-11 pl-12 pr-4 text-sm"
                            placeholder="모델명, 제조사, 부품명 검색"
                          />
                          </div>
                          <button
                            type="button"
                            onClick={() => void refreshPartPrices()}
                            disabled={isPartPriceLoading}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isPartPriceLoading ? "animate-spin" : ""}`} />
                            {isPartPriceLoading ? "가격 조회 중..." : "가격 새로고침"}
                          </button>
                        </div>
                        <p className="mb-4 text-[11px] font-medium text-slate-500">
                          {lastCheckedAt
                            ? `마지막 가격 확인 ${new Date(lastCheckedAt).toLocaleTimeString("ko-KR", {
                                hour: "2-digit",
                                minute: "2-digit"
                              })} 기준가이며, 담은 품목은 요청서에 함께 전달됩니다.`
                            : "가격 정보를 불러오면 최신 기준가를 함께 검토할 수 있습니다."}
                        </p>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {filteredParts.map((part) => (
                            <article key={part.id} className="flex flex-col rounded-xl border border-slate-100 bg-white p-3 transition-all hover:border-blue-200 hover:shadow-sm">
                              <div className="flex items-start justify-between">
                                <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500 uppercase">{part.category}</span>
                                <div className="text-right">
                                  <span className="block text-xs font-bold text-slate-900">{part.price.toLocaleString()}원</span>
                                  <span className="block text-[10px] font-bold text-emerald-600">{livePartQuotes[part.id]?.status === "live" ? "실시간가" : "기준가"}</span>
                                </div>
                              </div>
                              <h4 className="mt-1.5 text-xs font-bold text-slate-800 grow line-clamp-1">{part.name}</h4>
                              <div className="mt-2.5 flex gap-1.5">
                                <button
                                  onClick={() => openDanawa(part.id, part.name)}
                                  className="flex h-7 flex-1 items-center justify-center rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50"
                                >
                                  다나와
                                </button>
                                <button
                                  onClick={() => openGmarket(part.id, part.name)}
                                  className="flex h-7 flex-1 items-center justify-center rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50"
                                >
                                  지마켓
                                </button>
                                <button
                                  onClick={() => addToBasket(part)}
                                  className="flex h-7 flex-1 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-bold text-white hover:bg-blue-700"
                                >
                                  담기
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {!isEquipmentWizard ? (
                  <input
                    value={draft.detail}
                    onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
                    className="field"
                    placeholder={
                      draft.category === "equipment"
                        ? "모델명, 수량, 설치 장소, 선호 브랜드 등 추가 요청 사항을 적어주세요"
                        : draft.category === "tablet"
                          ? "예: 교재 열람, 테스트용, 상담실 안내용"
                          : draft.category === "nas"
                            ? "예: teacher@academy.local / 읽기-쓰기 / 교강사실 공유폴더"
                            : "상세 내용을 적어주세요"
                    }
                  />
                  ) : null}
                </>
              )}

              {draft.category === "equipment" && (!isEquipmentWizard || equipmentWizardStep === equipmentWizardSteps.length - 1) ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-900">
                  <h3 className="font-bold">장비 요청 안내</h3>
                  <p className="mt-2 leading-relaxed">
                    사용자 페이지에서는 장비 종류와 요청 내용을 기준으로 바로 접수합니다. 직접 부품을 고르는 방식은 제외했고, 운영팀 요청 큐에서 같은 기준으로 검토됩니다.
                  </p>
                </div>
              ) : null}
              {draft.category === "other" ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      title: "문제 설명",
                      desc: "어떤 문제가 있는지 짧게 적어주세요.",
                      tone: "bg-slate-50 text-slate-700"
                    },
                    {
                      title: "위치 정보",
                      desc: "지점, 층수, 교실명까지 적으면 빨라집니다.",
                      tone: "bg-blue-50 text-blue-700"
                    },
                    {
                      title: "처리 기한",
                      desc: "언제까지 필요한지 같이 적어주세요.",
                      tone: "bg-amber-50 text-amber-700"
                    },
                    {
                      title: "운영팀 분류",
                      desc: "장비, A/S, NAS, 기타 요청으로 자동 분류됩니다.",
                      tone: "bg-emerald-50 text-emerald-700"
                    }
                  ].map((item) => (
                    <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${item.tone}`}>
                        안내
                      </div>
                      <p className="mt-3 text-sm font-bold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.desc}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {!isEquipmentWizard || equipmentWizardStep === equipmentWizardSteps.length - 1 ? (
                <>
              <div className="flex flex-wrap items-center gap-2">
                {(["보통", "빠름", "긴급"] as const).map((urgency) => (
                  <button
                    key={urgency}
                    onClick={() => setDraft({ ...draft, urgency })}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${draft.urgency === urgency ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600"}`}
                  >
                    {urgency}
                  </button>
                ))}
                <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  파일 첨부
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                  />
                </label>
              </div>
              {files.length ? (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                  {files.length}개 파일 선택됨: {files.map((file) => file.name).join(", ")}
                </div>
              ) : null}
              {draft.urgency === "긴급" ? (
                <div className="grid gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <div>
                    <label className="text-sm font-bold text-red-800">긴급 사유</label>
                    <input
                      value={draft.urgentReason}
                      onChange={(event) => setDraft({ ...draft, urgentReason: event.target.value })}
                      className="field mt-2 w-full"
                      placeholder="예: 오늘 3시 수업 진행 불가 (기기 작동 오류)"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-red-800">영향 범위</label>
                    <input
                      value={draft.urgentImpact}
                      onChange={(event) => setDraft({ ...draft, urgentImpact: event.target.value })}
                      className="field mt-2 w-full"
                      placeholder="예: 3개 반 수업 차질, 상담실 업무 중단"
                    />
                  </div>
                  <p className="text-xs text-red-700">긴급 요청 시에는 우선 처리를 위한 구체적인 사유를 적어주세요.</p>
                </div>
              ) : null}
              <button onClick={submit} disabled={isLoading} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {draft.resubmitId ? "수정하여 재접수" : "요청 접수"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
                </>
              ) : null}
            </div>
          </section>
          </div>
          ) : null}

          {activeSection === "request-workflow" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Workflow Guide</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">처리 흐름 안내</h2>
                <p className="mt-1 text-sm text-slate-500">지금 작성 중인 요청이 어떤 흐름으로 넘어가는지 미리 보면 보류를 줄일 수 있습니다.</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                {currentWorkflowGuide.eta}
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-4">
              {portalWorkflowSteps.map((step) => (
                <article key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm font-black text-slate-900">{step.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{step.description}</p>
                </article>
              ))}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">현재 카테고리 체크리스트</p>
                <h3 className="mt-2 text-lg font-black text-slate-900">{selected.title} 요청 전에 적어두면 좋은 내용</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {currentWorkflowGuide.checklist.map((item) => (
                    <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3">
                  {currentWorkflowGuide.tips.map((tip) => (
                    <div key={tip} className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                      {tip}
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">우선 확인할 요청</p>
                <h3 className="mt-2 text-lg font-black text-slate-900">보완 또는 진행 상태</h3>
                <div className="mt-4 grid gap-3">
                  {highlightedItems.length ? (
                    highlightedItems.slice(0, 4).map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{item.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.id} · {normalizeStatus(item.status)}</p>
                          </div>
                          {normalizeStatus(item.status) === "보류" ? (
                            <button
                              type="button"
                              onClick={() => loadForResubmit(item)}
                              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                            >
                              보완하기
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      아직 확인이 필요한 요청이 없습니다. 새 요청을 접수하면 여기서 진행 흐름을 볼 수 있습니다.
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
          ) : null}

          {activeSection === "request-help" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Quick Help</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">빠른 해결과 접수 팁</h2>
                <p className="mt-1 text-sm text-slate-500">사용자 입장에서 자주 막히는 부분을 먼저 해결하거나, 운영팀이 바로 처리하기 좋은 형태로 요청을 정리할 수 있습니다.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <h3 className="font-black text-slate-900">바로 쓰는 요청 예시</h3>
                </div>
                <div className="mt-4 grid gap-2">
                  {samples.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => {
                        setDraft((current) => ({ ...current, title: sample }));
                        changeSection("request-start");
                        setIsComposerOpen(true);
                      }}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  <h3 className="font-black text-slate-900">보류를 줄이는 작성 포인트</h3>
                </div>
                <div className="mt-4 grid gap-3">
                  {[
                    "장소를 교실명이나 층수까지 적기",
                    "수량과 필요 날짜를 함께 적기",
                    "장애면 사진이나 에러 문구 남기기",
                    "긴급이면 영향 받는 수업/업무 범위 적기"
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-600" aria-hidden="true" />
                  <h3 className="font-black text-slate-900">이럴 땐 바로 운영팀</h3>
                </div>
                <div className="mt-4 grid gap-3">
                  {[
                    "수업 직전 빔, 노트북, 인터넷이 멈췄을 때",
                    "신규 입사자 NAS 권한이 오늘 바로 필요할 때",
                    "행정 장비 교체로 업무가 중단된 상태일 때",
                    "자가 진단을 했지만 같은 장애가 반복될 때"
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {item}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
          ) : null}
        </section>

        <aside className="grid gap-6 self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Live Summary</p>
            <h2 className="mt-1 font-black text-slate-900">실시간 요청 요약</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold text-slate-400">제목 미리보기</p>
                <p className="mt-1 text-sm font-black text-slate-900">{draft.title.trim() || defaultTitle}</p>
              </div>
              <div className="grid gap-3">
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                  <p className="text-[11px] font-bold text-slate-400">예상 담당</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{estimatedOwner}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                  <p className="text-[11px] font-bold text-slate-400">우선순위</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{priorityLabel}</p>
                </div>
              </div>

              {(draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기") && partsBasket.length > 0 && (
                <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                  <h4 className="flex items-center justify-between text-[11px] font-black text-slate-400 uppercase">
                    장바구니 <span>{partsBasket.length}</span>
                  </h4>
                  <div className="mt-2 max-h-[200px] overflow-y-auto space-y-1.5">
                    {partsBasket.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 group">
                        <p className="truncate text-xs font-bold text-slate-700">{p.name}</p>
                        <button onClick={() => removeFromBasket(p.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-slate-50 pt-3 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400">총 합계</span>
                    <span className="text-sm font-black text-blue-600">{partsBasket.reduce((s, p) => s + p.price, 0).toLocaleString()}원</span>
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                {draft.urgency === "긴급" ? "긴급 사유가 포함되면 우선 검토 대상으로 바로 올라갑니다." : "일반 요청은 접수 후 운영팀 분류를 거쳐 담당자에게 전달됩니다."}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <h2 className="font-bold">빠른 예시</h2>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="field mt-3 w-full" placeholder="예시 검색" />
            <div className="mt-3 grid gap-2">
              {samples
                .filter((sample) => sample.includes(query))
                .map((sample) => (
                  <button key={sample} onClick={() => setDraft({ ...draft, title: sample })} className="rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50">
                    {sample}
                  </button>
                ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" aria-hidden="true" />
              <h2 className="font-bold">보완/진행 알림</h2>
            </div>
            <div className="mt-3 grid gap-2">
              {highlightedItems.length ? (
                highlightedItems.slice(0, 4).map((item) => (
                  <div key={item.id} className={`rounded-lg border p-3 ${item.status === "보류" ? "border-rose-200 bg-rose-50" : "border-gray-200 bg-white"}`}>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className={`mt-0.5 h-4 w-4 ${item.status === "완료" ? "text-green-600" : item.status === "보류" ? "text-rose-600" : "text-blue-600"}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.requester} · {item.status}</p>
                        {item.status === "보류" && (
                          <div className="mt-2">
                            {item.rejectionNote && <p className="mb-2 text-xs font-medium text-rose-700">보류 사유: {item.rejectionNote}</p>}
                            <button
                              onClick={() => loadForResubmit(item)}
                              className="inline-flex h-7 items-center justify-center rounded-md bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                            >
                              불러오기 및 수정
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">지금 바로 확인이 필요한 요청이 없습니다.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg backdrop-blur ${
              toast.type === "success"
                ? "border-emerald-200 bg-white/95"
                : toast.type === "error"
                  ? "border-rose-200 bg-white/95"
                  : "border-slate-200 bg-white/95"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                  toast.type === "success" ? "bg-emerald-50 text-emerald-600" : toast.type === "error" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="토스트 닫기"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function normalizeStatus(status?: string) {
  if (!status) return "대기";
  if (status === "접수" || status === "?묒닔") return "접수";
  if (status === "진행 중" || status === "吏꾪뻾 以?") return "진행 중";
  if (status === "완료" || status === "?꾨즺") return "완료";
  if (status === "보류" || status === "蹂대쪟") return "보류";
  return status;
}

function normalizePriority(priority?: string) {
  if (!priority) return "보통";
  if (priority === "긴급" || priority === "湲닿툒") return "긴급";
  if (priority === "높음" || priority === "?믪쓬") return "높음";
  if (priority === "보통" || priority === "蹂댄넻") return "보통";
  return priority;
}

function normalizeModule(module?: string) {
  if (!module) return "기타";
  if (module === "전산 장비" || module === "?꾩궛 ?λ퉬") return "전산 장비";
  if (module === "부품 구매" || module === "遺??援щℓ") return "부품 구매";
  if (module === "태블릿" || module === "?쒕툝由?") return "태블릿";
  if (module === "기타" || module === "湲고?") return "기타";
  return module;
}

function categoryToModule(category: Category, requestItem?: string) {
  if (category === "equipment") {
    if (requestItem === "데스크톱" || requestItem === "소모품/주변기기") return "부품 구매";
    return "전산 장비";
  }
  if (category === "as") return "A/S";
  if (category === "nas") return "NAS";
  if (category === "tablet") return "태블릿";
  return "기타";
}

function extractRequestItem(description?: string) {
  if (!description) return "데스크톱";
  const match = description.match(/요청 장비:\s*(.+)/);
  return match?.[1]?.trim() || "데스크톱";
}

function makeRequestId() {
  return `AOH-${Date.now().toString().slice(-6)}`;
}

function pushToAdminQueue(item: WorkItem) {
  const raw = window.localStorage.getItem(adminStorageKey);
  const parsed = raw ? JSON.parse(raw) as { items?: WorkItem[]; audit?: Array<{ id: string; at: string; actor: string; event: string }> } : {};
  const items = parsed.items ?? [];
  const audit = parsed.audit ?? [];
  const at = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

  window.localStorage.setItem(
    adminStorageKey,
    JSON.stringify({
      items: [item, ...items],
      audit: [
        {
          id: `AUD-${Date.now()}`,
          at,
          actor: "사용자 포털",
          event: `${item.id} ${item.title} 접수`
        },
        ...audit
      ]
    })
  );
}

function updateInAdminQueue(updated: WorkItem) {
  const raw = window.localStorage.getItem(adminStorageKey);
  const parsed = raw ? JSON.parse(raw) as { items?: WorkItem[]; audit?: Array<{ id: string; at: string; actor: string; event: string }> } : {};
  const items = parsed.items ?? [];
  const audit = parsed.audit ?? [];
  const at = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

  window.localStorage.setItem(
    adminStorageKey,
    JSON.stringify({
      items: items.map(p => p.id === updated.id ? updated : p),
      audit: [
        {
          id: `AUD-${Date.now()}`,
          at,
          actor: "사용자 포털",
          event: `${updated.id} 재접수`
        },
        ...audit
      ]
    })
  );
}
