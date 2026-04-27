"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  ClipboardList,
  FilePlus2,
  Filter,
  FolderOpen,
  HardDrive,
  Home,
  LogOut,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserCog,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { aiHarnessSteps, modules, nasMetrics, workItems as seedItems } from "@/lib/ops-data";
import { createClient } from "@/lib/supabase";
import {
  createRequest as createDbRequest,
  deleteRequest as deleteDbRequest,
  ensureProfile,
  fetchRequests,
  updateRequestStatus
} from "@/lib/ops-repository";
import { StatusPill } from "@/components/status-pill";
import type { UserRole, WorkItem, WorkPriority, WorkStatus } from "@/types/ops";
import type { User } from "@supabase/supabase-js";

type MenuKey = "dashboard" | "queue" | "equipment" | "as" | "subly" | "nas" | "audit";
type AuditEvent = { id: string; at: string; actor: string; event: string };
type RequestForm = { module: string; title: string; requester: string; priority: WorkPriority; description: string; amount: string; vendor: string };
type EquipmentForm = { item: string; count: number; unitPrice: number; campus: string };
type SublyForm = { item: string; quantity: number; vendor: string; delivery: string };
type WebDavResult = {
  ok: boolean;
  configured: boolean;
  status?: number;
  latencyMs?: number;
  message: string;
  items: Array<{ name: string; path: string; type: "folder" | "file"; size: number | null; modified: string | null }>;
};

const storageKey = "academy-ops-hub-state-v2";

const roles: { value: UserRole; label: string }[] = [
  { value: "general", label: "일반" },
  { value: "academy_admin", label: "학원 관리자" },
  { value: "executive", label: "경영진" },
  { value: "super_admin", label: "최고 관리자" },
  { value: "nas_admin", label: "NAS 관리자" }
];

const menuItems: { key: MenuKey; label: string; icon: LucideIcon }[] = [
  { key: "dashboard", label: "대시보드", icon: Home },
  { key: "queue", label: "요청 큐", icon: ClipboardList },
  { key: "equipment", label: "장비 구매", icon: PackageCheck },
  { key: "as", label: "A/S", icon: Stethoscope },
  { key: "subly", label: "서블리", icon: Printer },
  { key: "nas", label: "NAS", icon: HardDrive },
  { key: "audit", label: "감사/AI", icon: Activity }
];

const statuses: Array<WorkStatus | "전체"> = ["전체", "접수", "검토", "승인 대기", "진행", "완료", "보류"];
const initialAudit: AuditEvent[] = [
  { id: "AUD-1", at: "11:42", actor: "Router AI", event: "AOH-1042 구매 승인 요청으로 분류" },
  { id: "AUD-2", at: "11:36", actor: "Reviewer AI", event: "A/S 요청 FAQ 실패 판단, 업체 티켓 권고" },
  { id: "AUD-3", at: "11:20", actor: "NAS 관리자", event: "신규 직원 권한 요청 접수" }
];

const defaultForm: RequestForm = {
  module: "전산 장비",
  title: "",
  requester: "강남캠퍼스",
  priority: "보통",
  description: "",
  amount: "",
  vendor: ""
};

function canApprove(role: UserRole, item: WorkItem) {
  if (role === "super_admin") return item.status !== "완료";
  if (role === "executive") return item.status === "승인 대기";
  if (role === "academy_admin") return item.status === "접수" && item.owner === "학원 관리자";
  if (role === "nas_admin") return item.module === "NAS";
  return false;
}

function nextStatus(status: WorkStatus): WorkStatus {
  const flow: WorkStatus[] = ["접수", "검토", "승인 대기", "진행", "완료"];
  return flow[Math.min(flow.indexOf(status) + 1, flow.length - 1)];
}

function diagnose(text: string) {
  const value = text.toLowerCase();
  if (value.includes("인터넷") || value.includes("wifi") || value.includes("와이파이")) return { category: "네트워크", answer: "공유기 전원, IP 충돌, 회선 상태를 순서대로 확인하세요.", escalation: true };
  if (value.includes("빔") || value.includes("화면") || value.includes("프로젝터")) return { category: "영상 장비", answer: "입력 소스, HDMI 케이블, 램프 시간을 확인하세요.", escalation: true };
  if (value.includes("nas") || value.includes("접속") || value.includes("raidrive")) return { category: "NAS", answer: "MFA, NAS 그룹 권한, RaiDrive 접속 주소를 확인하세요.", escalation: false };
  return { category: "미분류", answer: "사진, 장비명, 발생 시간을 추가한 뒤 전산 검토로 접수하세요.", escalation: true };
}

function makeId(items: WorkItem[]) {
  const max = items.reduce((value, item) => Math.max(value, Number(item.id.replace("AOH-", "")) || 0), 1042);
  return `AOH-${max + 1}`;
}

export function OpsConsole() {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [syncState, setSyncState] = useState("데모 모드");
  const [activeMenu, setActiveMenu] = useState<MenuKey>("dashboard");
  const [role, setRole] = useState<UserRole>("academy_admin");
  const [items, setItems] = useState<WorkItem[]>(seedItems);
  const [audit, setAudit] = useState<AuditEvent[]>(initialAudit);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WorkStatus | "전체">("전체");
  const [selectedId, setSelectedId] = useState(seedItems[0]?.id ?? "");
  const [form, setForm] = useState<RequestForm>(defaultForm);
  const [equipment, setEquipment] = useState<EquipmentForm>({ item: "노트북", count: 12, unitPrice: 1500000, campus: "강남캠퍼스" });
  const [symptom, setSymptom] = useState("빔프로젝터 화면이 깜박이고 소리가 끊김");
  const [subly, setSubly] = useState<SublyForm>({ item: "겨울 방학 홍보물", quantity: 1500, vendor: "Subly Print", delivery: "4월 30일" });
  const [nasUser, setNasUser] = useState("new.staff@academy.local");
  const [webdav, setWebdav] = useState<WebDavResult | null>(null);
  const [webdavLoading, setWebdavLoading] = useState(false);

  useEffect(() => {
    if (supabase) return;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { items?: WorkItem[]; audit?: AuditEvent[] };
      if (parsed.items?.length) setItems(parsed.items);
      if (parsed.audit?.length) setAudit(parsed.audit);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [supabase]);

  useEffect(() => {
    if (supabase) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ items, audit }));
  }, [items, audit, supabase]);

  const loadDbRequests = useCallback(async (nextUser = user) => {
    if (!supabase || !nextUser) return;
    try {
      setSyncState("DB 동기화 중");
      await ensureProfile(supabase, nextUser);
      const rows = await fetchRequests(supabase);
      setItems(rows.length ? rows : seedItems);
      setSelectedId(rows[0]?.id ?? seedItems[0]?.id ?? "");
      setSyncState("Supabase 연결됨");
    } catch (error) {
      setSyncState(error instanceof Error ? error.message : "DB 동기화 실패");
    }
  }, [supabase, user]);

  useEffect(() => {
    if (!supabase) return;

    let alive = true;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      setUser(data.user);
      if (data.user) {
        await loadDbRequests(data.user);
      } else {
        setSyncState("로그인 필요");
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void loadDbRequests(nextUser);
      } else {
        setItems(seedItems);
        setSyncState("로그인 필요");
      }
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [supabase, loadDbRequests]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const statusMatch = status === "전체" || item.status === status;
      const text = `${item.id} ${item.module} ${item.title} ${item.requester} ${item.owner}`.toLowerCase();
      return statusMatch && text.includes(query.toLowerCase());
    });
  }, [items, query, status]);

  const diagnosis = diagnose(symptom);
  const pendingCount = items.filter((item) => item.status !== "완료").length;
  const approvalCount = items.filter((item) => item.status === "승인 대기").length;
  const riskCount = items.filter((item) => item.priority === "긴급" || item.status === "보류").length;

  const addAudit = (actor: string, event: string) => {
    const at = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    setAudit((current) => [{ id: `AUD-${Date.now()}`, at, actor, event }, ...current]);
  };

  const addRequest = async (request: Omit<WorkItem, "id">) => {
    const id = makeId(items);
    const next = { id, ...request };
    try {
      if (supabase && user) {
        await createDbRequest(supabase, user, next);
        await loadDbRequests(user);
      } else {
        setItems((current) => [next, ...current]);
      }
      setSelectedId(id);
      setActiveMenu("queue");
      addAudit("Router AI", `${id} ${request.module} 요청 접수`);
    } catch (error) {
      setSyncState(error instanceof Error ? error.message : "요청 생성 실패");
    }
  };

  const updateItem = (id: string, patch: Partial<WorkItem>, event: string) => {
    const nextItem = items.find((item) => item.id === id);
    const patched = nextItem ? { ...nextItem, ...patch } : null;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    addAudit(roles.find((item) => item.value === role)?.label ?? "사용자", event);
    if (supabase && patched) {
      updateRequestStatus(supabase, patched).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "상태 저장 실패");
      });
    }
  };

  const approve = (item: WorkItem) => {
    if (role === "academy_admin" && item.status === "접수") {
      updateItem(
        item.id,
        {
          status: "승인 대기",
          owner: "최고 관리자",
          audit: "학원 관리자 승인 완료 - 최고 관리자 승인 대기",
          approvalStep: 1,
          approvedByAcademyAdmin: true
        },
        `${item.id} 학원 관리자 승인`
      );
      return;
    }

    if (role === "super_admin" && item.status === "승인 대기") {
      updateItem(
        item.id,
        {
          status: "진행",
          owner: item.module === "NAS" ? "NAS 관리자" : item.module === "A/S" ? "전산" : "경영지원",
          audit: "최고 관리자 승인 완료 - 담당 부서 진행",
          approvalStep: (item.approvalStep ?? 1) + 1
        },
        `${item.id} 최고 관리자 승인`
      );
      return;
    }

    updateItem(item.id, { status: nextStatus(item.status), audit: `${role} 승인 처리`, approvalStep: (item.approvalStep ?? 0) + 1 }, `${item.id} 승인 진행`);
  };
  const reject = (item: WorkItem) => updateItem(item.id, { status: "보류", audit: "반려 또는 보완 요청" }, `${item.id} 보류 처리`);
  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId(items.find((item) => item.id !== id)?.id ?? "");
    addAudit("관리자", `${id} 삭제`);
    if (supabase) {
      deleteDbRequest(supabase, id).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "삭제 실패");
      });
    }
  };

  const createManualRequest = () => {
    if (!form.title.trim()) return;
    addRequest({
      module: form.module,
      title: form.title,
      requester: form.requester,
      owner: form.module === "NAS" ? "NAS 관리자" : form.module === "A/S" ? "전산" : "경영지원",
      status: "접수",
      priority: form.priority,
      due: "신규",
      audit: "Router AI 분류 대기",
      description: form.description,
      amount: form.amount,
      vendor: form.vendor,
      approvalStep: 0,
      source: "admin_console"
    });
    setForm(defaultForm);
  };

  const createEquipment = () => {
    const total = equipment.count * equipment.unitPrice;
    addRequest({
      module: "전산 장비",
      title: `${equipment.campus} ${equipment.item} ${equipment.count}대 구매`,
      requester: equipment.campus,
      owner: "경영지원",
      status: total >= 10000000 ? "승인 대기" : "검토",
      priority: total >= 10000000 ? "높음" : "보통",
      due: "이번 주",
      audit: "예산 산출 및 승인 라우팅 완료",
      amount: `${equipment.count}대 / ${total.toLocaleString("ko-KR")}원`,
      vendor: "미정",
      approvalStep: total >= 10000000 ? 2 : 1,
      source: "admin_console"
    });
  };

  const createAsTicket = () => addRequest({
    module: "A/S",
    title: `${diagnosis.category} A/S 접수`,
    requester: "운영팀",
    owner: "전산",
    status: diagnosis.escalation ? "진행" : "검토",
    priority: diagnosis.escalation ? "높음" : "보통",
    due: "내일",
    audit: diagnosis.escalation ? "FAQ 후 업체 접수 필요" : "FAQ 가이드 우선 안내",
    description: `${symptom}\n\nAI 진단: ${diagnosis.answer}`,
    vendor: diagnosis.escalation ? "협력 업체 배정 대기" : "내부 처리"
  });

  const createSubly = () => addRequest({
    module: "서블리",
    title: `${subly.item} ${subly.quantity.toLocaleString("ko-KR")}부 제작`,
    requester: "마케팅",
    owner: "구매",
    status: "검토",
    priority: subly.quantity >= 2000 ? "높음" : "보통",
    due: subly.delivery,
    audit: "견적 요청서 생성",
    amount: `${subly.quantity.toLocaleString("ko-KR")}부`,
    vendor: subly.vendor,
    description: "견적 수령 후 경영 승인, 발주, 배송 완료 순서로 진행"
  });

  const createNasRequest = () => addRequest({
    module: "NAS",
    title: `${nasUser} NAS/RaiDrive 권한 요청`,
    requester: "인사",
    owner: "NAS 관리자",
    status: "접수",
    priority: "보통",
    due: "오늘",
    audit: "MFA 확인 필요",
    description: "신규 직원 공용 NAS 접속 권한과 RaiDrive 안내 필요"
  });

  const checkWebDav = async () => {
    setWebdavLoading(true);
    try {
      const response = await fetch("/api/nas/webdav", { cache: "no-store" });
      const data = await response.json() as WebDavResult;
      setWebdav(data);
    } catch (error) {
      setWebdav({
        ok: false,
        configured: true,
        message: error instanceof Error ? error.message : "WebDAV check failed",
        items: []
      });
    } finally {
      setWebdavLoading(false);
    }
  };

  const resetLocal = () => {
    if (supabase) {
      void loadDbRequests();
      return;
    }
    setItems(seedItems);
    setAudit(initialAudit);
    setSelectedId(seedItems[0]?.id ?? "");
    window.localStorage.removeItem(storageKey);
  };

  const submitAuth = async () => {
    if (!supabase) return;
    try {
      setSyncState("인증 중");
      const result =
        authMode === "signin"
          ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
          : await supabase.auth.signUp({
              email: authEmail,
              password: authPassword,
              options: { data: { full_name: authName || authEmail.split("@")[0] } }
            });
      if (result.error) throw result.error;
      if (result.data.user) await ensureProfile(supabase, result.data.user);
      setSyncState(authMode === "signin" ? "로그인됨" : "회원가입 완료");
    } catch (error) {
      setSyncState(error instanceof Error ? error.message : "인증 실패");
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSyncState("로그아웃됨");
  };

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Academy Ops Hub</p>
            <h1 className="text-xl font-bold">운영 통합 콘솔</h1>
          </div>
          <div className="ml-auto hidden min-w-[260px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 md:flex">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="요청 번호, 캠퍼스, 담당 검색" />
          </div>
          <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="focus-ring h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold" aria-label="역할 선택">
            {roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <span className="hidden rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-slate-600 lg:inline-flex">{syncState}</span>
          <button onClick={signOut} className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700" aria-label="로그아웃">
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[256px_minmax(0,1fr)] lg:px-8">
        <nav className="lg:sticky lg:top-[73px] lg:self-start">
          <div className="surface flex gap-2 overflow-x-auto rounded-lg p-4 lg:grid">
            <div className="hidden border-b border-gray-200 pb-4 lg:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <HardDrive className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-bold">Ops Hub</p>
                  <p className="text-xs text-gray-500">v0.1.0</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-600">업무 부하</span>
                  <span className="text-gray-900">{pendingCount}</span>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(pendingCount * 12, 100)}%` }} /></div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-600">승인 대기</span>
                  <span className="text-gray-900">{approvalCount}</span>
                </div>
                <div className="progress-track"><div className="h-full rounded-full bg-yellow-500" style={{ width: `${Math.min(approvalCount * 18, 100)}%` }} /></div>
              </div>
            </div>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = activeMenu === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveMenu(item.key)}
                  className={`focus-ring inline-flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${active ? "border border-blue-200 bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0">
          {supabase && !user ? (
            <AuthPanel
              email={authEmail}
              password={authPassword}
              name={authName}
              mode={authMode}
              message={syncState}
              setEmail={setAuthEmail}
              setPassword={setAuthPassword}
              setName={setAuthName}
              setMode={setAuthMode}
              submit={submitAuth}
            />
          ) : (
            <>
              {activeMenu === "dashboard" ? <Dashboard pendingCount={pendingCount} approvalCount={approvalCount} riskCount={riskCount} auditCount={audit.length} setActiveMenu={setActiveMenu} /> : null}
              {activeMenu === "queue" ? <QueueScreen items={filteredItems} selectedItem={selectedItem} role={role} status={status} setStatus={setStatus} setSelectedId={setSelectedId} approve={approve} reject={reject} remove={remove} form={form} setForm={setForm} createManualRequest={createManualRequest} /> : null}
              {activeMenu === "equipment" ? <EquipmentScreen equipment={equipment} setEquipment={setEquipment} createEquipment={createEquipment} /> : null}
              {activeMenu === "as" ? <AsScreen symptom={symptom} setSymptom={setSymptom} diagnosis={diagnosis.answer} createAsTicket={createAsTicket} /> : null}
              {activeMenu === "subly" ? <SublyScreen subly={subly} setSubly={setSubly} createSubly={createSubly} /> : null}
              {activeMenu === "nas" ? <NasScreen nasUser={nasUser} setNasUser={setNasUser} createNasRequest={createNasRequest} webdav={webdav} webdavLoading={webdavLoading} checkWebDav={checkWebDav} /> : null}
              {activeMenu === "audit" ? <AuditScreen audit={audit} resetLocal={resetLocal} /> : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function AuthPanel(props: {
  email: string;
  password: string;
  name: string;
  mode: "signin" | "signup";
  message: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setName: (value: string) => void;
  setMode: (value: "signin" | "signup") => void;
  submit: () => void;
}) {
  return (
    <section className="surface-strong mx-auto max-w-md rounded-xl p-5">
      <div>
        <h2 className="text-2xl font-bold">로그인</h2>
        <p className="mt-1 text-sm text-muted-foreground">Supabase Auth 연결됨. 로그인하면 요청 큐가 DB와 동기화됩니다.</p>
      </div>
      <div className="mt-5 grid gap-3">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button onClick={() => props.setMode("signin")} className={`h-9 rounded-md text-sm font-semibold ${props.mode === "signin" ? "bg-white shadow-sm" : "text-slate-500"}`}>로그인</button>
          <button onClick={() => props.setMode("signup")} className={`h-9 rounded-md text-sm font-semibold ${props.mode === "signup" ? "bg-white shadow-sm" : "text-slate-500"}`}>가입</button>
        </div>
        {props.mode === "signup" ? <input value={props.name} onChange={(event) => props.setName(event.target.value)} className="field" placeholder="이름" /> : null}
        <input value={props.email} onChange={(event) => props.setEmail(event.target.value)} className="field" placeholder="email@academy.local" type="email" />
        <input value={props.password} onChange={(event) => props.setPassword(event.target.value)} className="field" placeholder="비밀번호" type="password" />
        <button onClick={props.submit} className="focus-ring inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
          {props.mode === "signin" ? "로그인" : "계정 생성"}
        </button>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{props.message}</p>
      </div>
    </section>
  );
}

function Screen({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
      {children}
    </section>
  );
}

function Dashboard(props: { pendingCount: number; approvalCount: number; riskCount: number; auditCount: number; setActiveMenu: (menu: MenuKey) => void }) {
  return (
    <Screen title="대시보드" desc="오늘 처리할 운영 업무를 요약합니다.">
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="진행 업무" value={props.pendingCount.toString()} icon={ClipboardList} />
        <Metric label="승인 대기" value={props.approvalCount.toString()} icon={ShieldCheck} />
        <Metric label="위험 신호" value={props.riskCount.toString()} icon={AlertTriangle} />
        <Metric label="감사 로그" value={props.auditCount.toString()} icon={Activity} />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article key={module.name} className="surface-strong rounded-lg p-5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-sm font-bold">{module.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{module.description}</p>
              <button onClick={() => props.setActiveMenu(module.name.includes("장비") ? "equipment" : module.name.includes("A/S") ? "as" : module.name.includes("서블리") ? "subly" : "nas")} className="focus-ring mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50">
                열기
              </button>
            </article>
          );
        })}
      </section>
    </Screen>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <article className="surface-strong rounded-lg p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5 text-gray-500" aria-hidden="true" />
      </div>
      <strong className="mt-3 block text-3xl">{value}</strong>
    </article>
  );
}

function QueueScreen(props: {
  items: WorkItem[];
  selectedItem?: WorkItem;
  role: UserRole;
  status: WorkStatus | "전체";
  setStatus: (value: WorkStatus | "전체") => void;
  setSelectedId: (value: string) => void;
  approve: (item: WorkItem) => void;
  reject: (item: WorkItem) => void;
  remove: (id: string) => void;
  form: RequestForm;
  setForm: (value: RequestForm) => void;
  createManualRequest: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const openDetail = (id: string) => {
    props.setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <Screen title="요청 큐" desc="모든 요청의 진행 상태와 승인 액션을 관리합니다.">
      <QueueTable {...props} openCreate={() => setCreateOpen(true)} openDetail={openDetail} />
      {createOpen ? (
        <Modal title="요청 접수" onClose={() => setCreateOpen(false)}>
          <RequestComposer
            form={props.form}
            setForm={props.setForm}
            createRequest={() => {
              props.createManualRequest();
              setCreateOpen(false);
            }}
          />
        </Modal>
      ) : null}
      {detailOpen && props.selectedItem ? (
        <Modal title="요청 상세" onClose={() => setDetailOpen(false)}>
          <DetailPanel item={props.selectedItem} role={props.role} approve={() => props.approve(props.selectedItem!)} reject={() => props.reject(props.selectedItem!)} />
        </Modal>
      ) : null}
    </Screen>
  );
}

function QueueTable(props: {
  items: WorkItem[];
  role: UserRole;
  status: WorkStatus | "전체";
  setStatus: (value: WorkStatus | "전체") => void;
  setSelectedId: (value: string) => void;
  approve: (item: WorkItem) => void;
  reject: (item: WorkItem) => void;
  remove: (id: string) => void;
  openCreate: () => void;
  openDetail: (id: string) => void;
}) {
  return (
    <section className="surface-strong min-w-0 overflow-hidden rounded-lg">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <h3 className="font-bold">업무 목록</h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <select value={props.status} onChange={(event) => props.setStatus(event.target.value as WorkStatus | "전체")} className="bg-transparent text-sm outline-none" aria-label="상태 필터">
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <button onClick={props.openCreate} className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700">
            접수
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-sm">
          <thead className="bg-slate-50/80 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">번호</th><th className="px-4 py-3">요청</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">담당</th><th className="px-4 py-3">액션</th></tr>
          </thead>
          <tbody>
            {props.items.map((item) => (
              <tr key={item.id} className="border-t border-border hover:bg-blue-50/40">
                <td className="px-4 py-3 font-bold text-blue-700">{item.id}</td>
                <td className="px-4 py-3">
                  <button onClick={() => props.openDetail(item.id)} className="text-left font-semibold hover:text-blue-700">{item.title}</button>
                  <div className="mt-1 text-xs text-muted-foreground">{item.module} · {item.requester} · {item.priority} · {item.due}</div>
                </td>
                <td className="px-4 py-3"><StatusPill status={item.status} /></td>
                <td className="px-4 py-3">{item.owner}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <IconButton label="승인" disabled={!canApprove(props.role, item)} onClick={() => props.approve(item)} icon={Check} tone="text-emerald-700" />
                    <IconButton label="보류" disabled={!canApprove(props.role, item)} onClick={() => props.reject(item)} icon={X} tone="text-rose-700" />
                    <IconButton label="삭제" disabled={props.role !== "super_admin"} onClick={() => props.remove(item.id)} icon={Trash2} tone="text-muted-foreground" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EquipmentScreen({ equipment, setEquipment, createEquipment }: { equipment: EquipmentForm; setEquipment: (value: EquipmentForm) => void; createEquipment: () => void }) {
  const total = equipment.count * equipment.unitPrice;
  return (
    <Screen title="장비 구매" desc="장비 수량과 예산을 입력하면 승인 단계가 자동 배정됩니다.">
      <FormPanel icon={PackageCheck} title="구매 요청서">
        <input value={equipment.campus} onChange={(event) => setEquipment({ ...equipment, campus: event.target.value })} className="field" aria-label="캠퍼스" />
        <div className="grid grid-cols-2 gap-2">
          <input value={equipment.item} onChange={(event) => setEquipment({ ...equipment, item: event.target.value })} className="field" aria-label="장비명" />
          <input type="number" value={equipment.count} onChange={(event) => setEquipment({ ...equipment, count: Number(event.target.value) })} className="field" aria-label="수량" />
        </div>
        <input type="number" value={equipment.unitPrice} onChange={(event) => setEquipment({ ...equipment, unitPrice: Number(event.target.value) })} className="field" aria-label="단가" />
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">총액 {total.toLocaleString("ko-KR")}원 · {total >= 10000000 ? "경영진 승인 필요" : "관리자 검토"}</p>
        <ActionButton onClick={createEquipment} label="구매 요청 생성" />
      </FormPanel>
    </Screen>
  );
}

function AsScreen({ symptom, setSymptom, diagnosis, createAsTicket }: { symptom: string; setSymptom: (value: string) => void; diagnosis: string; createAsTicket: () => void }) {
  return (
    <Screen title="A/S" desc="증상 진단 후 내부 처리 또는 업체 접수로 라우팅합니다.">
      <FormPanel icon={Stethoscope} title="증상 진단">
        <textarea value={symptom} onChange={(event) => setSymptom(event.target.value)} className="min-h-32 rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-500" aria-label="증상" />
        <p className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">{diagnosis}</p>
        <ActionButton onClick={createAsTicket} label="A/S 요청 생성" />
      </FormPanel>
    </Screen>
  );
}

function SublyScreen({ subly, setSubly, createSubly }: { subly: SublyForm; setSubly: (value: SublyForm) => void; createSubly: () => void }) {
  return (
    <Screen title="서블리" desc="제작물 견적 요청, 승인, 발주, 배송 추적을 시작합니다.">
      <FormPanel icon={Printer} title="견적 요청서">
        <input value={subly.item} onChange={(event) => setSubly({ ...subly, item: event.target.value })} className="field" aria-label="제작물" />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={subly.quantity} onChange={(event) => setSubly({ ...subly, quantity: Number(event.target.value) })} className="field" aria-label="부수" />
          <input value={subly.delivery} onChange={(event) => setSubly({ ...subly, delivery: event.target.value })} className="field" aria-label="납기" />
        </div>
        <input value={subly.vendor} onChange={(event) => setSubly({ ...subly, vendor: event.target.value })} className="field" aria-label="업체" />
        <ActionButton onClick={createSubly} label="견적 요청 생성" />
      </FormPanel>
    </Screen>
  );
}

function NasScreen({
  nasUser,
  setNasUser,
  createNasRequest,
  webdav,
  webdavLoading,
  checkWebDav
}: {
  nasUser: string;
  setNasUser: (value: string) => void;
  createNasRequest: () => void;
  webdav: WebDavResult | null;
  webdavLoading: boolean;
  checkWebDav: () => void;
}) {
  return (
    <Screen title="NAS" desc="용량과 권한 상태를 확인하고 접속 권한 요청을 생성합니다.">
      <section className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          {nasMetrics.map((metric) => (
            <article key={metric.label} className="surface-strong rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">{metric.label}</span>
                <HardDrive className="h-5 w-5 text-gray-500" aria-hidden="true" />
              </div>
              <div className="mt-4 text-3xl font-bold">{metric.value}</div>
              <p className="mt-1 text-xs text-gray-500">{metric.detail}</p>
              <div className="mt-3 progress-track">
                <div className={`h-full rounded-full ${metric.health === "주의" ? "bg-yellow-500" : metric.health === "위험" ? "bg-red-500" : "bg-green-500"}`} style={{ width: metric.value.includes("%") ? metric.value : "62%" }} />
              </div>
            </article>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="surface-strong rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Server className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-bold">WebDAV 연결 확인</h3>
                  <p className="text-sm text-gray-500">NAS_WEBDAV_URL 환경변수로 실제 NAS 상태를 확인합니다.</p>
                </div>
              </div>
              <button onClick={checkWebDav} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700">
                <RefreshCw className={`h-4 w-4 ${webdavLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                확인
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">상태</p>
                  <p className="text-sm text-gray-500">{webdav?.message ?? "아직 확인하지 않았습니다."}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${webdav?.ok ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                  {webdav?.ok ? "연결됨" : webdav?.configured === false ? "설정 필요" : "대기"}
                </span>
              </div>
              {webdav?.latencyMs ? <p className="mt-2 text-xs text-gray-500">응답 {webdav.latencyMs}ms · HTTP {webdav.status ?? "-"}</p> : null}
            </div>

            <div className="mt-4 grid gap-2">
              {(webdav?.items ?? []).length ? (
                webdav!.items.map((item) => (
                  <div key={`${item.path}-${item.name}`} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderOpen className={`h-4 w-4 ${item.type === "folder" ? "text-blue-600" : "text-gray-500"}`} aria-hidden="true" />
                      <span className="truncate font-medium">{item.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{item.size ? `${Math.round(item.size / 1024)}KB` : item.type}</span>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">WebDAV 항목 없음</p>
              )}
            </div>
          </section>

          <FormPanel icon={HardDrive} title="권한 요청">
            <input value={nasUser} onChange={(event) => setNasUser(event.target.value)} className="field" aria-label="NAS 사용자" />
            <ActionButton onClick={createNasRequest} label="권한 요청 생성" />
          </FormPanel>
        </div>
      </section>
    </Screen>
  );
}

function AuditScreen({ audit, resetLocal }: { audit: AuditEvent[]; resetLocal: () => void }) {
  return (
    <Screen title="감사/AI" desc="AI Harness 단계와 운영 감사 로그를 확인합니다.">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AuditLog audit={audit} resetLocal={resetLocal} />
        <AiHarness />
      </section>
    </Screen>
  );
}

function FormPanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="surface-strong max-w-xl rounded-lg p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h3 className="font-bold">{title}</h3>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function ActionButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button onClick={onClick} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"><FilePlus2 className="h-4 w-4" aria-hidden="true" />{label}</button>;
}

function IconButton({ label, disabled, onClick, icon: Icon, tone }: { label: string; disabled: boolean; onClick: () => void; icon: LucideIcon; tone: string }) {
  return <button onClick={onClick} disabled={disabled} className={`focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 ${tone}`} aria-label={label}><Icon className="h-4 w-4" aria-hidden="true" /></button>;
}

function RequestComposer({ form, setForm, createRequest }: { form: RequestForm; setForm: (value: RequestForm) => void; createRequest: () => void }) {
  return (
    <section>
      <div className="grid gap-3">
        <select value={form.module} onChange={(event) => setForm({ ...form, module: event.target.value })} className="field" aria-label="모듈">
          <option>전산 장비</option><option>A/S</option><option>부품 구매</option><option>서블리</option><option>NAS</option>
        </select>
        <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="field" placeholder="요청 제목" />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.requester} onChange={(event) => setForm({ ...form, requester: event.target.value })} className="field" placeholder="요청 부서" />
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as WorkPriority })} className="field" aria-label="우선순위">
            <option>낮음</option><option>보통</option><option>높음</option><option>긴급</option>
          </select>
        </div>
        <input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="field" placeholder="예산 또는 수량" />
        <input value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} className="field" placeholder="업체" />
        <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-20 rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-500" placeholder="상세 내용" />
        <ActionButton onClick={createRequest} label="접수" />
      </div>
    </section>
  );
}

function DetailPanel({ item, role, approve, reject }: { item: WorkItem; role: UserRole; approve: () => void; reject: () => void }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold text-blue-700">{item.id}</p><h3 className="mt-1 font-bold">{item.title}</h3></div>
        <StatusPill status={item.status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="모듈" value={item.module} /><Info label="요청자" value={item.requester} /><Info label="담당" value={item.owner} /><Info label="우선순위" value={item.priority} /><Info label="예산/수량" value={item.amount || "-"} /><Info label="업체" value={item.vendor || "-"} />
      </dl>
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-line">{item.description || item.audit}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button disabled={!canApprove(role, item)} onClick={approve} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" aria-hidden="true" />승인</button>
        <button disabled={!canApprove(role, item)} onClick={reject} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true" />보류</button>
      </div>
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50" aria-label="닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>;
}

function AuditLog({ audit, resetLocal }: { audit: AuditEvent[]; resetLocal: () => void }) {
  return (
    <section className="surface-strong rounded-lg p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="font-bold">감사 로그</h3><button onClick={resetLocal} className="focus-ring inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold hover:bg-gray-50">초기화</button></div>
      <div className="mt-3 grid gap-2">
        {audit.map((item) => <div key={item.id} className="grid gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm md:grid-cols-[80px_140px_1fr]"><span className="text-muted-foreground">{item.at}</span><strong>{item.actor}</strong><span>{item.event}</span></div>)}
      </div>
    </section>
  );
}

function AiHarness() {
  return (
    <section className="surface-strong rounded-lg p-5">
      <div className="flex items-center gap-2"><UserCog className="h-5 w-5 text-blue-600" aria-hidden="true" /><h3 className="font-bold">AI Harness</h3></div>
      <div className="mt-3 space-y-3">
        {aiHarnessSteps.map((step) => {
          const Icon = step.icon;
          return <div key={step.label} className="flex gap-3 text-sm"><Icon className="mt-0.5 h-4 w-4 text-blue-600" aria-hidden="true" /><div><strong>{step.label}</strong><p className="text-muted-foreground">{step.text}</p></div></div>;
        })}
      </div>
    </section>
  );
}
