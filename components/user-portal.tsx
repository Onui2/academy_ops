"use client";

import {
  ArrowRight,
  CheckCircle2,
  HardDrive,
  HelpCircle,
  Laptop,
  Megaphone,
  Paperclip,
  Printer,
  Search,
  ShieldCheck,
  Wrench
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type Category = "equipment" | "as" | "subly" | "nas" | "other";

type RequestDraft = {
  category: Category;
  title: string;
  campus: string;
  detail: string;
  urgency: "보통" | "빠름" | "긴급";
};

const categories = [
  {
    id: "equipment" as const,
    title: "장비가 필요해요",
    desc: "노트북, 빔프로젝터, 키보드, 부품",
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
    id: "subly" as const,
    title: "제작/인쇄 요청",
    desc: "홍보물, 안내문, 교재, 배너",
    icon: Printer,
    tone: "bg-amber-50 text-amber-700"
  },
  {
    id: "nas" as const,
    title: "NAS 접속/권한",
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

const samples = [
  "3층 빔프로젝터 화면이 깜박여요",
  "신규 선생님 NAS 접속 권한이 필요해요",
  "강의실 노트북 2대가 더 필요해요",
  "겨울 방학 안내문 500부 인쇄 요청"
];

export function UserPortal() {
  const [draft, setDraft] = useState<RequestDraft>({
    category: "equipment",
    title: "",
    campus: "강남캠퍼스",
    detail: "",
    urgency: "보통"
  });
  const [submitted, setSubmitted] = useState<RequestDraft[]>([]);
  const [query, setQuery] = useState("");

  const selected = categories.find((item) => item.id === draft.category) ?? categories[0];
  const helperText = useMemo(() => {
    if (draft.category === "as") return "가능하면 장비명, 위치, 증상 사진, 언제부터 발생했는지를 적어주세요.";
    if (draft.category === "nas") return "사용자 이메일, 필요한 폴더, 읽기/쓰기 권한을 적어주세요.";
    if (draft.category === "subly") return "제작물 종류, 수량, 희망 납기, 참고 파일 여부를 적어주세요.";
    if (draft.category === "equipment") return "필요한 장비명, 수량, 사용 장소, 희망 일정을 적어주세요.";
    return "무엇이 필요한지만 편하게 적어주세요. 담당자가 분류합니다.";
  }, [draft.category]);

  const submit = () => {
    if (!draft.title.trim()) return;
    setSubmitted((current) => [{ ...draft }, ...current]);
    setDraft({ ...draft, title: "", detail: "" });
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold">운영 요청</h1>
            <p className="text-sm text-gray-500">필요한 일을 쉽게 접수하세요</p>
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
                    <p className="mt-3 font-bold">{item.title}</p>
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
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="field" placeholder="예: 3층 빔프로젝터 화면이 깜박여요" />
                <select value={draft.campus} onChange={(event) => setDraft({ ...draft, campus: event.target.value })} className="field" aria-label="캠퍼스">
                  <option>강남캠퍼스</option>
                  <option>송파캠퍼스</option>
                  <option>분당캠퍼스</option>
                  <option>본사</option>
                </select>
              </div>
              <textarea
                value={draft.detail}
                onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
                className="min-h-32 rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-500"
                placeholder="상세 내용을 적어주세요"
              />
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
                <button className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  파일 첨부
                </button>
              </div>
              <button onClick={submit} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
                요청 접수
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
                submitted.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.campus} · 접수됨</p>
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
