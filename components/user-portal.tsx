"use client";

import {
  ArrowRight,
  Bot,
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
import { createClient } from "@/lib/supabase";
import { fetchFaqs, fetchRequests, updateRequestStatus } from "@/lib/ops-repository";
import { equipmentParts, equipmentPresets } from "@/lib/ops-data";
import type { EquipmentConfig, WorkItem, WorkPriority } from "@/types/ops";

type Category = "equipment" | "as" | "software" | "network" | "nas" | "tablet" | "other";

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
  const [files, setFiles] = useState<File[]>([]);
  const [supabase] = useState(() => createClient());
  const [isLoading, setIsLoading] = useState(false);
  const [asStep, setAsStep] = useState<"searching" | "form">("searching");
  const [symptomQuery, setSymptomQuery] = useState("");
  const [diagnosis, setDiagnosis] = useState<{ diagnosis: string; solution: string[]; original: { keyword: string; category: string; answer: string } } | null>(null);

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

  const [dbFaqs, setDbFaqs] = useState<{ id: string; keyword: string; category: string; answer: string }[]>([]);

  useEffect(() => {
    if (supabase) {
      fetchFaqs(supabase).then(setDbFaqs).catch(console.error);
    }
  }, [supabase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (draft.category === "as" && symptomQuery.length > 1) {
      const match = dbFaqs.find(f => symptomQuery.toLowerCase().includes(f.keyword.toLowerCase()));
      if (match) {
        setDiagnosis({
          diagnosis: match.category === "network" ? "네트워크 장애" : match.category === "device" ? "기기 결함" : "시스템 오류",
          solution: match.answer.split(", "),
          original: match
        });
      } else {
        setDiagnosis(null);
      }
    } else {
      setDiagnosis(null);
    }
  }, [symptomQuery, draft.category, dbFaqs]);

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
      CPU: "cpu-2",
      RAM: "ram-2",
      SSD: "ssd-2",
      "Graphic Card": "gpu-1",
      Mainboard: "mb-1",
      Power: "pwr-1",
      Case: "case-1",
      Monitor: "mon-1"
    },
    totalPrice: 0
  });

  const calculateTotal = useCallback((nextParts: Record<string, string>) => {
    return Object.values(nextParts).reduce((sum, partId) => {
      const part = equipmentParts.find((p) => p.id === partId);
      return sum + (part?.price ?? 0);
    }, 0);
  }, []);

  const totalPrice = useMemo(() => calculateTotal(config.parts), [config.parts, calculateTotal]);
  const updateConfig = (category: string, partId: string) => {
    setConfig({ ...config, parts: { ...config.parts, [category]: partId } });
  };

  const selected = categories.find((item) => item.id === draft.category) ?? categories[0];
  const helperText = useMemo(() => {
    if (draft.category === "as") return "가능하면 장비명, 위치, 증상 사진, 언제부터 발생했는지를 적어주세요.";
    if (draft.category === "nas") return "사용자 이메일, 필요한 폴더, 읽기/쓰기 권한을 적어주세요.";
    if (draft.category === "equipment") return "필요한 장비명, 수량, 사용 장소, 희망 일정을 적어주세요.";
    return "무엇이 필요한지만 편하게 적어주세요. 담당자가 분류합니다.";
  }, [draft.category]);

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
        `대당 가격 합계: ${totalPrice.toLocaleString()}원`
      ]
      : [];

    const user = supabase ? (await supabase.auth.getUser()).data.user : null;

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

        if (supabase && user) {
          await updateRequestStatus(supabase, updated);
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
        evidenceFiles: files.map((file) => file.name)
      };

      if (supabase && user) {
        const { createRequest } = await import("@/lib/ops-repository");
        await createRequest(supabase, user, item);
      } else {
        pushToAdminQueue(item);
      }
    }

    await loadHistory();
    setDraft({ category: "equipment", title: "", academy: "", detail: "", urgency: "보통", urgentReason: "", urgentImpact: "" });
    setFiles([]);
    setAsStep("searching");
    setSymptomQuery("");
    setDiagnosis(null);
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
            <h1 className="text-xl font-bold text-slate-900">경영지원 운영 허브</h1>
            <p className="text-sm text-slate-500">손샘학원 경영지원 통합 운영 시스템</p>
          </div>
          <Link href="/" className="ml-auto rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
            관리자
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                    <p className="mt-3 whitespace-nowrap text-sm font-bold">{item.title}</p>
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
              {draft.category === "as" && asStep === "searching" ? (
                <div className="mt-2 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input 
                      value={symptomQuery} 
                      onChange={(e) => setSymptomQuery(e.target.value)}
                      className="field pl-10" 
                      placeholder="증상을 입력하세요 (예: 모니터가 안 나와요, 인터넷 끊김)" 
                    />
                  </div>
                  
                  {diagnosis ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center gap-2 text-blue-800 font-bold mb-3">
                        <Bot className="h-5 w-5" />
                        <span>AI 자가 진단 결과: {diagnosis.diagnosis}</span>
                      </div>
                      <ul className="space-y-2">
                        {diagnosis.solution.map((step: string, i: number) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-600">
                            <span className="font-bold text-blue-500">{i + 1}.</span>
                            {step}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-5 flex gap-2">
                        <button 
                          onClick={() => {
                            setAsStep("form");
                            setDraft({ ...draft, title: symptomQuery, detail: "자가 진단 시도했으나 해결되지 않음" });
                          }}
                          className="rounded-lg bg-white border border-slate-200 px-4 py-2 text-xs font-bold hover:bg-slate-50 transition-colors"
                        >
                          해결되지 않았습니다 (A/S 접수)
                        </button>
                        <button 
                          onClick={() => {
                            setSymptomQuery("");
                            setDiagnosis(null);
                          }}
                          className="rounded-lg bg-blue-600 text-white px-4 py-2 text-xs font-bold hover:bg-blue-700 transition-colors"
                        >
                          해결되었습니다
                        </button>
                      </div>
                    </div>
                  ) : symptomQuery.length > 1 ? (
                    <div className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
                      매칭되는 자가 해결 가이드가 없습니다. <br/>
                      <button onClick={() => setAsStep("form")} className="mt-2 font-bold text-blue-600 underline">상세 내용을 적어서 접수하기</button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                    <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="field" placeholder="요청 제목 (예: 태블릿 5대 신규 렌탈 요청)" />
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
                    placeholder={draft.category === "equipment" ? "추가 요청 사항 (예: 설치 장소, 선호 브랜드 등)" : "상세 내용을 적어주세요"}
                  />
                </>
              )}

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
                          onClick={() => setConfig({ ...config, parts: preset.parts })}
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
                        <span className="text-lg font-black text-blue-600">{totalPrice.toLocaleString()}원</span>
                      </div>
                      <div className="mt-3 rounded-lg bg-white p-3 text-xs text-blue-800">
                        {totalPrice > 1000000 ? (
                          <p><strong>🚀 고성능:</strong> 전문 영상 편집, 대용량 엑셀 작업 등 고성능이 필요한 직무에 권장합니다.</p>
                        ) : totalPrice > 600000 ? (
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
                      placeholder="예: 오늘 3시 수업 진행 불가 (기기 작동 오류)"
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
                onClick={() => setDraft({ category: "equipment", title: "", academy: "", detail: "", urgency: "보통", urgentReason: "", urgentImpact: "" })}
                className="text-center text-sm font-semibold text-gray-500 hover:text-gray-800"
              >
                취소하고 새로 작성하기
              </button>
            </div>
          </section>
        </section>

        <aside className="grid gap-6 self-start">
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
    </main>
  );
}

function categoryToModule(category: Category) {
  if (category === "equipment") return "전산 장비";
  if (category === "as") return "A/S";
  if (category === "nas") return "NAS";
  if (category === "tablet") return "태블릿";
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
