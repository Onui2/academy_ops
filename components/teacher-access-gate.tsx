"use client";

import type { ReactNode } from "react";
import { Building2, ChevronRight, Loader2, LogIn, LogOut, MapPinned, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PortalRole = "admin" | "user";

type TeacherSession = {
  username: string;
  brand: string;
  brandName: string | null;
  branch: string;
  branchName: string | null;
  portalRole: PortalRole;
  type: "STAFF";
  authenticatedAt: string;
  profile: Record<string, unknown> | null;
};

type AcademyItem = {
  value: string;
  label1: string;
  label2: string | null;
  sysSeq: string;
};

type BranchItem = {
  value: string;
  label1: string;
  label2: string | null;
};

type LoginHintState = {
  academyName: string;
  brand: string;
  sysSeq: string;
  branch: string;
  username: string;
};

type LoginFormState = {
  username: string;
  password: string;
  branch: string;
};

const storageKey = "flipedu-teacher-login-hint";

function emptyHint(): LoginHintState {
  return {
    academyName: "",
    brand: "",
    sysSeq: "",
    branch: "",
    username: ""
  };
}

function readStoredHint(): LoginHintState {
  if (typeof window === "undefined") {
    return emptyHint();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return emptyHint();

    const parsed = JSON.parse(raw) as Partial<LoginHintState>;
    return {
      academyName: parsed.academyName ?? "",
      brand: parsed.brand ?? "",
      sysSeq: parsed.sysSeq ?? "",
      branch: parsed.branch ?? "",
      username: parsed.username ?? ""
    };
  } catch {
    return emptyHint();
  }
}

function writeStoredHint(hint: LoginHintState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(hint));
}

function routeForRole(role: PortalRole) {
  return role === "admin" ? "/" : "/user";
}

function canAccessPortal(role: PortalRole, portal: PortalRole) {
  if (portal === "user") {
    return true;
  }

  return role === "admin";
}

export function TeacherAccessGate({
  portal,
  children
}: {
  portal: PortalRole;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<TeacherSession | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [academyQuery, setAcademyQuery] = useState("");
  const [academyResults, setAcademyResults] = useState<AcademyItem[]>([]);
  const [selectedAcademy, setSelectedAcademy] = useState<AcademyItem | null>(null);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [form, setForm] = useState<LoginFormState>({
    username: "",
    password: "",
    branch: ""
  });
  const [step, setStep] = useState<"academy" | "credentials">("academy");
  const [isSearchingAcademy, setIsSearchingAcademy] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("학원명을 먼저 입력해 주세요.");

  const selectedBranch = branches.find((item) => item.value === form.branch) ?? null;

  function updateForm<K extends keyof LoginFormState>(key: K, value: LoginFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function persistHint(patch: Partial<LoginHintState>) {
    const current = readStoredHint();
    writeStoredHint({
      academyName: patch.academyName ?? current.academyName,
      brand: patch.brand ?? current.brand,
      sysSeq: patch.sysSeq ?? current.sysSeq,
      branch: patch.branch ?? current.branch,
      username: patch.username ?? current.username
    });
  }

  async function loadBranches(academy: AcademyItem, preferredBranch = "") {
    setIsLoadingBranches(true);
    setSelectedAcademy(academy);
    setStep("credentials");
    setMessage("지점을 선택한 뒤 teacher 계정으로 로그인해 주세요.");

    try {
      const response = await fetch(
        `/api/teacher/branches?sysSeq=${encodeURIComponent(academy.sysSeq)}&brand=${encodeURIComponent(academy.value)}`,
        {
          method: "GET",
          cache: "no-store"
        }
      );

      const data = (await response.json()) as { items?: BranchItem[]; message?: string };
      if (!response.ok) {
        setBranches([]);
        setForm((current) => ({ ...current, branch: "" }));
        setMessage(data.message ?? "지점 목록을 불러오지 못했습니다.");
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      setBranches(items);

      if (preferredBranch && items.some((item) => item.value === preferredBranch)) {
        setForm((current) => ({ ...current, branch: preferredBranch }));
      } else if (items.length === 1) {
        setForm((current) => ({ ...current, branch: items[0].value }));
      } else {
        setForm((current) => ({ ...current, branch: "" }));
      }

      if (!items.length) {
        setMessage("선택한 학원에 연결된 지점을 찾지 못했습니다.");
        return;
      }

      setMessage("학원 확인이 완료되었습니다. 지점과 teacher 계정을 입력해 주세요.");
    } catch {
      setBranches([]);
      setForm((current) => ({ ...current, branch: "" }));
      setMessage("지점 목록을 가져오는 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsLoadingBranches(false);
    }
  }

  async function searchAcademies() {
    const query = academyQuery.trim();
    if (!query) {
      setMessage("학원명을 입력해 주세요.");
      return;
    }

    setIsSearchingAcademy(true);
    setAcademyResults([]);
    setSelectedAcademy(null);
    setBranches([]);
    setForm((current) => ({ ...current, branch: "" }));
    setMessage("학원 정보를 확인하고 있습니다...");

    try {
      const response = await fetch(`/api/teacher/brands?name=${encodeURIComponent(query)}`, {
        method: "GET",
        cache: "no-store"
      });

      const data = (await response.json()) as { items?: AcademyItem[]; message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "학원 조회에 실패했습니다.");
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      setAcademyResults(items);

      if (!items.length) {
        setMessage("입력한 이름으로 학원을 찾지 못했습니다.");
        return;
      }

      if (items.length === 1) {
        persistHint({
          academyName: items[0].label1,
          brand: items[0].value,
          sysSeq: items[0].sysSeq,
          branch: ""
        });
        await loadBranches(items[0]);
        return;
      }

      setMessage("조회된 학원 중 하나를 선택해 주세요.");
    } catch {
      setMessage("학원 조회 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsSearchingAcademy(false);
    }
  }

  async function chooseAcademy(academy: AcademyItem) {
    setAcademyQuery(academy.label1);
    setAcademyResults([]);
    persistHint({
      academyName: academy.label1,
      brand: academy.value,
      sysSeq: academy.sysSeq,
      branch: ""
    });
    await loadBranches(academy);
  }

  function resetAcademy() {
    setStep("academy");
    setSelectedAcademy(null);
    setAcademyResults([]);
    setBranches([]);
    setForm((current) => ({ ...current, branch: "", password: "" }));
    persistHint({
      academyName: "",
      brand: "",
      sysSeq: "",
      branch: ""
    });
    setMessage("학원명을 먼저 입력해 주세요.");
  }

  async function submit() {
    if (!selectedAcademy) {
      setMessage("학원을 먼저 선택해 주세요.");
      return;
    }

    if (!form.branch) {
      setMessage("지점을 선택해 주세요.");
      return;
    }

    if (!form.username.trim() || !form.password) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setMessage("teacher 로그인 정보를 확인하고 있습니다...");

    try {
      const response = await fetch("/api/teacher/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
          sysSeq: selectedAcademy.sysSeq,
          brand: selectedAcademy.value,
          brandName: selectedAcademy.label1,
          branch: form.branch,
          branchName: selectedBranch?.label1 ?? ""
        })
      });

      const data = (await response.json()) as { message?: string; session?: TeacherSession };
      if (!response.ok || !data.session) {
        setMessage(data.message ?? "teacher 로그인에 실패했습니다.");
        return;
      }

      persistHint({
        academyName: selectedAcademy.label1,
        brand: selectedAcademy.value,
        sysSeq: selectedAcademy.sysSeq,
        branch: form.branch,
        username: form.username.trim()
      });

      setForm((current) => ({ ...current, password: "" }));
      setSession(data.session);

      if (!canAccessPortal(data.session.portalRole, portal)) {
        const destination = routeForRole(data.session.portalRole);
        setIsRedirecting(true);
        router.replace(destination);
        return;
      }

      setMessage("로그인되었습니다.");
    } catch {
      setMessage("teacher 로그인 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signOut() {
    setIsSubmitting(true);
    try {
      await fetch("/api/teacher/session", {
        method: "DELETE"
      });
    } finally {
      setSession(null);
      setIsSubmitting(false);
      setIsRedirecting(false);
      setMessage(selectedAcademy ? "지점을 확인하고 teacher 계정으로 로그인해 주세요." : "학원명을 먼저 입력해 주세요.");
    }
  }

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/teacher/session", {
          method: "GET",
          cache: "no-store"
        });

        if (!active) return;

        if (!response.ok) {
          setSession(null);
          return;
        }

        const data = (await response.json()) as { session: TeacherSession };
        setSession(data.session);
      } catch {
        if (!active) return;
        setSession(null);
      } finally {
        if (active) setIsCheckingSession(false);
      }
    };

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const stored = readStoredHint();
    setAcademyQuery(stored.academyName);
    setForm({
      username: stored.username,
      password: "",
      branch: stored.branch
    });

    if (!stored.brand || !stored.academyName || !stored.sysSeq) {
      return;
    }

    const academy: AcademyItem = {
      value: stored.brand,
      label1: stored.academyName,
      label2: null,
      sysSeq: stored.sysSeq
    };

    void loadBranches(academy, stored.branch);
  }, []);

  useEffect(() => {
    if (isCheckingSession || !session) {
      return;
    }

    if (canAccessPortal(session.portalRole, portal)) {
      return;
    }

    const destination = routeForRole(session.portalRole);
    if (destination === pathname) {
      return;
    }

    setIsRedirecting(true);
    router.replace(destination);
  }, [isCheckingSession, pathname, portal, router, session]);

  if (isCheckingSession || isRedirecting) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <p className="text-sm font-semibold text-slate-700">
            {isRedirecting ? "권한에 맞는 화면으로 이동하고 있습니다." : "teacher 세션을 확인하고 있습니다."}
          </p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe,_#f8fafc_40%,_#f8fafc)] px-4 py-10">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_430px]">
          <section className="rounded-[28px] border border-white/70 bg-white/85 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-blue-700">
              Teacher Login
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-900">경영지원 운영 포털</h1>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Step 1</p>
                <p className="mt-2 text-sm font-black text-slate-900">학원 검색</p>
                <p className="mt-1 text-xs leading-6 text-slate-500">학원명으로 브랜드 정보를 조회합니다.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Step 2</p>
                <p className="mt-2 text-sm font-black text-slate-900">지점 선택</p>
                <p className="mt-1 text-xs leading-6 text-slate-500">선택한 학원에 연결된 지점을 불러옵니다.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Step 3</p>
                <p className="mt-2 text-sm font-black text-slate-900">포털 진입</p>
                <p className="mt-1 text-xs leading-6 text-slate-500">로그인 후 권한에 맞는 화면으로 자동 이동합니다.</p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Portal Access</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">teacher 로그인</h2>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
              {message}
            </div>

            {step === "academy" ? (
              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Academy</span>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={academyQuery}
                      onChange={(event) => setAcademyQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void searchAcademies();
                        }
                      }}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-medium outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      placeholder="학원명을 입력해 주세요."
                    />
                  </div>
                </label>

                <button
                  onClick={() => void searchAcademies()}
                  disabled={isSearchingAcademy}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSearchingAcademy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  다음
                </button>

                {!!academyResults.length && (
                  <div className="grid gap-2">
                    {academyResults.map((academy) => (
                      <button
                        key={`${academy.sysSeq}-${academy.value}-${academy.label1}`}
                        onClick={() => void chooseAcademy(academy)}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        <div>
                          <p className="text-sm font-black text-slate-900">{academy.label1}</p>
                          {academy.label2 ? <p className="mt-1 text-xs text-slate-500">{academy.label2}</p> : null}
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{selectedAcademy?.label1}</p>
                        {selectedAcademy?.label2 ? <p className="mt-1 text-xs text-slate-500">{selectedAcademy.label2}</p> : null}
                      </div>
                    </div>
                    <button
                      onClick={resetAcademy}
                      type="button"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-white"
                    >
                      학원 변경
                    </button>
                  </div>
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Branch</span>
                  <div className="relative">
                    <MapPinned className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={form.branch}
                      onChange={(event) => updateForm("branch", event.target.value)}
                      disabled={isLoadingBranches}
                      className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-medium outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                    >
                      <option value="">{isLoadingBranches ? "지점을 불러오는 중..." : "지점을 선택해 주세요."}</option>
                      {branches.map((branch) => (
                        <option key={`${branch.value}-${branch.label1}`} value={branch.value}>
                          {branch.label1}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Username</span>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={form.username}
                      onChange={(event) => updateForm("username", event.target.value)}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-medium outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      placeholder="아이디를 입력해 주세요."
                    />
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Password</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => updateForm("password", event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    placeholder="비밀번호를 입력해 주세요."
                  />
                </label>

                <button
                  onClick={() => void submit()}
                  disabled={isSubmitting || isLoadingBranches}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  로그인
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        <div className="rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-xs font-black text-slate-700 shadow-lg backdrop-blur">
          {session.username} · {session.branchName ?? session.branch}
        </div>
        <button
          onClick={() => void signOut()}
          disabled={isSubmitting}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          로그아웃
        </button>
      </div>
    </>
  );
}
