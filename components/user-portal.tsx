"use client";

import {
  ArrowRight,
  CheckCircle2,
  HardDrive,
  HelpCircle,
  Laptop,
  Megaphone,
  Paperclip,
  Search,
  ShieldCheck,
  Wrench
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/status-pill";
import { createClient } from "@/lib/supabase";
import { createRequest, deleteRequest, ensureProfile, fetchRequests, updateRequestStatus } from "@/lib/ops-repository";
import { equipmentParts, equipmentPresets } from "@/lib/ops-data";
import type { EquipmentConfig, WorkItem, WorkPriority, WorkStatus } from "@/types/ops";

type Category = "equipment" | "as" | "software" | "network" | "subly" | "nas" | "other";

type RequestDraft = {
  category: Category;
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
    desc: "노트북, 데스크탑, 모니터, 키보드, 마우스, 태블릿, 부품",
    icon: Laptop,
    tone: "bg-blue-50 text-blue-700"
  },
  {
    id: "as" as const,
    title: "고장났어요",
    desc: "인터넷, 화면, 소리 문제",
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
    id: "other" as const,
    title: "잘 모르겠어요",
    desc: "운영팀이 분류해서 처리",
    icon: HelpCircle,
    tone: "bg-slate-100 text-slate-700"
  }
];

const samplesByCategory: Record<Category, string[]> = {
  equipment: [
    "강의실 노트북 2대가 더 필요해요",
    "행정실 데스크톱 교체 요청",
    "상담실 모니터 추가 설치 부탁드려요",
    "신규 직원용 업무 PC 세팅이 필요해요"
  ],
  as: [
    "3층 빔프로젝터 화면이 깜박여요",
    "교무실 PC 전원이 갑자기 안 켜져요",
    "강의실 스피커에서 소리가 안 나와요",
    "프레젠테이션용 화면 연결이 자꾸 끊겨요"
  ],
  nas: [
    "신규 선생님 NAS 접속 권한이 필요해요",
    "공용 폴더 읽기/쓰기 권한 추가 요청",
    "RaiDrive 연결 주소 안내 부탁드려요",
    "기존 계정의 NAS 접근 권한 수정 요청"
  ],
  subly: [
    "홍보 배너 제작 일정 문의",
    "수업 안내문 출력물 제작 요청",
    "행사 포스터 시안 수정 부탁드려요",
    "설명회용 현수막 문구 반영 부탁드려요"
  ],
  software: [
    "줌 설치 및 계정 세팅 요청",
    "필수 프로그램 재설치 부탁드려요",
    "업무용 소프트웨어 라이선스 확인 요청",
    "화상 수업 프로그램 업데이트 요청"
  ],
  network: [
    "3층 와이파이가 자주 끊겨요",
    "교무실 인터넷 속도가 너무 느려요",
    "유선 랜 포트 연결 점검 부탁드려요",
    "특정 강의실만 인터넷이 불안정해요"
  ],
  other: [
    "어떤 요청으로 넣어야 할지 모르겠어요",
    "운영팀 확인이 필요한 업무가 있어요",
    "분류가 애매한 요청입니다",
    "어느 팀에 문의해야 할지 모르겠어요"
  ]
};

const adminStorageKey = "academy-ops-hub-state-v2";
const historyStatuses: Array<WorkStatus | "전체"> = ["전체", "접수", "진행", "완료", "보류"];

export function UserPortal() {
  const [draft, setDraft] = useState<RequestDraft>({
    category: "equipment",
    title: "",
    academy: "",
    detail: "",
    urgency: "보통",
    urgentReason: "",
    urgentImpact: ""
  });
  const [submitted, setSubmitted] = useState<WorkItem[]>([]);
  const [query, setQuery] = useState("");
  const [historyStatus, setHistoryStatus] = useState<WorkStatus | "전체">("전체");
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<WorkItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<WorkItem | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [supabase] = useState(() => createClient());
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const rows = await fetchRequests(supabase);
          setSubmitted(rows);
          return;
        }
      } catch (err) {
        console.error("Failed to load history from DB", err);
      }
    }

    const raw = window.localStorage.getItem(adminStorageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { items?: WorkItem[] };
      setSubmitted(parsed.items ?? []);
    }
  }, [supabase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const loadForResubmit = (item: WorkItem) => {
    const categoryMap: Record<string, Category> = {
      "전산 장비": "equipment",
      "A/S": "as",
      "서블리": "subly",
      "NAS": "nas",
      "기타": "other"
    };

    setDraft({
      category: categoryMap[item.module] ?? "other",
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

  const [config, setConfig] = useState<EquipmentConfig>({
    parts: {
      CPU: "cpu-amd-2",
      RAM: "ram-2",
      SSD: "ssd-2",
      "Graphic Card": "gpu-1",
      Mainboard: "mb-1",
      Power: "pwr-1",
      Case: "case-1"
    },
    totalPrice: 0
  });

  const calculateTotal = useCallback((nextParts: Record<string, string>) => {
    return Object.values(nextParts).reduce((sum, partId) => {
      const part = equipmentParts.find((p) => p.id === partId);
      return sum + (part?.price ?? 0);
    }, 0);
  }, []);

  useEffect(() => {
    setConfig((prev) => ({ ...prev, totalPrice: calculateTotal(prev.parts) }));
  }, [calculateTotal]);

  const updateConfig = (category: string, partId: string) => {
    const nextParts = { ...config.parts, [category]: partId };
    setConfig({ parts: nextParts, totalPrice: calculateTotal(nextParts) });
  };

  const applyPreset = (parts: Record<string, string>) => {
    setConfig({ parts, totalPrice: calculateTotal(parts) });
  };

  const selected = categories.find((item) => item.id === draft.category) ?? categories[0];
  const helperText = useMemo(() => {
    if (draft.category === "as") return "가능하면 장비명, 위치, 증상 사진, 언제부터 발생했는지를 적어주세요.";
    if (draft.category === "nas") return "사용자 이메일, 필요한 폴더, 읽기/쓰기 권한을 적어주세요.";
    if (draft.category === "subly") return "제작물 종류, 수량, 희망 납기, 참고 파일 여부를 적어주세요.";
    if (draft.category === "equipment") return "필요한 장비명, 수량, 사용 장소, 희망 일정을 적어주세요.";
    return "무엇이 필요한지만 편하게 적어주세요. 담당자가 분류합니다.";
  }, [draft.category]);

  const titlePlaceholder = useMemo(() => {
    if (draft.category === "equipment") return "예: 강의실 노트북 2대가 더 필요해요";
    if (draft.category === "as") return "예: 3층 빔프로젝터 화면이 깜박여요";
    if (draft.category === "nas") return "예: 신규 선생님 NAS 접속 권한이 필요해요";
    if (draft.category === "subly") return "예: 홍보 배너 제작 일정 문의";
    return "예: 운영팀 확인이 필요한 업무가 있어요";
  }, [draft.category]);

  const detailPlaceholder = useMemo(() => {
    if (draft.category === "equipment") return "추가 요청 사항 (예: 설치 장소, 선호 브랜드 등)";
    if (draft.category === "as") return "예: 3층 2강의실, 오늘 오전부터 화면이 깜박이고 있습니다";
    if (draft.category === "nas") return "예: sonsedu.synology.me / 공용폴더 / 권한 필요";
    if (draft.category === "subly") return "예: A3 포스터 2종, 금요일까지 필요";
    return "상세 내용을 한 줄로 적어주세요";
  }, [draft.category]);

  const urgentReasonPlaceholder = useMemo(() => {
    if (draft.category === "equipment") return "예: 오늘 오후 수업용 노트북이 없어 바로 수업 진행이 어렵습니다";
    if (draft.category === "as") return "예: 오늘 3시 수업 진행 불가 (기기 작동 오류)";
    if (draft.category === "nas") return "예: 지금 당장 공용폴더 접속이 막혀 업무 자료 확인이 불가합니다";
    if (draft.category === "subly") return "예: 내일 행사 사용 예정이라 오늘 중 시안 확정이 필요합니다";
    return "예: 오늘 안에 처리되지 않으면 운영상 문제가 발생합니다";
  }, [draft.category]);

  const visibleSamples = samplesByCategory[draft.category] ?? samplesByCategory.other;
  const filteredSubmitted = useMemo(() => {
    return submitted.filter((item) => historyStatus === "전체" || item.status === historyStatus);
  }, [historyStatus, submitted]);
  const selectedHistoryItemCanCancel = selectedHistoryItem ? canCancelRequest(selectedHistoryItem) : false;

  const submit = async () => {
    if (!draft.title.trim()) return;
    if (draft.urgency === "긴급" && !draft.urgentReason.trim()) return;

    setIsLoading(true);

    const priority: WorkPriority = draft.urgency === "긴급" ? "긴급" : draft.urgency === "빠름" ? "높음" : "보통";
    const isCustom = draft.category === "equipment";

    const configLines = isCustom
      ? [
        "--- 요청 사양 상세 ---",
        ...Object.entries(config.parts).map(([cat, id]) => {
          const part = equipmentParts.find((p) => p.id === id);
          return `${cat}: ${part?.name ?? "미선택"} (${part?.price.toLocaleString()}원)`;
        }),
        `대당 가격 합계: ${config.totalPrice.toLocaleString()}원`
      ]
      : [];

    const description = [
      ...configLines,
      draft.detail,
      files.length ? `\n첨부 파일: ${files.map((file) => file.name).join(", ")}` : ""
    ].filter(Boolean).join("\n");

    if (draft.resubmitId) {
      const existing = submitted.find(s => s.id === draft.resubmitId);
      if (existing) {
        const updated: WorkItem = {
          ...existing,
          title: draft.title,
          requester: draft.academy,
          status: "접수", // Resubmitting resets to initial status
          priority,
          description,
          urgentReason: draft.urgency === "긴급" ? draft.urgentReason : undefined,
          audit: `${existing.id} 보류 후 재접수됨`
        };

        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const currentUser = data.session?.user;

          if (currentUser) {
            try {
              await ensureProfile(supabase, currentUser);
              await updateRequestStatus(supabase, updated);
            } catch (error) {
              console.error("Failed to update request in Supabase", error);
              updateInAdminQueue(updated);
            }
          } else {
            updateInAdminQueue(updated);
          }
        } else {
          updateInAdminQueue(updated);
        }
      }
    } else {
      const item: WorkItem = {
        id: makeRequestId(),
        module: categoryToModule(draft.category),
        title: draft.title,
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
        evidenceFiles: files.map((file) => file.name),
        createdAt: new Date().toISOString()
      };

      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const currentUser = data.session?.user;

        if (currentUser) {
          try {
            await ensureProfile(supabase, currentUser);
            await createRequest(supabase, currentUser, item);
          } catch (error) {
            console.error("Failed to create request in Supabase", error);
            pushToAdminQueue(item);
          }
        } else {
          pushToAdminQueue(item);
        }
      } else {
        pushToAdminQueue(item);
      }
    }

    await loadHistory();
    setDraft({ category: "equipment", title: "", academy: "", detail: "", urgency: "보통", urgentReason: "" });
    setFiles([]);
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">경영 지원 요청</h1>
            <p className="text-sm text-slate-500">지점별 필요한 전산 업무를 신청하세요</p>
          </div>
          <Link href="/" className="ml-auto rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
            관리자
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_500px]">
        <section className="grid gap-6">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-2xl font-bold">무엇을 도와드릴까요?</h2>
            <p className="mt-1 text-sm text-gray-500">카테고리를 고르고 요청 내용을 적으면 운영팀으로 전달됩니다.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {categories.map((item) => {
                const Icon = item.icon;
                const active = draft.category === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setDraft({ ...draft, category: item.id })}
                    className={`rounded-lg border p-4 text-left transition ${active ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                  >
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${item.tone}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-sm font-bold leading-5">{item.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

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
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="field" placeholder={titlePlaceholder} />
                <select value={draft.academy} onChange={(event) => setDraft({ ...draft, academy: event.target.value })} className="field" aria-label="학원">
                  <option value="" disabled>선택해주세요</option>
                  <option>손샘학원(본사)</option>
                  <option>손샘(수원)</option>
                  <option>손샘(대치)</option>
                  <option>손샘(범어)</option>
                </select>
              </div>
              <input
                value={draft.detail}
                onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
                className="field"
                placeholder={detailPlaceholder}
              />

              {draft.category === "equipment" && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                  <h3 className="mb-4 text-sm font-bold text-blue-900">💻 장비 세부 사양 선택</h3>
                  
                  <div className="mb-6">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-blue-400">빠른 구성 불러오기</p>
                    <div className="flex flex-wrap gap-2">
                      {equipmentPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset.parts)}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors shadow-sm"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-5">
                    {Object.keys(config.parts).map((category) => (
                      <div key={category} className="grid gap-2 sm:grid-cols-[100px_1fr]">
                        <span className="text-xs font-bold text-slate-500">{category}</span>
                        <div className="grid gap-2">
                          <select
                            value={config.parts[category] || ""}
                            onChange={(e) => updateConfig(category, e.target.value)}
                            className="field w-full border-blue-200 text-sm"
                          >
                            <option value="" disabled>선택해주세요</option>
                            {equipmentParts
                              .filter((p) => p.category === category)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.tier === "고성능" ? "🚀 " : p.tier === "업무용" ? "💼 " : ""}
                                  {p.name} (+{p.price.toLocaleString()}원)
                                </option>
                              ))}
                          </select>
                          {config.parts[category] && (
                            <p className="rounded-lg bg-white px-3 py-2 text-[11px] leading-relaxed text-blue-700 shadow-sm border border-blue-50">
                              <span className="font-bold">✨ 전문가 코멘트:</span> {equipmentParts.find((p) => p.id === config.parts[category])?.performanceNote}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="mt-2 border-t border-blue-200 pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-blue-900">구성 합계 (VAT 별도)</span>
                        <span className="text-lg font-black text-blue-600">{config.totalPrice.toLocaleString()}원</span>
                      </div>
                      <div className="mt-3 rounded-lg bg-white p-3 text-xs text-blue-800">
                        {config.totalPrice > 1000000 ? (
                          <p><strong>🚀 고성능:</strong> 전문 영상 편집, 대용량 엑셀 작업 등 고성능이 필요한 직무에 권장합니다.</p>
                        ) : config.totalPrice > 600000 ? (
                          <p><strong>💼 표준:</strong> 학원 데스크 및 관리자분들이 사용하시기에 가장 적합한 사양입니다.</p>
                        ) : (
                          <p><strong>📝 기본:</strong> 강사 선생님들의 강의 진행 및 수업용 PC로 최적화된 구성입니다.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                      placeholder={urgentReasonPlaceholder}
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
                onClick={() => setDraft({ category: "equipment", title: "", academy: "", detail: "", urgency: "보통", urgentReason: "" })}
                className="text-center text-sm font-semibold text-gray-500 hover:text-gray-800"
              >
                취소하고 새로 작성하기
              </button>
            </div>
          </section>
        </section>

        <aside className="self-start space-y-4">
          <section className="h-fit rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <h2 className="font-bold">빠른 예시</h2>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="field mt-3 w-full" placeholder="예시 검색" />
            <div className="mt-3 grid gap-2">
              {visibleSamples
                .filter((sample) => sample.includes(query))
                .map((sample) => (
                  <button key={sample} onClick={() => setDraft({ ...draft, title: sample })} className="rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm leading-5 hover:bg-gray-50">
                    {sample}
                  </button>
                ))}
            </div>
          </section>

          <section className="h-fit rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" aria-hidden="true" />
              <h2 className="font-bold">내 접수 현황</h2>
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-1.5">
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
              {historyStatuses.map((status) => {
                const active = historyStatus === status;
                const count = status === "전체" ? submitted.length : submitted.filter((item) => item.status === status).length;
                return (
                  <button
                    key={status}
                    onClick={() => setHistoryStatus(status)}
                    className={`inline-flex h-9 items-center justify-center rounded-xl px-2 text-xs font-bold transition ${active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/70"}`}
                  >
                    {status} {count}
                  </button>
                );
              })}
              </div>
            </div>
            <div className="mt-3 grid gap-3">
              {filteredSubmitted.length ? (
                filteredSubmitted.map((item) => (
                  <article
                    key={item.id}
                    onClick={() => setSelectedHistoryItem(item)}
                    className={`cursor-pointer rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${item.status === "보류" ? "border-rose-200 bg-rose-50" : "border-gray-200 bg-white hover:border-blue-200"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className={`mt-0.5 h-4 w-4 ${item.status === "완료" ? "text-green-600" : item.status === "보류" ? "text-rose-600" : "text-blue-600"}`} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.id}</p>
                            <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-slate-400">지점</p>
                            <p className="mt-1 font-bold text-slate-700">{item.requester}</p>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-slate-400">분류</p>
                            <p className="mt-1 font-bold text-slate-700">{item.module}</p>
                          </div>
                        </div>
                        {item.status === "보류" && item.rejectionNote ? (
                          <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs font-medium text-rose-700">보류 사유: {item.rejectionNote}</p>
                        ) : null}
                        {item.status === "보류" ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              loadForResubmit(item);
                            }}
                            type="button"
                            className="mt-3 inline-flex h-8 items-center justify-center rounded-md bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                          >
                            불러오기 및 수정
                          </button>
                        ) : null}
                      </div>
                      <StatusPill status={item.status} />
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                  {submitted.length ? `${historyStatus} 상태의 요청이 없습니다.` : "아직 접수한 요청이 없습니다."}
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
      {selectedHistoryItem ? (
        <HistoryDetailModal
          item={selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
          onCancel={selectedHistoryItemCanCancel ? () => setCancelTarget(selectedHistoryItem) : undefined}
          onResubmit={selectedHistoryItem.status === "보류" ? () => {
            loadForResubmit(selectedHistoryItem);
            setSelectedHistoryItem(null);
          } : undefined}
        />
      ) : null}
      {cancelTarget ? (
        <ConfirmCancelModal
          item={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={async () => {
            try {
              if (supabase) {
                await deleteRequest(supabase, cancelTarget.id);
              } else {
                deleteFromAdminQueue(cancelTarget.id);
              }
              setCancelTarget(null);
              setSelectedHistoryItem(null);
              await loadHistory();
            } catch (error) {
              console.error("Failed to cancel request", error);
            }
          }}
        />
      ) : null}
    </main>
  );
}

function HistoryDetailModal({
  item,
  onClose,
  onCancel,
  onResubmit
}: {
  item: WorkItem;
  onClose: () => void;
  onCancel?: () => void;
  onResubmit?: () => void;
}) {
  const cancellable = canCancelRequest(item);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{item.id}</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">요청 상세</h3>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
            닫기
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900">{item.title}</p>
              <p className="mt-1 text-sm text-slate-500">{item.module} · {item.requester}</p>
            </div>
            <StatusPill status={item.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-xs text-slate-400">우선순위</p>
              <p className="mt-1 font-bold text-slate-800">{item.priority}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-xs text-slate-400">처리 상태</p>
              <p className="mt-1 font-bold text-slate-800">{item.status}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <p className="text-xs font-bold text-slate-400">상세 내용</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{item.description || item.audit}</p>
          </div>

          {item.urgentReason ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs font-bold text-red-400">긴급 사유</p>
              <p className="mt-2 text-sm text-red-800">{item.urgentReason}</p>
            </div>
          ) : null}

          {item.rejectionNote ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-xs font-bold text-rose-400">보류 사유</p>
              <p className="mt-2 text-sm text-rose-800">{item.rejectionNote}</p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            {cancellable && onCancel ? (
              <button onClick={onCancel} className="inline-flex h-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-800 hover:bg-amber-100">
                접수 취소
              </button>
            ) : null}
            {onResubmit ? (
              <button onClick={onResubmit} className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700">
                불러오기 및 수정
              </button>
            ) : null}
            <button onClick={onClose} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmCancelModal({
  item,
  onClose,
  onConfirm
}: {
  item: WorkItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-sm font-bold text-slate-900">정말 취소하시겠습니까?</p>
          <p className="mt-2 text-sm text-slate-500">
            `{item.title}` 요청을 취소하면 복구되지 않습니다.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button onClick={onClose} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            돌아가기
          </button>
          <button onClick={onConfirm} className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700">
            네, 취소할게요
          </button>
        </div>
      </div>
    </div>
  );
}

function canCancelRequest(item: WorkItem) {
  if (!item.createdAt) return false;
  if (item.status !== "접수") return false;
  if (item.status === "완료") return false;
  const createdAt = new Date(item.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt <= 60 * 60 * 1000;
}

function categoryToModule(category: Category) {
  if (category === "equipment") return "전산 장비";
  if (category === "as") return "A/S";
  if (category === "subly") return "서블리";
  if (category === "nas") return "NAS";
  return "기타";
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

function deleteFromAdminQueue(id: string) {
  const raw = window.localStorage.getItem(adminStorageKey);
  const parsed = raw ? JSON.parse(raw) as { items?: WorkItem[]; audit?: Array<{ id: string; at: string; actor: string; event: string }> } : {};
  const items = parsed.items ?? [];
  const audit = parsed.audit ?? [];
  const at = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

  window.localStorage.setItem(
    adminStorageKey,
    JSON.stringify({
      items: items.filter((item) => item.id !== id),
      audit: [
        {
          id: `AUD-${Date.now()}`,
          at,
          actor: "사용자 포털",
          event: `${id} 접수 취소`
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
