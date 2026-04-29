"use client";

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  HardDrive,
  HelpCircle,
  Laptop,
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
  Wrench,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { createNasPermissionRequest, fetchFaqs, fetchRequests, updateRequestStatus } from "@/lib/ops-repository";
import { diagnosisPatterns, getDiagnosis } from "@/lib/diagnosis-data";
import { equipmentParts, equipmentPresets, partsCategories } from "@/lib/ops-data";
import { buildDanawaSearchUrl, buildGmarketSearchUrl, resolveDanawaQuery, resolveGmarketQuery } from "@/lib/part-price-catalog";
import { useLivePartPrices } from "@/lib/use-live-part-prices";
import type { BasketItem, EquipmentPreset, WorkItem, WorkPriority } from "@/types/ops";

type Category = "equipment" | "as" | "software" | "network" | "nas" | "tablet" | "parts" | "other";

type RequestDraft = {
  category: Category;
  requestItem?: string;
  title: string;
  academy: string;
  detail: string;
  urgency: "보통" | "빠름" | "긴급";
  urgentReason: string;
  urgentImpact: string;
  resubmitId?: string;
};

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

export function UserPortal() {
  const [draft, setDraft] = useState<RequestDraft>({
    category: "other",
    requestItem: undefined,
    title: "",
    academy: "",
    detail: "",
    urgency: "보통",
    urgentReason: "",
    urgentImpact: ""
  });
  const [submitted, setSubmitted] = useState<WorkItem[]>([]);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [supabase] = useState(() => createClient());
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [asStep, setAsStep] = useState<"searching" | "form">("searching");
  const [symptomQuery, setSymptomQuery] = useState("");
  const [diagnosis, setDiagnosis] = useState<{
    diagnosis: string;
    solution: string[];
    original: { id: string; keyword: string; category: string; answer: string; escalation_required: boolean };
  } | null>(null);
  const [partsBasket, setPartsBasket] = useState<BasketItem[]>([]);
  const [partQuery, setPartQuery] = useState("");
  const [selectedPartCategory, setSelectedPartCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const shouldLoadPartPrices =
    draft.category === "equipment" && (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기");
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

  const pushToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, type }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, type === "error" ? 5200 : 3600);
  }, []);

  const loadHistory = useCallback(async () => {
    if (supabase) {
      try {
        const rows = await fetchRequests(supabase);
        setSubmitted(rows);
      } catch (_e) {
        console.error("Failed to load history from DB", _e);
      }
    } else {
      const raw = window.localStorage.getItem(adminStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: WorkItem[] };
        setSubmitted(parsed.items ?? []);
      }
    }
  }, [supabase]);

  const [dbFaqs, setDbFaqs] = useState<{ id: string; keyword: string; category: string; answer: string; escalation_required: boolean }[]>([]);

  useEffect(() => {
    if (supabase) {
      fetchFaqs(supabase).then(setDbFaqs).catch(console.error);
    }
  }, [supabase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!supabase) return;

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
  }, [supabase, loadHistory]);

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

  const addToBasket = (part: Omit<BasketItem, "id">) => {
    const quote = livePartQuotes[part.id as string];
    setPartsBasket([
      ...partsBasket,
      {
        ...part,
        id: Date.now() + Math.random(),
        partId: part.id as string,
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

  const loadForResubmit = (item: WorkItem) => {
    const categoryMap: Record<string, Category> = {
      "전산 장비": "equipment",
      "A/S": "as",
      "NAS": "nas",
      "태블릿": "tablet",
      "기타": "other"
    };

    setDraft({
      category: categoryMap[item.module] ?? "other",
      requestItem: item.module === "전산 장비" ? extractRequestItem(item.description) : undefined,
      title: item.title,
      academy: item.requester,
      detail: item.description ?? "",
      urgency: item.priority === "긴급" ? "긴급" : item.priority === "높음" ? "빠름" : "보통",
      urgentReason: item.urgentReason ?? "",
      urgentImpact: item.urgentImpact ?? "",
      resubmitId: item.id
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selected = categories.find((item) => item.id === draft.category) ?? categories[0];
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
  const priorityLabel: WorkPriority = draft.urgency === "긴급" ? "긴급" : draft.urgency === "빠름" ? "높음" : "보통";
  const estimatedOwner = draft.category === "nas" ? "NAS 관리자" : draft.category === "as" ? "전산" : "학원 관리자";
  const defaultTitle = ["equipment", "as"].includes(draft.category) ? selected.title : `${selected.title} 요청`;

  const submit = async () => {
    if (draft.urgency === "긴급" && !draft.urgentReason.trim()) return;
    const finalTitle = draft.title.trim() || defaultTitle;

    setIsLoading(true);

    const priority: WorkPriority = draft.urgency === "긴급" ? "긴급" : draft.urgency === "빠름" ? "높음" : "보통";

    const user = supabase ? (await supabase.auth.getUser()).data.user : null;

    const basketDesc = partsBasket.map((p) => `- ${p.name}: ${p.price.toLocaleString()}원`).join("\n");
    const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);

    const description = [
      draft.category === "equipment" && draft.requestItem ? `요청 장비: ${draft.requestItem}` : "",
      draft.category === "tablet" ? `처리 유형: ${draft.title.includes("연장") ? "연장" : draft.title.includes("반납") ? "반납" : "신규"}\n${draft.detail}` : draft.detail,
      draft.category === "nas" ? "안내: 권한 요청 처리 후 접속 가이드가 함께 발송됩니다." : "",
      (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기") ? `요청 부품 목록:\n${basketDesc}\n\n합계: ${basketTotal.toLocaleString()}원` : "",
      files.length ? `\n첨부 파일: ${files.map((file) => file.name).join(", ")}` : ""
    ].filter(Boolean).join("\n");

    const amount = (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기") ? `${partsBasket.length}종 / ${basketTotal.toLocaleString()}원` : undefined;

    let resultItem: WorkItem | null = null;

    if (draft.resubmitId) {
      try {
        const existing = submitted.find(s => s.id === draft.resubmitId);
        if (existing) {
          const updated: WorkItem = {
            ...existing,
            title: finalTitle,
            requester: draft.academy,
            status: "접수", // Resubmitting resets to initial status
            priority,
            description,
            urgentReason: draft.urgency === "긴급" ? draft.urgentReason : undefined,
            urgentImpact: draft.urgency === "긴급" ? draft.urgentImpact : undefined,
            audit: `${existing.id} 보류 후 재접수됨`
          };

          if (supabase && user) {
            await updateRequestStatus(supabase, updated);
          } else {
            updateInAdminQueue(updated);
          }
          resultItem = updated;
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
        requester: draft.academy,
        owner: "학원 관리자",
        status: "접수",
        priority,
        due: draft.urgency === "긴급" ? "오늘" : "신규",
        audit: "사용자 포털 접수 - 학원 관리자 승인 대기",
        description,
        approvalStep: 0,
        source: "user_portal",
        approvedByAcademyAdmin: false,
        urgentReason: draft.urgency === "긴급" ? draft.urgentReason : undefined,
        urgentImpact: draft.urgency === "긴급" ? draft.urgentImpact : undefined,
        evidenceFiles: files.map((file) => file.name),
        amount
      };

      try {
        if (supabase && user) {
          const { createRequest } = await import("@/lib/ops-repository");
          await createRequest(supabase, user, item);
          if (draft.category === "nas") {
            await createNasPermissionRequest(supabase, {
              user_email: draft.detail.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? user.email ?? "unknown@academy.local",
              resource_name: finalTitle,
              permission_level: /쓰기|write/i.test(draft.detail) ? "write" : "read",
              requested_by: user.id
            });
          }
        } else {
          pushToAdminQueue(item);
        }
        resultItem = item;
        pushToast(`${item.id} 요청이 접수되었습니다.`, "success");
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "요청 접수 중 오류가 발생했습니다.", "error");
        setIsLoading(false);
        return;
      }
    }

    await loadHistory();
    setDraft({ category: "equipment", requestItem: "데스크톱", title: "", academy: "", detail: "", urgency: "보통", urgentReason: "", urgentImpact: "" });
    setPartsBasket([]);
    setFiles([]);
    setAsStep("searching");
    setSymptomQuery("");
    setDiagnosis(null);
    setIsLoading(false);
  };

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
          <Link href="/" className="ml-auto rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
            관리자
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1560px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="grid content-start gap-6 self-start">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-2xl font-bold">무엇을 도와드릴까요?</h2>
            <p className="mt-1 text-sm text-gray-500">카테고리를 고르고 요청 내용을 적으면 운영팀으로 전달됩니다.</p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
              {categories.map((item) => {
                const Icon = item.icon;
                const active = draft.category === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      const newDraft = { ...draft, category: item.id };
                      if (item.id === "equipment") {
                        newDraft.requestItem = "데스크톱";
                        setSelectedPartCategory("PC");
                        setSelectedSubCategory("CPU");
                      } else {
                        setSelectedPartCategory(null);
                        setSelectedSubCategory(null);
                      }
                      setDraft(newDraft);
                    }}
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
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Request Queue</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">내 요청 큐</h2>
                <p className="mt-1 text-sm text-slate-500">접수한 요청을 여기서 한 번에 보고, 보류된 건은 바로 수정해서 다시 올릴 수 있습니다.</p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-right">
                <p className="text-[11px] font-bold text-blue-600">현재 요청</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{submittedQueue.length}</p>
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

                      {isRejected ? (
                        <button
                          onClick={() => loadForResubmit(item)}
                          className="mt-3 inline-flex h-8 items-center justify-center rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                        >
                          내용 불러와서 다시 접수
                        </button>
                      ) : null}
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

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${selected.tone}`}>
                <selected.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-bold">{selected.title}</h2>
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
                        } else {
                          setSelectedPartCategory(null);
                          setSelectedSubCategory(null);
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
                    <select value={draft.academy} onChange={(event) => setDraft({ ...draft, academy: event.target.value })} className="field" aria-label="학원">
                      <option value="" disabled>선택해주세요</option>
                      <option>통합학원(본사)</option>
                      <option>학원(지점A)</option>
                      <option>학원(지점B)</option>
                      <option>학원(지점C)</option>
                    </select>
                  </div>

                  {(draft.category === "equipment" && (draft.requestItem === "데스크톱" || draft.requestItem === "소모품/주변기기")) && (
                    <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
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
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            value={partQuery}
                            onChange={(event) => setPartQuery(event.target.value)}
                            className="field h-10 pl-10 text-xs"
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
                            {isPartPriceLoading ? "媛寃?議고쉶 以?.." : "媛寃?깉濡좊Ц"}
                          </button>
                        </div>
                        <p className="mb-4 text-[11px] font-medium text-slate-500">
                          {lastCheckedAt
                            ? `?ㅼ떆媛?媛寃?湲곗? ${new Date(lastCheckedAt).toLocaleTimeString("ko-KR", {
                                hour: "2-digit",
                                minute: "2-digit"
                              })} 쨌 ?ㅻ굹? 湲곗??吏留덉폆 ??곗닔留??곌껐 諛붾줈媛湲곕? ?쒓났?⑸땲??`
                            : "?ㅻ굹? ?ㅼ떆媛?媛寃⑥쓣 遺덈윭?ㅺ퀬 ?덉뒿?덈떎."}
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
                </>
              )}

              {draft.category === "equipment" ? (
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
              <button
                onClick={() => setDraft({ category: "equipment", requestItem: "데스크톱", title: "", academy: "", detail: "", urgency: "보통", urgentReason: "", urgentImpact: "" })}
                className="text-center text-sm font-semibold text-gray-500 hover:text-gray-800"
              >
                취소하고 새로 작성하기
              </button>
            </div>
          </section>
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
              <h2 className="font-bold">내 접수 현황</h2>
            </div>
            <div className="mt-3 grid gap-2">
              {submitted.length ? (
                submitted.map((item) => (
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
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">아직 접수한 요청이 없습니다.</p>
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
