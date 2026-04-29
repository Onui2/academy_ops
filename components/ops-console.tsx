"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ClipboardList,
  CalendarDays,
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
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { 
  aiHarnessSteps, 
  equipmentParts, 
  modules, 
  partsCategories,
  workItems as seedItems 
} from "@/lib/ops-data";
import { diagnosisPatterns } from "@/lib/diagnosis-data";
import { buildDanawaSearchUrl, buildGmarketSearchUrl, resolveDanawaQuery, resolveGmarketQuery } from "@/lib/part-price-catalog";
import { createClient } from "@/lib/supabase";
import { useLivePartPrices } from "@/lib/use-live-part-prices";
import {
  createAuditLog,
  createNasPermissionRequest,
  createRequest as createDbRequest,
  decideApprovalStep,
  deleteRequest as deleteDbRequest,
  ensureProfile,
  fetchNasPermissions,
  fetchProfileRole,
  fetchRequests,
  updateRequestStatus
} from "@/lib/ops-repository";
import { StatusPill } from "@/components/status-pill";
import type { TeacherSession } from "@/lib/teacher-session";
import type { BasketItem, EquipmentPart, UserRole, WorkItem, WorkPriority, WorkStatus } from "@/types/ops";
import type { User } from "@supabase/supabase-js";

type MenuKey = "dashboard" | "queue" | "equipment" | "parts" | "tablet" | "as" | "nas" | "audit" | "subly";
type AuditEvent = { id: string; at: string; actor: string; event: string };
type RequestForm = {
  module: string;
  requestItem: string;
  title: string;
  requester: string;
  requesterContact: string;
  neededDate: string;
  priority: WorkPriority;
  description: string;
  amount: string;
  vendor: string;
};
type EquipmentForm = {
  item: string;
  count: number;
  unitPrice: number;
  academy: string;
  neededDate: string;
  processType: string;
  userName: string;
  purpose: string;
  roles: string[];
  notes: string;
};
type TabletForm = {
  academy: string;
  model: string;
  count: number;
  duration: string;
  purpose: string;
  neededDate: string;
  requestType: "신규" | "연장" | "반납";
  assetTag: string;
};
type WebDavTargetInput = {
  id: string;
  name: string;
  protocol: "https" | "http";
  host: string;
  port: string;
  path: string;
  url: string;
  username: string;
  password: string;
};
type WebDavResult = {
  ok: boolean;
  configured: boolean;
  status?: number;
  latencyMs?: number;
  message: string;
  targets?: Array<{ id: string; name: string; ok: boolean; status?: number; latencyMs?: number; message: string; items: Array<{ name: string; path: string; type: "folder" | "file"; size: number | null; modified: string | null }> }>;
  items: Array<{ name: string; path: string; type: "folder" | "file"; size: number | null; modified: string | null; targetName?: string }>;
};
type NasPermissionRecord = {
  id: string;
  user_email: string;
  resource_name: string;
  permission_level: string;
  status: string;
  created_at: string;
};
type FaqCategory = {
  id: string;
  title: string;
  desc: string;
  items: typeof diagnosisPatterns;
};

const storageKey = "academy-ops-hub-state-v2";
const webdavTargetsKey = "academy-ops-hub-webdav-targets-v1";
const teacherSessionPollMs = 15000;

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
  { key: "parts", label: "부품 구매", icon: Search },
  { key: "tablet", label: "태블릿 렌탈", icon: PackageCheck },
  { key: "as", label: "A/S", icon: Stethoscope },
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
  requestItem: "데스크톱 본체",
  title: "",
  requester: "학원본사",
  requesterContact: "",
  neededDate: new Date().toISOString().slice(0, 10),
  priority: "보통",
  description: "",
  amount: "",
  vendor: ""
};

const requestItemOptions = ["데스크톱 본체", "노트북", "모니터", "태블릿", "네트워크/NAS", "기타 장비"] as const;

function formatDateLabel(value: string) {
  if (!value) return "날짜를 선택해 주세요";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function addBusinessDays(start: Date, days: number) {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}

function getLeadBusinessDays(form: RequestForm) {
  if (form.priority === "긴급") return 0;
  if (form.module === "NAS") return 7;
  if (form.module !== "전산 장비") return 3;
  if (form.requestItem === "데스크톱 본체") return 5;
  if (form.requestItem === "모니터") return 3;
  if (form.requestItem === "노트북" || form.requestItem === "태블릿") return 4;
  if (form.requestItem === "네트워크/NAS" || form.requestItem === "기타 장비") return 7;
  return 4;
}

function readLocalOpsState() {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return { items: [] as WorkItem[], audit: [] as AuditEvent[] };
  }

  try {
    const parsed = JSON.parse(raw) as { items?: WorkItem[]; audit?: AuditEvent[] };
    return {
      items: parsed.items ?? [],
      audit: parsed.audit ?? []
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return { items: [] as WorkItem[], audit: [] as AuditEvent[] };
  }
}

function getEarliestSelectableDate(form: RequestForm) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (form.priority === "긴급" && !isWeekend(today)) {
    return today;
  }

  return addBusinessDays(today, getLeadBusinessDays(form));
}

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

function buildWebDavUrl(target: WebDavTargetInput) {
  if (!target.host.trim()) return target.url.trim();
  const cleanHost = target.host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const cleanPath = target.path.startsWith("/") ? target.path : `/${target.path}`;
  const port = target.port ? `:${target.port}` : "";
  return `${target.protocol}://${cleanHost}${port}${cleanPath}`;
}

function normalizeWebDavTarget(target: Partial<WebDavTargetInput>): WebDavTargetInput {
  return {
    id: target.id ?? target.name?.replace(/\s+/g, "-").toLowerCase() ?? "nas",
    name: target.name ?? "NAS",
    protocol: target.protocol ?? "https",
    host: target.host ?? "",
    port: target.port ?? (target.protocol === "http" ? "5005" : "5006"),
    path: target.path ?? "/webdav/",
    url: target.url ?? "",
    username: target.username ?? "",
    password: target.password ?? ""
  };
}

function isAdminRole(role: UserRole) {
  return role === "academy_admin" || role === "super_admin" || role === "nas_admin" || role === "executive";
}

export function OpsConsole() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [teacherSession, setTeacherSession] = useState<TeacherSession | null>(null);
  const [syncState, setSyncState] = useState("데이터 연동 중");
  const [activeMenu, setActiveMenu] = useState<MenuKey>("dashboard");
  const [role, setRole] = useState<UserRole>("super_admin");
  const [partsBasket, setPartsBasket] = useState<BasketItem[]>([]);
  const allPartIds = useMemo(() => equipmentParts.map((part) => part.id), []);
  const { quotes: livePartQuotes, isLoading: isPartPriceLoading, lastCheckedAt: partPricesCheckedAt, refresh: refreshPartPrices } = useLivePartPrices(allPartIds, activeMenu === "parts");
  const liveEquipmentParts = useMemo(
    () =>
      equipmentParts.map((part) => ({
        ...part,
        price: livePartQuotes[part.id]?.price ?? part.price
      })),
    [livePartQuotes]
  );
  const [symptom, setSymptom] = useState("빔프로젝터 화면이 깜박이고 소리가 끊김");
  const [items, setItems] = useState<WorkItem[]>(seedItems);
  const [audit, setAudit] = useState<AuditEvent[]>(initialAudit);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WorkStatus | "전체">("전체");
  const [selectedId, setSelectedId] = useState(seedItems[0]?.id ?? "");
  const [form, setForm] = useState<RequestForm>(defaultForm);
  const [equipment, setEquipment] = useState<EquipmentForm>({
    item: "데스크톱",
    count: 1,
    unitPrice: 0,
    academy: "",
    neededDate: new Date().toISOString().slice(0, 10),
    processType: "신규 구매",
    userName: "",
    purpose: "",
    roles: ["데스크"],
    notes: ""
  });
  const [tablet, setTablet] = useState<TabletForm>({
    academy: "",
    model: "iPad Air (5th Gen)",
    count: 1,
    duration: "36개월",
    purpose: "교재 열람용",
    neededDate: new Date().toISOString().slice(0, 10),
    requestType: "신규",
    assetTag: ""
  });
  const [nasUser, setNasUser] = useState("new.staff@academy.local");
  const [nasResource, setNasResource] = useState("공용 NAS");
  const [nasPermissionLevel, setNasPermissionLevel] = useState<"read" | "write" | "admin">("read");
  const [nasPermissionRows, setNasPermissionRows] = useState<NasPermissionRecord[]>([]);
  const [webdav, setWebdav] = useState<WebDavResult | null>(null);
  const [webdavLoading, setWebdavLoading] = useState(false);
  const [webdavTargets, setWebdavTargets] = useState<WebDavTargetInput[]>([]);
  const [webdavDraft, setWebdavDraft] = useState<WebDavTargetInput>({
    id: "main",
    name: "메인 NAS",
    protocol: "https",
    host: "",
    port: "5006",
    path: "/webdav/",
    url: "",
    username: "",
    password: ""
  });
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [showWebDavModal, setShowWebDavModal] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "error" | "info" }>>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now().toString();
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    if (supabase && user) return;
    const localState = readLocalOpsState();
    if (localState.items.length) setItems(localState.items);
    if (localState.audit.length) setAudit(localState.audit);
  }, [supabase, user]);

  useEffect(() => {
    if (supabase && user) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ items, audit }));
  }, [items, audit, supabase, user]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      if (supabase && user) return;

      const localState = readLocalOpsState();
      setItems(localState.items.length ? localState.items : seedItems);
      setAudit(localState.audit.length ? localState.audit : initialAudit);
      setSelectedId((current) => {
        if (localState.items.some((item) => item.id === current)) return current;
        return localState.items[0]?.id ?? seedItems[0]?.id ?? "";
      });
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [supabase, user]);

  useEffect(() => {
    const raw = window.localStorage.getItem(webdavTargetsKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as WebDavTargetInput[];
      setWebdavTargets(Array.isArray(parsed) ? parsed.map(normalizeWebDavTarget) : []);
    } catch {
      window.localStorage.removeItem(webdavTargetsKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(webdavTargetsKey, JSON.stringify(webdavTargets));
  }, [webdavTargets]);

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

  const loadDbRequests = useCallback(async (nextUser = user) => {
    if (!supabase || !nextUser) return;
    try {
      setSyncState("DB 동기화 중");
      await ensureProfile(supabase, nextUser);
      const profileRole = await fetchProfileRole(supabase, nextUser);
      setRole(profileRole);
      const rows = await fetchRequests(supabase);
      const localItems = readLocalOpsState().items;
      const mergedRows = [...rows, ...localItems.filter((item) => !rows.some((row) => row.id === item.id))];
      const nasRows = await fetchNasPermissions(supabase).catch(() => []);
      setItems(mergedRows.length ? mergedRows : seedItems);
      setNasPermissionRows((nasRows ?? []) as NasPermissionRecord[]);
      setSelectedId(mergedRows[0]?.id ?? seedItems[0]?.id ?? "");
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
        setSyncState("Teacher 세션 로컬 모드");
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void loadDbRequests(nextUser);
      } else {
        const localState = readLocalOpsState();
        setItems(localState.items.length ? localState.items : seedItems);
        setAudit(localState.audit.length ? localState.audit : initialAudit);
        setSelectedId(localState.items[0]?.id ?? seedItems[0]?.id ?? "");
        setSyncState("Teacher 세션 로컬 모드");
      }
    });

    // Realtime subscription for ops_requests
    const channel = supabase
      .channel("ops_requests_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ops_requests" },
        () => {
          if (user) {
            void loadDbRequests(user);
          }
        }
      )
      .subscribe();

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [supabase, loadDbRequests, user]);

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

  const loadTeacherRequests = useCallback(async () => {
    if (!teacherSession || user) return;

    try {
      setSyncState("Teacher 포털 요청 동기화 중");
      const response = await fetch("/api/portal/requests", {
        method: "GET",
        cache: "no-store"
      });

      const data = (await response.json()) as { items?: WorkItem[]; message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "teacher 요청 목록을 불러오지 못했습니다.");
      }

      const remoteItems = Array.isArray(data.items) ? data.items : [];
      const localState = readLocalOpsState();
      const mergedItems = [...remoteItems, ...localState.items.filter((item) => !remoteItems.some((remote) => remote.id === item.id))];
      setItems(mergedItems.length ? mergedItems : seedItems);
      setAudit(localState.audit.length ? localState.audit : initialAudit);
      setSelectedId(mergedItems[0]?.id ?? seedItems[0]?.id ?? "");
      setRole(teacherSession.portalRole === "admin" ? "super_admin" : "general");
      setSyncState("Teacher 세션 서버 동기화");
    } catch (error) {
      setSyncState(error instanceof Error ? error.message : "teacher 요청 동기화 실패");
      const localState = readLocalOpsState();
      setItems(localState.items.length ? localState.items : seedItems);
      setAudit(localState.audit.length ? localState.audit : initialAudit);
      setSelectedId(localState.items[0]?.id ?? seedItems[0]?.id ?? "");
    }
  }, [teacherSession, user]);

  useEffect(() => {
    if (!teacherSession || user) return;
    void loadTeacherRequests();
  }, [teacherSession, user, loadTeacherRequests]);

  useEffect(() => {
    if (!teacherSession || user) return;

    const syncTeacherRequests = () => {
      if (document.visibilityState === "visible") {
        void loadTeacherRequests();
      }
    };

    const intervalId = window.setInterval(syncTeacherRequests, teacherSessionPollMs);
    window.addEventListener("focus", syncTeacherRequests);
    document.addEventListener("visibilitychange", syncTeacherRequests);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncTeacherRequests);
      document.removeEventListener("visibilitychange", syncTeacherRequests);
    };
  }, [teacherSession, user, loadTeacherRequests]);

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
  const visibleMenuItems = menuItems.filter(
    (item) => item.key !== "equipment" && item.key !== "parts" && (item.key !== "audit" || isAdminRole(role))
  );

  useEffect(() => {
    if (activeMenu === "audit" && !isAdminRole(role)) {
      setActiveMenu("dashboard");
    }
  }, [activeMenu, role]);

  const addAudit = (actor: string, event: string, requestId?: string) => {
    const at = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    const newLog: AuditEvent = { id: `AUD-${Date.now()}`, at, actor, event };
    setAudit((current) => [newLog, ...current]);
    
    if (supabase && user) {
      createAuditLog(supabase, {
        request_id: requestId,
        actor_id: user.id,
        actor_label: actor,
        event: event
      }).catch(err => console.error("Audit log sync failed", err));
    }
  };

  const addRequest = async (request: Omit<WorkItem, "id">) => {
    const id = makeId(items);
    const next = { id, ...request };
    try {
      if (supabase && user) {
        await createDbRequest(supabase, user, next);
        await loadDbRequests(user);
      } else if (teacherSession) {
        const response = await fetch("/api/portal/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ item: next })
        });

        const data = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(data.message ?? "teacher 요청 생성에 실패했습니다.");
        }

        await loadTeacherRequests();
      } else {
        setItems((current) => [next, ...current]);
      }
      setSelectedId(id);
      setActiveMenu("queue");
      addAudit("Router AI", `${id} ${request.module} 요청 접수`);
      addToast(`${id} 요청이 성공적으로 접수되었습니다.`, "success");
      return next;
    } catch (error) {
      setSyncState(error instanceof Error ? error.message : "요청 생성 실패");
      addToast("요청 생성 중 오류가 발생했습니다.", "error");
    }
  };

  const updateItem = async (id: string, patch: Partial<WorkItem>, event: string) => {
    const nextItem = items.find((item) => item.id === id);
    const patched = nextItem ? { ...nextItem, ...patch } : null;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    addAudit(roles.find((item) => item.value === role)?.label ?? "사용자", event);
    if (supabase && patched) {
      await updateRequestStatus(supabase, patched).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "상태 저장 실패");
      });
    } else if (teacherSession && patched) {
      await fetch(`/api/portal/requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ item: patched })
      }).then(async (response) => {
        const data = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(data.message ?? "teacher 요청 상태 저장에 실패했습니다.");
        }
      }).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "teacher 상태 저장 실패");
      });
    }
  };

  const approve = async (item: WorkItem) => {
    if (role === "academy_admin" && item.status === "접수") {
      await updateItem(
        item.id,
        {
          status: "승인 대기",
          owner: "최고 관리자",
          audit: "학원 관리자 승인 완료 - 최고 관리자 승인 대기",
          approvalStep: 1,
          approvedByAcademyAdmin: true,
          approvalNote: item.approvalNote
        },
        `${item.id} 학원 관리자 승인`
      );
      if (supabase && user) {
        await decideApprovalStep(supabase, item.id, role, "approved", item.approvalNote).catch((error) => {
          setSyncState(error instanceof Error ? error.message : "승인 단계 기록 실패");
        });
      }
      addToast(`${item.id} 학원 관리자 승인이 완료되었습니다.`, "success");
      return;
    }

    if (role === "super_admin" && item.status === "승인 대기") {
      await updateItem(
        item.id,
        {
          status: "진행",
          owner: item.module === "NAS" ? "NAS 관리자" : item.module === "A/S" ? "전산" : "경영지원",
          audit: "최고 관리자 승인 완료 - 담당 부서 진행",
          approvalStep: (item.approvalStep ?? 1) + 1,
          approvalNote: item.approvalNote
        },
        `${item.id} 최고 관리자 승인`
      );
      if (supabase && user) {
        await decideApprovalStep(supabase, item.id, role, "approved", item.approvalNote).catch((error) => {
          setSyncState(error instanceof Error ? error.message : "승인 단계 기록 실패");
        });
      }
      addToast(`${item.id} 최종 승인이 완료되어 담당자에게 전달되었습니다.`, "success");
      return;
    }

    await updateItem(item.id, { status: nextStatus(item.status), audit: `${role} 승인 처리`, approvalStep: (item.approvalStep ?? 0) + 1, approvalNote: item.approvalNote }, `${item.id} 승인 진행`);
    if (supabase && user) {
      await decideApprovalStep(supabase, item.id, role, "approved", item.approvalNote).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "승인 단계 기록 실패");
      });
    }
    addToast(`${item.id} 승인 처리되었습니다.`, "success");
  };
  const reject = async (item: WorkItem) => {
    await updateItem(item.id, { status: "보류", audit: item.rejectionNote || "반려 또는 보완 요청", rejectionNote: item.rejectionNote || "보완 필요" }, `${item.id} 보류 처리`);
    if (supabase && user) {
      await decideApprovalStep(supabase, item.id, role, "rejected", item.rejectionNote).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "보류 단계 기록 실패");
      });
    }
    addToast(`${item.id} 요청이 보류 처리되었습니다.`, "info");
  };
  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId(items.find((item) => item.id !== id)?.id ?? "");
    addAudit("관리자", `${id} 삭제`);
    if (supabase && user) {
      deleteDbRequest(supabase, id).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "삭제 실패");
        addToast("데이터 삭제에 실패했습니다.", "error");
      });
    } else if (teacherSession) {
      fetch(`/api/portal/requests/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }).then(async (response) => {
        const data = (await response.json()) as { message?: string };
        if (!response.ok) {
          throw new Error(data.message ?? "teacher 요청 삭제에 실패했습니다.");
        }
        await loadTeacherRequests();
      }).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "teacher 삭제 실패");
        addToast("데이터 삭제에 실패했습니다.", "error");
      });
    }
    addToast("요청이 삭제되었습니다.", "info");
  };

  const createManualRequest = async (): Promise<WorkItem | null> => {
    if (!form.title.trim()) return null;
    const created = await addRequest({
      module: form.module,
      title: form.title,
      requester: form.requester,
      owner: form.module === "NAS" ? "NAS 관리자" : form.module === "A/S" ? "전산" : "경영지원",
      status: "접수",
      priority: form.priority,
      due: form.neededDate || "신규",
      audit: "Router AI 분류 대기",
      description: [
        `요청 부서/지점: ${form.requester}`,
        `요청 품목: ${form.requestItem || "미지정"}`,
        `담당 연락처: ${form.requesterContact || "미입력"}`,
        `희망 처리일: ${form.neededDate || "미정"}`,
        "",
        form.description
      ].filter(Boolean).join("\n"),
      amount: form.amount,
      vendor: form.vendor,
      approvalStep: 0,
      source: "admin_console"
    });
    setForm(defaultForm);
    return created ?? null;
  };

  const createEquipment = () => {
    const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);
    const isDesktop = equipment.item === "데스크톱";
    const basePrice = isDesktop ? basketTotal : equipment.unitPrice;
    const total = equipment.count * basePrice;
    const needsAccountingConfirm = total > 500000;

    const configLines = isDesktop
      ? [
          "--- 부품 메뉴 선택 기준 ---",
          ...(partsBasket.length > 0
            ? partsBasket.map((part) => `${part.category}: ${part.name} (${part.price.toLocaleString()}원)`)
            : ["선택된 부품 없음"])
        ]
      : [];

    const basketLines = !isDesktop && partsBasket.length > 0
      ? ["--- 추가 구성품 (장바구니) ---", ...partsBasket.map(p => `${p.name}: ${p.price.toLocaleString()}원`)]
      : [];

    addRequest({
      module: "전산 장비",
      title: `${equipment.academy} ${equipment.item} ${equipment.count}대 구매`,
      requester: equipment.academy,
      owner: "경영지원",
      status: needsAccountingConfirm ? "승인 대기" : "검토",
      priority: (total >= 1500000 || equipment.count >= 2) ? "높음" : "보통",
      due: equipment.neededDate || "이번 주",
      audit: needsAccountingConfirm ? "50만원 초과 구매로 회계팀 컨펌 필요" : "예산 산출 및 승인 라우팅 완료",
      amount: `${equipment.count}대 / ${total.toLocaleString("ko-KR")}원`,
      vendor: "미정",
      description: [
        needsAccountingConfirm ? "안내: 50만원 초과 건은 회계팀에 컨펌 후 작성 부탁드립니다." : "",
        `품목: ${equipment.item}`,
        ...configLines,
        ...basketLines,
        `수량: ${equipment.count}`,
        `본체/본품 단가: ${basePrice.toLocaleString()}원`,
        `장비 사용자: ${equipment.userName || "미입력"}`,
        `사용 목적: ${equipment.purpose || "미입력"}`,
        `전달 사항: ${equipment.notes || "없음"}`
      ].filter(Boolean).join("\n"),
      approvalStep: needsAccountingConfirm ? 2 : 1,
      source: "admin_console"
    });
  };

  const createAsTicket = () => addRequest({
    module: "A/S",
    title: symptom,
    requester: "학원본사",
    owner: "전산",
    status: diagnosis.escalation ? "진행" : "검토",
    priority: diagnosis.escalation ? "높음" : "보통",
    due: "신규",
    audit: diagnosis.escalation ? "AI 진단 후 전산 배정" : "FAQ 가이드 우선 안내",
    description: `${symptom}\n\nAI 진단: ${diagnosis.answer}`,
    vendor: diagnosis.escalation ? "협력 업체 배정 대기" : "내부 처리",
    amount: "0",
    approvalStep: 0,
    source: "admin_console"
  });

  const createNasRequest = async () => {
    if (!nasUser.trim()) return;

    if (supabase && user) {
      await createNasPermissionRequest(supabase, {
        user_email: nasUser.trim(),
        resource_name: nasResource.trim() || "공용 NAS",
        permission_level: nasPermissionLevel,
        requested_by: user.id
      }).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "NAS 권한 요청 저장 실패");
      });
    }

    await addRequest({
      module: "NAS",
      title: `${nasUser} ${nasResource} 권한 요청`,
      requester: "인사",
      owner: "NAS 관리자",
      status: "접수",
      priority: nasPermissionLevel === "admin" ? "높음" : "보통",
      due: "오늘",
      audit: "MFA 확인 및 권한 가이드 발송 대기",
      description: `요청 대상: ${nasUser}\n리소스: ${nasResource}\n권한 수준: ${nasPermissionLevel}\n안내: RaiDrive/WebDAV 접속 가이드 자동 발송 대상`
    });
  };
  
  const createTabletRequest = () => {
    const requestLabel = tablet.requestType === "연장" ? "연장" : tablet.requestType === "반납" ? "반납" : "렌탈";
    const auditNote =
      tablet.requestType === "연장"
        ? "만료 일정 확인 후 렌탈 연장 협의"
        : tablet.requestType === "반납"
          ? "반납 회수 일정 조율 대기"
          : "렌탈 업체 견적 요청 대기";

    return addRequest({
      module: "태블릿 렌탈",
      title: `${tablet.academy} ${tablet.model} ${tablet.count}대 ${requestLabel}`,
      requester: tablet.academy,
      owner: "경영지원",
      status: "접수",
      priority: tablet.requestType === "반납" ? "보통" : "높음",
      due: tablet.neededDate,
      audit: auditNote,
      description: [
        `처리 유형: ${tablet.requestType}`,
        `모델: ${tablet.model}`,
        `수량: ${tablet.count}대`,
        `기간: ${tablet.duration}`,
        `용도: ${tablet.purpose}`,
        tablet.assetTag ? `자산 태그: ${tablet.assetTag}` : ""
      ].filter(Boolean).join("\n"),
      amount: `${tablet.count}대 / ${tablet.duration}`,
      vendor: "미정",
      approvalStep: 0,
      source: "admin_console"
    });
  };

  const checkWebDav = async () => {
    setWebdavLoading(true);
    try {
      const response = webdavTargets.length
        ? await fetch("/api/nas/webdav", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targets: webdavTargets }),
            cache: "no-store"
          })
        : await fetch("/api/nas/webdav", { cache: "no-store" });
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

  const addWebDavTarget = () => {
    const url = buildWebDavUrl(webdavDraft);
    if (!webdavDraft.name || !url || !webdavDraft.username || !webdavDraft.password) return;
    const next = {
      ...webdavDraft,
      url,
      id: webdavDraft.id || webdavDraft.name.replace(/\s+/g, "-").toLowerCase()
    };
    setWebdavTargets((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    setWebdavDraft({ id: "", name: "", protocol: "https", host: "", port: "5006", path: "/", url: "", username: "", password: "" });
    setEditingTargetId(null);
    setShowWebDavModal(false);
  };

  const startEditWebDavTarget = (target: WebDavTargetInput) => {
    setEditingTargetId(target.id);
    setWebdavDraft(target);
    setShowWebDavModal(true);
  };

  const cancelEditWebDavTarget = () => {
    setEditingTargetId(null);
    setShowWebDavModal(false);
    setWebdavDraft({ id: "", name: "", protocol: "https", host: "", port: "5006", path: "/", url: "", username: "", password: "" });
  };

  const removeWebDavTarget = (id: string) => {
    setWebdavTargets((current) => current.filter((item) => item.id !== id));
    if (editingTargetId === id) cancelEditWebDavTarget();
  };

  const disconnectWebDav = (id: string) => {
    // Simulating disconnection by resetting the result in the UI
    if (webdav?.targets) {
        setWebdav({
            ...webdav,
            targets: webdav.targets.filter(t => t.id !== id)
        });
    }
  };

  const resetLocal = () => {
    if (supabase && user) {
      void loadDbRequests();
      return;
    }
    if (teacherSession) {
      void loadTeacherRequests();
      return;
    }
    setItems(seedItems);
    setAudit(initialAudit);
    setSelectedId(seedItems[0]?.id ?? "");
    window.localStorage.removeItem(storageKey);
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    await fetch("/api/teacher/session", { method: "DELETE" }).catch(() => undefined);
    setTeacherSession(null);
    setUser(null);
    setSyncState("로그아웃됨");
    router.replace("/");
    router.refresh();
  };

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 sm:text-[10px]">Management Support Ops</p>
            <h1 className="truncate text-lg font-black tracking-tight text-slate-900 sm:text-xl">경영지원 운영 허브</h1>
          </div>
          <div className="ml-auto hidden min-w-[260px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 md:flex">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="제목, 학원, 담당 검색" />
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span className="hidden rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 lg:inline-flex">
              {syncState}
            </span>
            <span className="hidden rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-bold sm:inline-flex md:px-3 md:py-2 md:text-sm">
              {roles.find((item) => item.value === role)?.label ?? "관리자"}
            </span>
            <button onClick={signOut} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 sm:h-10 sm:w-10" aria-label="로그아웃">
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[256px_minmax(0,1fr)] lg:px-8">
        <nav className="lg:sticky lg:top-[73px] lg:self-start">
          <div className="surface flex gap-1 overflow-x-auto rounded-xl p-2 scrollbar-hide lg:grid lg:gap-2 lg:p-4">
            <div className="hidden border-b border-gray-200 pb-4 lg:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <HardDrive className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">경영지원 운영</p>
                  <p className="text-xs text-gray-500">지점별 행정 업무 신청</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-600">업무 부하</span>
                  <span className="text-gray-900">{pendingCount}</span>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(pendingCount * 12, 100)}%` }} /></div>
              </div>
            </div>
            {visibleMenuItems.map((item) => {
              const Icon = item.icon;
              const active = activeMenu === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveMenu(item.key)}
                  className={`focus-ring flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition sm:text-sm lg:gap-3 lg:px-3 ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0">
          <>
            {activeMenu === "dashboard" ? <Dashboard pendingCount={pendingCount} approvalCount={approvalCount} riskCount={riskCount} auditCount={audit.length} setActiveMenu={setActiveMenu} /> : null}
            {activeMenu === "queue" ? <QueueScreen items={filteredItems} selectedItem={selectedItem} role={role} status={status} setStatus={setStatus} setSelectedId={setSelectedId} approve={approve} reject={reject} remove={remove} form={form} setForm={setForm} createManualRequest={createManualRequest} /> : null}
            {activeMenu === "equipment" ? <EquipmentScreen equipment={equipment} setEquipment={setEquipment} createEquipment={createEquipment} partsBasket={partsBasket} setPartsBasket={setPartsBasket} setActiveMenu={setActiveMenu} /> : null}
            {activeMenu === "parts" ? (
              <PartsScreen
                addRequest={addRequest}
                setActiveMenu={setActiveMenu}
                partsBasket={partsBasket}
                setPartsBasket={setPartsBasket}
                addToast={addToast}
                parts={liveEquipmentParts}
                livePartQuotes={livePartQuotes}
                isPriceLoading={isPartPriceLoading}
                lastCheckedAt={partPricesCheckedAt}
                refreshPrices={refreshPartPrices}
              />
            ) : null}
            {activeMenu === "tablet" ? <TabletScreen tablet={tablet} setTablet={setTablet} createTabletRequest={createTabletRequest} role={role} /> : null}
            {activeMenu === "as" ? <AsScreen symptom={symptom} setSymptom={setSymptom} diagnosis={diagnosis.answer} createAsTicket={createAsTicket} /> : null}
            {activeMenu === "nas" ? (
              <NasScreen 
                nasUser={nasUser} 
                setNasUser={setNasUser} 
                nasResource={nasResource}
                setNasResource={setNasResource}
                nasPermissionLevel={nasPermissionLevel}
                setNasPermissionLevel={setNasPermissionLevel}
                nasPermissionRows={nasPermissionRows}
                createNasRequest={createNasRequest} 
                webdav={webdav} 
                webdavLoading={webdavLoading} 
                checkWebDav={checkWebDav} 
                webdavTargets={webdavTargets} 
                webdavDraft={webdavDraft} 
                setWebdavDraft={setWebdavDraft} 
                addWebDavTarget={addWebDavTarget} 
                removeWebDavTarget={removeWebDavTarget} 
                editingTargetId={editingTargetId}
                startEditWebDavTarget={startEditWebDavTarget}
                cancelEditWebDavTarget={cancelEditWebDavTarget}
                disconnectWebDav={disconnectWebDav}
                showWebDavModal={showWebDavModal}
                setShowWebDavModal={setShowWebDavModal}
                setEditingTargetId={setEditingTargetId}
              />
            ) : null}
            {activeMenu === "audit" ? <AuditScreen audit={audit} resetLocal={resetLocal} /> : null}
          </>
        </div>
      </div>

      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-in slide-in-from-right-5 fade-in duration-300 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md ${
              toast.type === "success" ? "border-emerald-200 bg-emerald-50/90 text-emerald-800" : 
              toast.type === "error" ? "border-rose-200 bg-rose-50/90 text-rose-800" : 
              "border-blue-200 bg-blue-50/90 text-blue-800"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : toast.type === "error" ? <AlertTriangle className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

function Screen({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 sm:gap-5">
      <div>
        <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">{desc}</p>
      </div>
      {children}
    </section>
  );
}

function Dashboard(props: { pendingCount: number; approvalCount: number; riskCount: number; auditCount: number; setActiveMenu: (menu: MenuKey) => void }) {
  return (
    <Screen title="대시보드" desc="오늘 처리할 운영 업무를 요약합니다.">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="진행 업무" value={props.pendingCount.toString()} icon={ClipboardList} />
        <Metric label="승인 대기" value={props.approvalCount.toString()} icon={ShieldCheck} />
        <Metric label="위험 신호" value={props.riskCount.toString()} icon={AlertTriangle} />
        <Metric label="감사 로그" value={props.auditCount.toString()} icon={Activity} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="surface-strong rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold">주간 운영 요청 추이</h3>
            <span className="text-xs font-semibold text-slate-500">최근 7일</span>
          </div>
          <div className="flex h-56 items-end gap-3 px-2">
            {[45, 62, 58, 85, 72, 90, 65].map((height, i) => (
              <div key={i} className="group relative flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-black text-slate-900 mb-1">{height}</span>
                <div 
                  className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-500 hover:from-blue-500 hover:to-blue-300 shadow-sm" 
                  style={{ height: `${(height / 90) * 100}%` }}
                >
                </div>
                <span className="text-[11px] font-bold text-slate-500 mt-1">{["월", "화", "수", "목", "금", "토", "일"][i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-strong rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold">모듈별 요청 분포</h3>
            <div className="flex gap-2">
              <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-blue-500"></div><span className="text-[10px] text-slate-500">전산</span></div>
              <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-emerald-500"></div><span className="text-[10px] text-slate-500">NAS</span></div>
              <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-amber-500"></div><span className="text-[10px] text-slate-500">A/S</span></div>
            </div>
          </div>
          <div className="relative flex items-center justify-center py-4">
            <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3b82f6" strokeWidth="12" strokeDasharray="251.2" strokeDashoffset={251.2 * 0.4} className="transition-all duration-1000" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="12" strokeDasharray="251.2" strokeDashoffset={251.2 * 0.7} className="transition-all duration-1000" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f59e0b" strokeWidth="12" strokeDasharray="251.2" strokeDashoffset={251.2 * 0.9} className="transition-all duration-1000" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-slate-800">{props.pendingCount + props.approvalCount}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Total Tasks</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article key={module.name} className="surface-strong rounded-lg p-5 shadow-sm border border-slate-100 transition-all hover:shadow-md">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-100">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-sm font-bold">{module.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground leading-relaxed">{module.description}</p>
              <button onClick={() => {
                const name = module.name;
                if (name.includes("장비")) window.location.href = "/user";
                else if (name.includes("A/S")) props.setActiveMenu("as");
                else if (name.includes("NAS")) props.setActiveMenu("nas");
                else if (name.includes("태블릿")) props.setActiveMenu("tablet");
                else if (name.includes("부품")) window.location.href = "/user";
              }} className="focus-ring mt-4 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold hover:bg-gray-50 transition-colors">
                모듈 열기
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
    <article className="surface-strong rounded-xl p-4 sm:p-5 shadow-sm border border-slate-50">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider sm:text-sm">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400 sm:h-9 sm:w-9">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </div>
      </div>
      <strong className="mt-2 block text-2xl font-black text-slate-900 sm:mt-4 sm:text-3xl">{value}</strong>
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
  createManualRequest: () => Promise<WorkItem | null>;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<WorkItem | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<WorkItem | null>(null);
  const [receiptItem, setReceiptItem] = useState<WorkItem | null>(null);

  const openDetail = (id: string) => {
    props.setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <Screen title="요청 큐" desc="모든 요청의 진행 상태와 승인 액션을 관리합니다.">
      <QueueTable {...props} openDetail={openDetail} openCreate={() => setCreateOpen(true)} />
      {createOpen ? (
        <Modal title="요청 접수" onClose={() => setCreateOpen(false)}>
          <RequestComposer
            form={props.form}
            setForm={props.setForm}
            createRequest={async () => {
              const created = await props.createManualRequest();
              if (created) {
                setReceiptItem(created);
                setCreateOpen(false);
              }
            }}
          />
        </Modal>
      ) : null}
      {receiptItem ? (
        <Modal title="접수 완료" onClose={() => setReceiptItem(null)}>
          <RequestReceiptCard item={receiptItem} onClose={() => setReceiptItem(null)} />
        </Modal>
      ) : null}
      {detailOpen && props.selectedItem ? (
        <Modal title="요청 상세" onClose={() => setDetailOpen(false)}>
          <DetailPanel item={props.selectedItem} role={props.role} approve={() => setApprovalTarget(props.selectedItem!)} reject={() => setRejectionTarget(props.selectedItem!)} />
        </Modal>
      ) : null}
      {approvalTarget ? (
        <Modal title="승인 의견" onClose={() => setApprovalTarget(null)}>
          <ApprovalNoteForm
            item={approvalTarget}
            onCancel={() => setApprovalTarget(null)}
            onSubmit={(note) => {
              props.approve({ ...approvalTarget, approvalNote: note });
              setApprovalTarget(null);
              setDetailOpen(false);
            }}
          />
        </Modal>
      ) : null}
      {rejectionTarget ? (
        <Modal title="보류 사유" onClose={() => setRejectionTarget(null)}>
          <DecisionNoteForm
            item={rejectionTarget}
            mode="reject"
            onCancel={() => setRejectionTarget(null)}
            onSubmit={(note) => {
              props.reject({ ...rejectionTarget, rejectionNote: note });
              setRejectionTarget(null);
              setDetailOpen(false);
            }}
          />
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
  openDetail: (id: string) => void;
  openCreate: () => void;
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
          <ActionButton onClick={props.openCreate} label="요청 접수" />
        </div>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-slate-50/80 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">요청</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">담당</th><th className="px-4 py-3">액션</th></tr>
          </thead>
          <tbody>
            {props.items.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-3"><div className="h-4 w-48 animate-pulse rounded bg-slate-100" /><div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-50" /></td>
                  <td className="px-4 py-3"><div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-slate-100" /></td>
                  <td className="px-4 py-3"><div className="h-8 w-24 animate-pulse rounded-lg bg-slate-100" /></td>
                </tr>
              ))
            ) : (
              props.items.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => props.openDetail(item.id)} className="text-left font-bold hover:text-blue-700 transition-colors">{item.title}</button>
                    <div className="mt-1 text-xs font-medium text-muted-foreground">{item.module} · {item.requester} · {item.priority} · {item.due}</div>
                  </td>
                  <td className="px-4 py-3"><StatusPill status={item.status} /></td>
                  <td className="px-4 py-3 font-medium text-slate-600">{item.owner}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <IconButton label="승인" disabled={!canApprove(props.role, item)} onClick={() => props.openDetail(item.id)} icon={Check} tone="text-emerald-700" />
                      <IconButton label="보류" disabled={!canApprove(props.role, item)} onClick={() => props.openDetail(item.id)} icon={X} tone="text-rose-700" />
                      <IconButton label="삭제" disabled={props.role !== "super_admin"} onClick={() => props.remove(item.id)} icon={Trash2} tone="text-muted-foreground" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-slate-100">
        {props.items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">요청이 없습니다.</div>
        ) : (
          props.items.map((item) => (
            <div key={item.id} className="p-4 active:bg-slate-50 transition-colors" onClick={() => props.openDetail(item.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 leading-tight truncate">{item.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-medium text-slate-500">
                    <span className="text-blue-600">{item.module}</span>
                    <span>{item.requester}</span>
                    <span className={item.priority === "긴급" ? "text-rose-600 font-bold" : ""}>{item.priority}</span>
                  </div>
                </div>
                <StatusPill status={item.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1 text-slate-600">
                  <span className="font-bold">담당:</span>
                  <span>{item.owner}</span>
                </div>
                <div className="text-slate-400">{item.due}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function EquipmentScreen({
  equipment,
  setEquipment,
  createEquipment,
  partsBasket,
  setPartsBasket,
  setActiveMenu
}: {
  equipment: EquipmentForm;
  setEquipment: (value: EquipmentForm) => void;
  createEquipment: () => void;
  partsBasket: BasketItem[];
  setPartsBasket: (v: BasketItem[]) => void;
  setActiveMenu: (menu: MenuKey) => void;
}) {
  const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);
  const isDesktop = equipment.item === "데스크톱";
  const basePrice = isDesktop ? basketTotal : equipment.unitPrice;
  const total = equipment.count * basePrice;

  return (
    <Screen title="장비 구매" desc="장비 종류를 선택해 요청하고, 데스크톱은 부품 메뉴에서 담은 구성을 기준으로 접수합니다.">
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="surface-strong overflow-hidden rounded-2xl">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <PackageCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-bold">장비 사양 및 요청서</h3>
              <p className="text-sm text-slate-500">
                {isDesktop ? "데스크톱은 부품 메뉴에서 담은 구성을 기준으로 요청합니다." : "구매하실 장비의 모델과 단가를 입력하세요."}
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            <EquipmentRow label="학원/지점">
              <input value={equipment.academy} onChange={(event) => setEquipment({ ...equipment, academy: event.target.value })} className="field w-full" placeholder="학원(지점)" />
            </EquipmentRow>
            <EquipmentRow label="품목">
              <select value={equipment.item} onChange={(event) => setEquipment({ ...equipment, item: event.target.value })} className="field w-full">
                <option>노트북</option>
                <option>데스크톱</option>
                <option>모니터</option>
                <option>태블릿</option>
                <option>네트워크/NAS</option>
                <option>기타 장비</option>
              </select>
            </EquipmentRow>

            {isDesktop ? (
              <div className="bg-blue-50/30 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-blue-900">🖥️ 데스크톱 구성 안내</h4>
                  <span className="text-xs font-bold text-blue-600">부품 합계 {basketTotal.toLocaleString()}원</span>
                </div>
                <div className="rounded-xl border border-blue-200 bg-white p-4 text-sm text-slate-600">
                  CPU 같은 세부 부품 선택은 여기서 하지 않고, `부품 구매` 메뉴에서 담은 구성으로 데스크톱 요청이 생성됩니다.
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveMenu("parts")}
                    className="focus-ring inline-flex h-10 items-center justify-center rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
                  >
                    추가하러 가기
                  </button>
                </div>
                {partsBasket.length === 0 ? (
                  <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">
                    아직 담긴 부품이 없습니다. `부품 구매` 메뉴에서 먼저 필요한 부품을 선택해 주세요.
                  </div>
                ) : null}
              </div>
            ) : (
              <EquipmentRow label="모델명 및 단가">
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={equipment.item === "노트북" ? (equipment.userName ? `${equipment.userName}님 노트북` : "신규 노트북") : equipment.item} className="field w-full" readOnly disabled />
                  <div className="relative">
                    <input type="number" min={0} value={equipment.unitPrice} onChange={(event) => setEquipment({ ...equipment, unitPrice: Number(event.target.value) })} className="field w-full pr-10" placeholder="대당 단가 입력" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">원</span>
                  </div>
                </div>
              </EquipmentRow>
            )}

            {partsBasket.length > 0 && (
              <div className="bg-slate-50 p-5">
                <div className="mb-3 flex items-center justify-between">
                   <h4 className="text-xs font-bold text-slate-800">📦 추가 구성품 (장바구니)</h4>
                   <button onClick={() => setPartsBasket([])} className="text-[10px] font-bold text-rose-500 hover:underline">비우기</button>
                </div>
                <div className="space-y-2">
                   {partsBasket.map((p) => (
                     <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px]">
                        <span className="font-medium text-slate-700">{p.name}</span>
                        <span className="font-bold text-slate-900">{p.price.toLocaleString()}원</span>
                     </div>
                   ))}
                </div>
              </div>
            )}

            <EquipmentRow label="수량">
              <div className="flex items-center gap-4">
                 <input type="number" min={1} value={equipment.count} onChange={(event) => setEquipment({ ...equipment, count: Number(event.target.value) })} className="field w-40" />
                 <span className="text-sm font-bold text-slate-400">대</span>
              </div>
            </EquipmentRow>

            <EquipmentRow label="장비 사용자">
              <div className="grid gap-3 md:grid-cols-2">
                <input value={equipment.userName} onChange={(event) => setEquipment({ ...equipment, userName: event.target.value })} className="field w-full" placeholder="성함 또는 직함" />
                <input value={equipment.purpose} onChange={(event) => setEquipment({ ...equipment, purpose: event.target.value })} className="field w-full" placeholder="사용 목적 (예: 상담실 업무용)" />
              </div>
            </EquipmentRow>

            <EquipmentRow label="기타 전달 사항">
              <textarea value={equipment.notes} onChange={(event) => setEquipment({ ...equipment, notes: event.target.value })} className="field min-h-[80px] w-full py-3" placeholder="설치 위치, 선호 브랜드, 기존 장비 반납 여부 등을 적어주세요." />
            </EquipmentRow>
          </div>

          <div className="grid gap-4 border-t border-slate-200 bg-slate-50/50 px-5 py-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-white border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-500 uppercase">
                  {isDesktop ? "부품 합계" : "본품 단가"} {basePrice.toLocaleString()}원
                </span>
                {!isDesktop && partsBasket.length > 0 ? <span className="text-[10px] font-bold text-blue-600">+ 구성품 {basketTotal.toLocaleString()}원</span> : null}
              </div>
              <div className={`text-2xl font-black tracking-tighter ${(equipment.count >= 2 || basePrice >= 700000) ? "text-rose-600" : "text-blue-600"}`}>
                <span className="mr-1 text-sm font-bold text-slate-400">총 견적</span>
                {total.toLocaleString()}원
              </div>
            </div>
            <button
              onClick={() => {
                setEquipment({ ...equipment, unitPrice: basePrice });
                createEquipment();
                if (isDesktop) setPartsBasket([]);
              }}
              className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all"
            >
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              구매 요청 생성
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="surface-strong rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h4 className="flex items-center gap-2 font-black text-slate-800 uppercase tracking-wider text-xs">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              결제 정책
            </h4>
            <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-600">
              <div className={`rounded-lg p-3 font-bold ${(equipment.count >= 2 || basePrice >= 700000) ? "bg-rose-50 text-rose-700 border border-rose-100" : "bg-blue-50 text-blue-700 border border-blue-100"}`}>
                 {(equipment.count >= 2 || basePrice >= 700000) ? "⚠️ 고액 결제 대상: 경영지원팀 및 회계팀의 상세 검토가 진행됩니다." : "✅ 일반 결제 대상: 학원 관리자 승인 후 즉시 집행 가능합니다."}
              </div>
              <p>• <strong>단가 70만원 이상</strong> 또는 <strong>수량 2대 이상</strong>은 고액 결제로 분류됩니다.</p>
              <p>• 사전에 다나와 등에서 실시간 최저가를 확인하여 단가를 입력하시면 승인이 더 빨라집니다.</p>
            </div>
          </div>

          <div className="surface-strong rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h4 className="flex items-center gap-2 font-black text-slate-800 uppercase tracking-wider text-xs">
              <Bot className="h-4 w-4 text-blue-600" />
              AI 진단 리포트
            </h4>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed">
              {total > 1500000 ? (
                <p>현재 구성은 <strong>[고성능]</strong> 등급입니다. 전문 영상 편집, 대용량 엑셀 작업 등 고성능이 필요한 직무에 권장합니다.</p>
              ) : basePrice > 750000 ? (
                <p>현재 구성은 <strong>[표준]</strong> 등급입니다. 학원 데스크 및 관리자분들이 사용하시기에 가장 적합한 사양입니다.</p>
              ) : (
                <p>현재 구성은 <strong>[기본]</strong> 등급입니다. 강사 선생님들의 강의 진행 및 수업용 PC로 최적화된 구성입니다.</p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </Screen>
  );
}

function EquipmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 bg-white md:grid-cols-[170px_1fr]">
      <div className="whitespace-nowrap bg-slate-50 px-5 py-4 text-sm font-bold text-slate-900">{label}</div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function AsScreen({ symptom, setSymptom, diagnosis, createAsTicket }: { symptom: string; setSymptom: (value: string) => void; diagnosis: string; createAsTicket: () => void }) {
  const faqCategories: FaqCategory[] = [
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
  ];

  return (
    <Screen title="A/S" desc="자주 묻는 질문을 먼저 확인하고, 해결되지 않으면 바로 요청 큐로 티켓을 생성합니다.">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {faqCategories.map((category) => (
              <article key={category.id} className="surface-strong rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Stethoscope className="h-5 w-5" aria-hidden="true" />
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
                      onClick={() => setSymptom(item.symptom)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <p className="text-sm font-bold text-slate-800">{item.symptom}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.solution[0]}</p>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <FormPanel icon={Stethoscope} title="직접 문의 / 티켓 생성">
            <textarea value={symptom} onChange={(event) => setSymptom(event.target.value)} className="min-h-32 rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-500" aria-label="증상" placeholder="예: 3층 강의실 모니터 화면이 안 나와요" />
            <p className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">{diagnosis}</p>
            <ActionButton onClick={createAsTicket} label="문의하고 요청 큐에 티켓 생성" />
          </FormPanel>
        </aside>
      </section>
    </Screen>
  );
}


function NasScreen({
  nasUser,
  setNasUser,
  nasResource,
  setNasResource,
  nasPermissionLevel,
  setNasPermissionLevel,
  nasPermissionRows,
  createNasRequest,
  webdav,
  webdavLoading,
  checkWebDav,
  webdavTargets,
  webdavDraft,
  setWebdavDraft,
  addWebDavTarget,
  removeWebDavTarget,
  editingTargetId,
  startEditWebDavTarget,
  cancelEditWebDavTarget,
  disconnectWebDav,
  showWebDavModal,
  setShowWebDavModal,
  setEditingTargetId
}: {
  nasUser: string;
  setNasUser: (value: string) => void;
  nasResource: string;
  setNasResource: (value: string) => void;
  nasPermissionLevel: "read" | "write" | "admin";
  setNasPermissionLevel: (value: "read" | "write" | "admin") => void;
  nasPermissionRows: NasPermissionRecord[];
  createNasRequest: () => void | Promise<void>;
  webdav: WebDavResult | null;
  webdavLoading: boolean;
  checkWebDav: () => void;
  webdavTargets: WebDavTargetInput[];
  webdavDraft: WebDavTargetInput;
  setWebdavDraft: (value: WebDavTargetInput) => void;
  addWebDavTarget: () => void;
  removeWebDavTarget: (id: string) => void;
  editingTargetId: string | null;
  startEditWebDavTarget: (target: WebDavTargetInput) => void;
  cancelEditWebDavTarget: () => void;
  disconnectWebDav: (id: string) => void;
  showWebDavModal: boolean;
  setShowWebDavModal: (value: boolean) => void;
  setEditingTargetId: (id: string | null) => void;
}) {
  return (
    <Screen title="NAS" desc="멀티 학원 환경을 중앙에서 한눈에 관리하고 연결 상태를 실시간 제어합니다.">
      <section className="grid gap-5">
        {showWebDavModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg animate-in fade-in zoom-in duration-200">
               <FormPanel icon={editingTargetId ? RefreshCw : HardDrive} title={editingTargetId ? "WebDAV 연결 수정" : "새로운 WebDAV 타겟 추가"}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500 mb-2 leading-relaxed">WebDAV 프로토콜을 통해 NAS 서버를 중앙 관리 큐에 연결합니다.</p>
                  </div>
                  
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">표시 이름</label>
                        <input value={webdavDraft.name} onChange={(event) => setWebdavDraft({ ...webdavDraft, name: event.target.value })} className="field" placeholder="예) 3층 교강사실 NAS" />
                    </div>

                    <div className="grid gap-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">연결 주소 및 경로</label>
                        <div className="grid grid-cols-[100px_1fr] gap-2">
                            <select value={webdavDraft.protocol} onChange={(event) => setWebdavDraft({ ...webdavDraft, protocol: event.target.value as "https" | "http", port: event.target.value === "https" ? "5006" : "5005" })} className="field text-xs">
                                <option value="https">HTTPS</option>
                                <option value="http">HTTP</option>
                            </select>
                            <input value={webdavDraft.host} onChange={(event) => setWebdavDraft({ ...webdavDraft, host: event.target.value })} className="field text-sm" placeholder="NAS 도메인 또는 IP" />
                        </div>
                        <div className="grid grid-cols-[100px_1fr] gap-2">
                            <input value={webdavDraft.port} onChange={(event) => setWebdavDraft({ ...webdavDraft, port: event.target.value })} className="field text-sm" placeholder="포트" />
                            <input value={webdavDraft.path} onChange={(event) => setWebdavDraft({ ...webdavDraft, path: event.target.value })} className="field text-sm" placeholder="경로 (예: /)" />
                        </div>
                        <p className="rounded-xl bg-blue-50 p-2 text-[10px] font-medium text-blue-700">
                            <strong>🔗 생성된 URL:</strong> {buildWebDavUrl(webdavDraft) || "주소를 입력하세요"}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">접속 아이디</label>
                            <input value={webdavDraft.username} onChange={(event) => setWebdavDraft({ ...webdavDraft, username: event.target.value })} className="field text-sm" placeholder="WebDAV 아이디" />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">패스워드</label>
                            <input value={webdavDraft.password} onChange={(event) => setWebdavDraft({ ...webdavDraft, password: event.target.value })} className="field text-sm" placeholder="비밀번호" type="password" />
                        </div>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button onClick={cancelEditWebDavTarget} className="flex-1 h-11 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50">취소</button>
                    <button onClick={addWebDavTarget} className="flex-[2] h-11 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 shadow-lg shadow-blue-200">
                        {editingTargetId ? "정보 업데이트" : "연결 활성화"}
                    </button>
                  </div>
               </FormPanel>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="surface-strong rounded-2xl p-6 shadow-sm border border-slate-100">
              <div className="mb-8 flex flex-wrap items-start justify-between gap-y-4 gap-x-2">
                <div className="flex items-center gap-4 min-w-[240px]">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-100">
                    <Server className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black tracking-tight text-slate-900 leading-tight">네트워크 스토리지 상태</h3>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">실시간 연결 및 타겟 제어</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={checkWebDav} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-100 active:scale-95">
                    <RefreshCw className={`h-3.5 w-3.5 ${webdavLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                    상태 동기화
                  </button>
                  <button onClick={() => { setEditingTargetId(null); setWebdavDraft({ id: "", name: "", protocol: "https", host: "", port: "5006", path: "/", url: "", username: "", password: "" }); setShowWebDavModal(true); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-all active:scale-95">
                    <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                    새 타겟 추가
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {webdavTargets.map((target) => {
                  const result = webdav?.targets?.find(t => t.id === target.id);
                  const isOnline = !!result?.ok;
                  
                  return (
                    <article key={target.id} className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 hover:border-blue-200 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-extrabold text-slate-900">{target.name}</p>
                            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500 ring-4 ring-emerald-50" : "bg-slate-300"}`} />
                          </div>
                          <p className="mt-2 whitespace-nowrap text-[10px] font-medium text-slate-400 tabular-nums tracking-tight">{target.url}</p>
                        </div>
                        <div className={`rounded-xl px-2.5 py-1 text-[10px] font-black uppercase ${isOnline ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-500"}`}>
                          {isOnline ? "Online" : "Offline"}
                        </div>
                      </div>
                      
                      {isOnline && (
                        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Latency</p>
                            <p className="text-sm font-black text-slate-700">{result?.latencyMs}ms</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Stored Files</p>
                            <p className="text-sm font-black text-slate-700">{result?.items.length} units</p>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex gap-2">
                        <button onClick={() => startEditWebDavTarget(target)} className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50">설정 수정</button>
                        {isOnline ? (
                            <button onClick={() => disconnectWebDav(target.id)} className="flex-1 rounded-xl bg-rose-50 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-100">연결 끊기</button>
                        ) : (
                            <button onClick={() => removeWebDavTarget(target.id)} className="rounded-xl border border-rose-100 bg-white px-3 py-2 text-[11px] font-bold text-rose-400 hover:bg-rose-50">삭제</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {(webdav?.items ?? []).length > 0 && (
                <div className="mt-6">
                    <h4 className="text-sm font-bold text-slate-800 mb-3">최근 파일 시스템 노출</h4>
                    <div className="grid gap-2">
                        {webdav!.items.slice(0, 5).map((item) => (
                            <div key={`${item.path}-${item.name}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm hover:translate-x-1 transition">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.type === "folder" ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-500"}`}>
                                        <FolderOpen className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <div>
                                        <p className="truncate font-bold text-slate-800">{item.name}</p>
                                        <p className="text-[10px] text-slate-400">{item.targetName || "Storage Source"}</p>
                                    </div>
                                </div>
                                <span className="text-[11px] font-bold text-slate-400">{item.size ? `${Math.round(item.size / 1024)}KB` : "DIR"}</span>
                            </div>
                        ))}
                    </div>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <FormPanel icon={ShieldCheck} title="신규 사용자 권한 발급">
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">특정 이메일 계정에 NAS 접속 권한 및 가이드를 자동으로 전송합니다.</p>
              <input value={nasUser} onChange={(event) => setNasUser(event.target.value)} className="field mb-1" placeholder="직원 이메일: email@academy.local" />
              <input value={nasResource} onChange={(event) => setNasResource(event.target.value)} className="field mb-1" placeholder="리소스명: 공용 NAS / 교강사실 공유폴더" />
              <select value={nasPermissionLevel} onChange={(event) => setNasPermissionLevel(event.target.value as "read" | "write" | "admin")} className="field mb-1" aria-label="권한 수준">
                <option value="read">읽기</option>
                <option value="write">읽기/쓰기</option>
                <option value="admin">관리자</option>
              </select>
              <ActionButton onClick={createNasRequest} label="권한 발급용 티켓 생성" />
            </FormPanel>
            <section className="surface-strong rounded-lg p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold">최근 권한 요청</h3>
                <span className="text-xs text-slate-400">{nasPermissionRows.length}건</span>
              </div>
              <div className="mt-3 grid gap-2">
                {nasPermissionRows.length ? (
                  nasPermissionRows.slice(0, 4).map((row) => (
                    <div key={row.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                      <p className="font-bold text-slate-800">{row.user_email}</p>
                      <p className="mt-1 text-slate-500">{row.resource_name} · {row.permission_level} · {row.status}</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">권한 요청 이력이 아직 없습니다.</p>
                )}
              </div>
            </section>
          </aside>
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

function FieldError({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className="min-h-[20px] pt-1">
      {visible ? <p className="text-xs font-bold text-rose-600">{message}</p> : null}
    </div>
  );
}

function extractAmountValue(value: string) {
  const numeric = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function RequestComposer({ form, setForm, createRequest }: { form: RequestForm; setForm: (value: RequestForm) => void; createRequest: () => void | Promise<void> }) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const earliestDate = useMemo(() => getEarliestSelectableDate(form), [form]);
  const earliestIso = useMemo(() => earliestDate.toISOString().slice(0, 10), [earliestDate]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/holidays", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return { holidays: [] as string[] };
        return (await response.json()) as { holidays: string[] };
      })
      .then((data) => {
        if (!cancelled) {
          setHolidayDates(new Set(data.holidays));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHolidayDates(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!form.neededDate || form.neededDate < earliestIso) {
      setForm({ ...form, neededDate: earliestIso });
    }
  }, [earliestIso, form, setForm]);

  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const iso = day.toISOString().slice(0, 10);
    const disabled = isWeekend(day) || holidayDates.has(iso) || day < earliestDate;
    const outside = day.getMonth() !== calendarMonth.getMonth();
    const selected = form.neededDate === iso;
    return { day, iso, disabled, outside, selected };
  });

  const leadMessage =
    form.priority === "긴급"
      ? "긴급 건만 오늘 선택 가능하며, 주말은 선택할 수 없습니다."
      : form.module === "전산 장비" && form.requestItem === "데스크톱 본체"
        ? "데스크톱 본체는 최소 영업일 5일 이후부터 선택 가능합니다."
        : form.module === "전산 장비" && form.requestItem === "모니터"
          ? "모니터는 최소 영업일 3일 이후부터 선택 가능합니다."
          : form.module === "전산 장비" && (form.requestItem === "노트북" || form.requestItem === "태블릿")
          ? "노트북/태블릿은 최소 영업일 4일 이후부터 선택 가능합니다."
            : "네트워크/NAS 및 기타 장비는 최소 영업일 7일 이후부터 선택 가능합니다.";
  const priorityTone =
    form.priority === "긴급"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : form.priority === "높음"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : form.priority === "보통"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
  const requiredErrors = {
    title: !form.title.trim(),
    requester: !form.requester.trim(),
    requesterContact: !form.requesterContact.trim(),
    neededDate: !form.neededDate.trim(),
    amount: !form.amount.trim(),
    description: !form.description.trim(),
    requestItem: form.module === "전산 장비" && !form.requestItem.trim()
  };
  const hasRequiredErrors = Object.values(requiredErrors).some(Boolean);
  const showError = (key: keyof typeof requiredErrors) => submitAttempted && requiredErrors[key];
  const requiredLabel = (label: string) => (
    <>
      {label} <span className="text-rose-500">*</span>
    </>
  );
  const amountValue = extractAmountValue(form.amount);
  const ownerLabel = form.module === "NAS" ? "NAS 관리자" : form.module === "A/S" ? "전산" : "경영지원";
  const requestItemLabel =
    form.module === "전산 장비"
      ? form.requestItem || "품목 선택 필요"
      : form.module === "A/S"
        ? "장애/문의"
        : form.module === "NAS"
          ? "네트워크/NAS"
          : "운영 요청";
  const routeSteps = [
    "접수 큐 등록",
    form.priority === "긴급" ? "우선 검토 즉시 시작" : "운영팀 1차 검토",
    amountValue >= 700000 || amountValue >= 2
      ? "승인 라우트 확인"
      : `${ownerLabel} 직접 배정`,
    form.module === "NAS"
      ? "권한/접속 가이드 처리"
      : form.module === "A/S"
        ? "FAQ 확인 후 티켓 진행"
        : "발주 또는 일정 조율"
  ];
  const completionHint =
    form.priority === "긴급"
      ? "긴급 우선순위로 가장 먼저 검토됩니다."
      : `현재 규칙상 가장 빠른 처리 가능일은 ${formatDateLabel(earliestIso)} 입니다.`;

  return (
    <section className="grid gap-6">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-slate-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Internal Request Form</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">경영지원 요청서</h3>
            <p className="mt-2 text-sm text-slate-500">운영팀 검토와 승인 라우팅에 필요한 정보를 한 번에 정리하는 접수 문서입니다.</p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-center shadow-sm ${priorityTone}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Processing</p>
            <p className="mt-1 text-sm font-black">{form.priority}</p>
            <p className="text-xs opacity-80">{form.neededDate || "처리일 미정"}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-5">
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h4 className="text-sm font-black text-slate-900">기본 신청 정보</h4>
              <p className="mt-1 text-xs text-slate-500">모듈, 요청 제목, 신청 부서와 우선순위를 먼저 기록합니다.</p>
            </div>
            <div className="grid gap-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-bold text-slate-500">요청 모듈</span>
                  <select value={form.module} onChange={(event) => setForm({ ...form, module: event.target.value, requestItem: event.target.value === "전산 장비" ? form.requestItem : event.target.value === "NAS" ? "네트워크/NAS" : "기타 장비" })} className="field" aria-label="모듈">
                    <option>전산 장비</option>
                    <option>A/S</option>
                    <option>부품 구매</option>
                    <option>NAS</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-bold text-slate-500">{requiredLabel("요청 품목")}</span>
                  <select
                    value={form.requestItem}
                    onChange={(event) => setForm({ ...form, requestItem: event.target.value })}
                    className={`field ${showError("requestItem") ? "border-rose-300 bg-rose-50/40" : ""}`}
                    aria-label="요청 품목"
                    disabled={form.module !== "전산 장비"}
                  >
                    {requestItemOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                  <FieldError message="전산 장비 요청은 품목을 선택해 주세요." visible={showError("requestItem")} />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-bold text-slate-500">우선순위</span>
                  <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as WorkPriority })} className="field" aria-label="우선순위">
                    <option>낮음</option>
                    <option>보통</option>
                    <option>높음</option>
                    <option>긴급</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-2">
                <span className="text-xs font-bold text-slate-500">{requiredLabel("요청 제목")}</span>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={`field ${showError("title") ? "border-rose-300 bg-rose-50/40" : ""}`} placeholder="예: 범어점 상담실 모니터 2대 신규 구매 요청" />
                <FieldError message="요청 제목은 필수입니다." visible={showError("title")} />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h4 className="text-sm font-black text-slate-900">신청 부서 및 일정</h4>
              <p className="mt-1 text-xs text-slate-500">누가 요청했고 언제까지 필요한지 남겨두면 검토가 훨씬 빨라집니다.</p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-bold text-slate-500">{requiredLabel("요청 부서/지점")}</span>
                <input value={form.requester} onChange={(event) => setForm({ ...form, requester: event.target.value })} className={`field ${showError("requester") ? "border-rose-300 bg-rose-50/40" : ""}`} placeholder="학원본사" />
                <FieldError message="요청 부서/지점을 입력해 주세요." visible={showError("requester")} />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold text-slate-500">{requiredLabel("담당 연락처")}</span>
                <input value={form.requesterContact} onChange={(event) => setForm({ ...form, requesterContact: event.target.value })} className={`field ${showError("requesterContact") ? "border-rose-300 bg-rose-50/40" : ""}`} placeholder="예: 내선 203 / 010-0000-0000" />
                <FieldError message="담당 연락처를 입력해 주세요." visible={showError("requesterContact")} />
              </label>
              <label className="grid gap-2 md:col-span-2">
                <span className="text-xs font-bold text-slate-500">{requiredLabel("희망 처리일")}</span>
                <div className={`rounded-2xl border bg-white p-4 ${showError("neededDate") ? "border-rose-300 bg-rose-50/20" : "border-slate-200"}`}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="whitespace-nowrap text-sm font-black text-slate-900">{formatDateLabel(form.neededDate)}</p>
                        <p className="whitespace-nowrap text-xs text-slate-500">{leadMessage}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="mr-2 whitespace-nowrap text-sm font-black text-slate-800">{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(calendarMonth)}</div>
                      <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50">이전</button>
                      <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50">다음</button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen((current) => !current)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
                  >
                    <div className="min-w-0">
                      <p className="whitespace-nowrap text-sm font-black text-slate-900">{formatDateLabel(form.neededDate)}</p>
                      <p className="whitespace-nowrap text-xs text-slate-500">주말과 공휴일은 자동으로 제외됩니다.</p>
                    </div>
                    <span className="text-xs font-bold text-blue-600">{calendarOpen ? "닫기" : "달력 열기"}</span>
                  </button>
                  {calendarOpen ? (
                    <>
                      <div className="mb-2 mt-4 grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-slate-400">
                        {["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}
                      </div>
                      <div className="grid grid-cols-7 gap-2">
                        {calendarDays.map(({ day, iso, disabled, outside, selected }) => (
                          <button
                            key={iso}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              setForm({ ...form, neededDate: iso });
                              setCalendarOpen(false);
                            }}
                            className={`h-11 rounded-xl text-sm font-bold transition ${
                              selected
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-100"
                                : disabled
                                  ? "cursor-not-allowed bg-slate-50 text-slate-300"
                                  : outside
                                    ? "bg-white text-slate-300 hover:bg-slate-50"
                                    : "bg-white text-slate-700 hover:border hover:border-blue-200 hover:bg-blue-50"
                            }`}
                          >
                            {day.getDate()}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
                <FieldError message="희망 처리일을 선택해 주세요." visible={showError("neededDate")} />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h4 className="text-sm font-black text-slate-900">예산 및 요청 상세</h4>
              <p className="mt-1 text-xs text-slate-500">수량, 예산, 검토 대상 업체와 실제 필요한 내용을 상세히 적어주세요.</p>
            </div>
            <div className="grid gap-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-bold text-slate-500">{requiredLabel("예산 또는 수량")}</span>
                  <input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={`field ${showError("amount") ? "border-rose-300 bg-rose-50/40" : ""}`} placeholder="예: 2대 / 1,200,000원" />
                  <FieldError message="예산 또는 수량을 입력해 주세요." visible={showError("amount")} />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-bold text-slate-500">업체</span>
                  <input value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} className="field" placeholder="예: 다나와 / 협력업체명 / 미정" />
                </label>
              </div>
              <label className="grid gap-2">
                <span className="text-xs font-bold text-slate-500">{requiredLabel("상세 내용")}</span>
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`min-h-40 rounded-xl border bg-white p-4 text-sm outline-none focus:border-blue-500 ${showError("description") ? "border-rose-300 bg-rose-50/40" : "border-gray-200"}`} placeholder="요청 배경, 설치 위치, 사용 목적, 참고 사항, 승인에 필요한 내용을 자세히 적어주세요." />
                <FieldError message="상세 내용을 입력해 주세요." visible={showError("description")} />
              </label>
            </div>
          </section>
        </div>

        <aside className="grid gap-5 self-start">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Live Summary</p>
              <h4 className="mt-1 text-sm font-black text-slate-900">실시간 접수 요약</h4>
            </div>
            <div className="grid gap-3 p-5">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold text-slate-400">제목 미리보기</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {form.title.trim() || `${form.requester || "지점"} ${requestItemLabel} 요청`}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                  <p className="text-[11px] font-bold text-slate-400">예상 담당</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{ownerLabel}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                  <p className="text-[11px] font-bold text-slate-400">요청 분류</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{form.module} · {requestItemLabel}</p>
                </div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <p className="font-black">처리 메모</p>
                <p className="mt-1 leading-relaxed">{completionHint}</p>
              </div>
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-violet-50 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Routing</p>
              <h4 className="mt-1 text-sm font-black text-slate-900">자동 라우팅 안내</h4>
            </div>
            <div className="grid gap-3 p-5">
              {routeSteps.map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-black text-white">
                    {index + 1}
                  </div>
                  <p className="pt-0.5 text-sm font-medium leading-relaxed text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-100">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Checklist</p>
                  <h4 className="mt-1 text-sm font-black text-slate-900">접수 전 확인</h4>
                </div>
              </div>
            </div>
            <div className="grid gap-3 p-5">
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                `*` 표시 항목은 필수 입력값입니다.
              </div>
              {[
                "`지점 + 품목 + 목적` 순서로 제목을 적으면 한눈에 식별하기 좋습니다.",
                "예산 또는 수량이 정확할수록 승인과 발주가 빨라집니다.",
                "긴급 건은 상세 내용에 운영 영향과 처리 사유를 꼭 적어주세요."
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                  <span className="mt-0.5 text-blue-600">•</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </section>
          {submitAttempted && hasRequiredErrors ? (
            <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              필수 입력값을 모두 작성한 뒤 요청서를 접수할 수 있습니다.
            </p>
          ) : null}
          <button
            onClick={() => {
              setSubmitAttempted(true);
              if (hasRequiredErrors) return;
              createRequest();
            }}
            className="focus-ring inline-flex h-14 items-center justify-center rounded-2xl bg-blue-600 text-base font-black text-white shadow-xl shadow-blue-100 hover:bg-blue-700"
          >
            요청서 접수
          </button>
        </aside>
      </div>
    </section>
  );
}

function RequestReceiptCard({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const nextOwner = item.owner || (item.module === "NAS" ? "NAS 관리자" : item.module === "A/S" ? "전산" : "경영지원");
  const summaryLines = [
    `${item.module} · ${item.priority}`,
    `요청 부서: ${item.requester}`,
    `예정 처리일: ${item.due || "미정"}`
  ];

  return (
    <section className="grid gap-5">
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-100">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Request Accepted</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{item.id}</h3>
            <p className="mt-2 text-sm text-slate-600">{item.title}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-bold text-slate-400">현재 상태</p>
          <p className="mt-1 text-lg font-black text-slate-900">{item.status}</p>
          <p className="mt-3 text-sm text-slate-600">다음 담당은 <span className="font-bold text-slate-900">{nextOwner}</span> 입니다.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-bold text-slate-400">접수 요약</p>
          <div className="mt-3 grid gap-2">
            {summaryLines.map((line) => (
              <div key={line} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        요청 큐에서 방금 접수된 건을 바로 확인하고, 승인 또는 보류 사유도 이어서 관리할 수 있습니다.
      </div>
      <div className="flex justify-end">
        <button onClick={onClose} className="focus-ring inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800">
          확인
        </button>
      </div>
    </section>
  );
}

function DetailPanel({ item, role, approve, reject }: { item: WorkItem; role: UserRole; approve: () => void; reject: () => void }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold text-blue-700">업무 번호 {item.id}</p><h3 className="mt-1 font-bold">{item.title}</h3></div>
        <div className="flex items-center gap-2">
          <button onClick={() => printWorkItem(item)} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-slate-600 hover:bg-gray-50" aria-label="업무 출력">
            <Printer className="h-4 w-4" aria-hidden="true" />
          </button>
          <StatusPill status={item.status} />
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="모듈" value={item.module} /><Info label="요청자" value={item.requester} /><Info label="담당" value={item.owner} /><Info label="우선순위" value={item.priority} /><Info label="예산/수량" value={item.amount || "-"} /><Info label="업체" value={item.vendor || "-"} />
      </dl>
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-line">{item.description || item.audit}</p>
      {item.priority === "긴급" ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-bold text-red-800">긴급 증빙</p>
          <Info label="긴급 사유" value={item.urgentReason || "미작성"} />
          <Info label="영향 범위" value={item.urgentImpact || "미작성"} />
          <Info label="증빙 파일" value={item.evidenceFiles?.length ? item.evidenceFiles.join(", ") : "미첨부"} />
        </div>
      ) : null}
      {item.approvalNote ? (
        <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">승인 의견: {item.approvalNote}</p>
      ) : null}
      {item.rejectionNote ? (
        <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">보류 사유: {item.rejectionNote}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button disabled={!canApprove(role, item)} onClick={approve} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" aria-hidden="true" />승인</button>
        <button disabled={!canApprove(role, item)} onClick={reject} className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true" />보류</button>
      </div>
    </section>
  );
}

function printWorkItem(item: WorkItem) {
  const popup = window.open("", "_blank", "width=760,height=900");
  if (!popup) {
    window.print();
    return;
  }

  const rows = [
    ["업무 번호", item.id],
    ["상태", item.status],
    ["모듈", item.module],
    ["요청자", item.requester],
    ["담당", item.owner],
    ["우선순위", item.priority],
    ["기한", item.due],
    ["예산/수량", item.amount || "-"],
    ["업체", item.vendor || "-"],
    ["승인 의견", item.approvalNote || "-"],
    ["보류 사유", item.rejectionNote || "-"]
  ];

  if (item.priority === "긴급") {
    rows.push(["긴급 사유", item.urgentReason || "미작성"]);
    rows.push(["영향 범위", item.urgentImpact || "미작성"]);
    rows.push(["증빙 파일", item.evidenceFiles?.length ? item.evidenceFiles.join(", ") : "미첨부"]);
  }

  popup.document.write(`<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(item.id)} 업무 접수증</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          .muted { color: #64748b; font-size: 13px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d8dee9; padding: 10px 12px; text-align: left; vertical-align: top; }
          th { width: 140px; background: #f8fafc; }
          .desc { margin-top: 16px; padding: 14px; border: 1px solid #d8dee9; white-space: pre-wrap; }
          @media print { button { display: none; } body { margin: 20px; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(item.title)}</h1>
        <div class="muted">경영지원 운영 허브 업무 접수증</div>
        <table>
          <tbody>
            ${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}
          </tbody>
        </table>
        <div class="desc">${escapeHtml(item.description || item.audit)}</div>
        <script>window.onload = () => { window.print(); };</script>
      </body>
    </html>`);
  popup.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function ApprovalNoteForm({ item, onSubmit, onCancel }: { item: WorkItem; onSubmit: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");

  return (
    <section className="grid gap-4">
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-sm font-bold">{item.title}</p>
        <p className="mt-1 text-xs text-slate-500">{item.id} · {item.requester} · {item.priority}</p>
      </div>
      {item.priority === "긴급" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-bold">긴급 검토</p>
          <p className="mt-1">사유: {item.urgentReason || "미작성"}</p>
          <p>영향: {item.urgentImpact || "미작성"}</p>
          <p>증빙: {item.evidenceFiles?.length ? item.evidenceFiles.join(", ") : "미첨부"}</p>
        </div>
      ) : null}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="min-h-28 rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-500"
        placeholder="승인 의견을 적어주세요. 예: 예산 범위 내 승인, 긴급 처리 필요"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">
          취소
        </button>
        <button onClick={() => onSubmit(note.trim() || "승인")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          승인
        </button>
      </div>
    </section>
  );
}

function DecisionNoteForm({ item, mode, onSubmit, onCancel }: { item: WorkItem; mode: "reject"; onSubmit: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  const title = mode === "reject" ? "보류 사유" : "처리 의견";

  return (
    <section className="grid gap-4">
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-sm font-bold">{item.title}</p>
        <p className="mt-1 text-xs text-slate-500">{item.id} · {item.requester} · {item.priority}</p>
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="min-h-28 rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-500"
        placeholder="보류하는 이유와 필요한 보완 내용을 적어주세요. 예: 견적서 재첨부 필요, 긴급 증빙 부족"
      />
      <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
        보류 사유는 상세조회와 출력물에 함께 남습니다.
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">
          취소
        </button>
        <button onClick={() => onSubmit(note.trim() || "보완 필요")} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
          {title} 저장
        </button>
      </div>
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setConfirmClose(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 sm:p-4 backdrop-blur-sm">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 shrink-0">
          <h3 className="text-lg font-black tracking-tight text-slate-900">{title}</h3>
          <button onClick={onClose} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors" aria-label="닫기">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 pb-8 sm:p-6">{children}</div>
      </div>
      {confirmClose ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h4 className="text-base font-bold">창을 닫을까요?</h4>
            <p className="mt-2 text-sm text-slate-600">작성 중인 내용은 저장되지 않을 수 있습니다.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmClose(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                계속 작성
              </button>
              <button onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
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


function TabletScreen({ tablet, setTablet, createTabletRequest, role }: { tablet: TabletForm; setTablet: (v: TabletForm) => void; createTabletRequest: () => void; role: UserRole }) {
  const [tabletModels, setTabletModels] = useState(["Galaxy Tab S9", "Galaxy Tab S9 FE", "Galaxy Tab S9 Ultra", "Galaxy Tab A9+"]);
  const [newModel, setNewModel] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Rental duration is fixed at 36 months
  const fixedDuration = 36;
  const unitPrice = 35000;
  const totalRental = tablet.count * unitPrice * fixedDuration;

  const addModel = () => {
    if (newModel && !tabletModels.includes(newModel)) {
      setTabletModels([...tabletModels, newModel]);
      setNewModel("");
    }
  };

  const removeModel = (m: string) => {
    setTabletModels(tabletModels.filter(item => item !== m));
  };

  return (
    <Screen title="태블릿 렌탈" desc="갤럭시 탭 중심의 수업용 태블릿 렌탈 신청을 관리합니다. (36개월 약정)">
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="surface-strong overflow-hidden rounded-2xl">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
             <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white">
                <PackageCheck className="h-5 w-5" aria-hidden="true" />
             </div>
             <div>
                <h3 className="font-bold">렌탈 요청서</h3>
                <p className="text-sm text-slate-500">36개월 고정 약정으로 최적 견적을 산출합니다.</p>
             </div>
          </div>
          <div className="divide-y divide-slate-200">
            <EquipmentRow label="처리 유형">
               <div className="grid grid-cols-3 gap-2">
                  {(["신규", "연장", "반납"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTablet({ ...tablet, requestType: type, duration: type === "신규" ? "36개월" : tablet.duration })}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold ${tablet.requestType === type ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"}`}
                    >
                      {type}
                    </button>
                  ))}
               </div>
            </EquipmentRow>
            <EquipmentRow label="학원/지점">
               <input value={tablet.academy} onChange={(e) => setTablet({...tablet, academy: e.target.value})} className="field w-full" placeholder="학원본사" />
            </EquipmentRow>
            <EquipmentRow label="모델">
               <select value={tablet.model} onChange={(e) => setTablet({...tablet, model: e.target.value})} className="field w-full">
                  {tabletModels.map(m => <option key={m}>{m}</option>)}
               </select>
            </EquipmentRow>
            <EquipmentRow label="수량">
               <input type="number" min={1} value={tablet.count} onChange={(e) => setTablet({...tablet, count: Number(e.target.value)})} className="field w-full" />
            </EquipmentRow>
            <EquipmentRow label="렌탈 기간">
               <div className="field w-full bg-slate-50 font-bold text-slate-500">
                 {tablet.requestType === "신규" ? "36개월 고정" : tablet.requestType === "연장" ? "추가 연장 협의" : "반납 회수 일정"}
               </div>
            </EquipmentRow>
            <EquipmentRow label="사용 용도">
               <input value={tablet.purpose} onChange={(e) => setTablet({...tablet, purpose: e.target.value})} className="field w-full" placeholder="예: 교재 열람, 테스트용, 상담실 안내용" />
            </EquipmentRow>
            {tablet.requestType !== "신규" ? (
              <EquipmentRow label="자산 태그">
                 <input value={tablet.assetTag} onChange={(e) => setTablet({ ...tablet, assetTag: e.target.value })} className="field w-full" placeholder="예: TAB-2024-018" />
              </EquipmentRow>
            ) : null}
            <EquipmentRow label="희망 수령일">
               <input type="date" value={tablet.neededDate} onChange={(e) => setTablet({...tablet, neededDate: e.target.value})} className="field w-full" />
            </EquipmentRow>
          </div>
          <div className="grid gap-4 border-t border-slate-200 bg-slate-50/50 px-5 py-6 md:grid-cols-[1fr_auto] md:items-center">
             <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                   <span className="rounded-lg bg-white border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-500 uppercase">월 렌탈료 {unitPrice.toLocaleString()}원</span>
                   <span className="text-xs font-bold text-slate-400">× 36개월 고정</span>
                </div>
                <div className="text-2xl font-black tracking-tighter text-amber-600">
                   <span className="mr-1 text-sm font-bold text-slate-400">총 렌탈 예상액</span>
                   {totalRental.toLocaleString()}원
                </div>
             </div>
             <button onClick={() => {
               setTablet({...tablet, duration: tablet.requestType === "신규" ? "36개월" : tablet.duration});
               createTabletRequest();
             }} className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 text-sm font-bold text-white hover:bg-amber-700 shadow-lg shadow-amber-100 transition-all">
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                {tablet.requestType === "신규" ? "렌탈 요청 생성" : tablet.requestType === "연장" ? "연장 요청 생성" : "반납 요청 생성"}
             </button>
          </div>

          {role === "super_admin" && (
            <div className="border-t border-slate-200 bg-white p-5">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                <UserCog className="h-3.5 w-3.5" />
                관리자 모델 설정 {showSettings ? "닫기" : "열기"}
              </button>
              {showSettings && (
                <div className="mt-4 space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex gap-2">
                    <input 
                      value={newModel} 
                      onChange={(e) => setNewModel(e.target.value)} 
                      className="field flex-1" 
                      placeholder="추가할 새 모델명" 
                    />
                    <button onClick={addModel} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">추가</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tabletModels.map(m => (
                      <span key={m} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium">
                        {m}
                        <button onClick={() => removeModel(m)} className="text-rose-500 hover:text-rose-700"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        <aside className="space-y-5">
          <div className="surface-strong rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h4 className="flex items-center gap-2 font-black text-slate-800">
               <ShieldCheck className="h-4 w-4 text-amber-600" />
               렌탈 가이드라인
            </h4>
            <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-600">
               <div className="rounded-lg bg-amber-50 p-3 font-bold text-amber-800 leading-normal">
                 💡 태블릿 렌탈은 기본 36개월 약정을 원칙으로 합니다. 단, 계약 만료 전 협의를 통해 추가 연장 사용도 가능합니다.
               </div>
               <p>• <strong>연장 및 반납</strong>: 반납 1개월 전 담당자를 통해 연장 여부 확인이 필수이며, 미확인 시 자동 연장되거나 반납 절차가 진행될 수 있습니다.</p>
               <p>• <strong>관리 의무</strong>: 렌탈 기간 중 파손/분실 시 사용자 과실에 따른 비용이 발생할 수 있으니 관리에 유의해 주세요.</p>
               <p>• <strong>견적 유효성</strong>: 위 금액은 예상 렌탈료이며, 실제 발주 시점의 시장가 및 업체 사정에 따라 다소 변동될 수 있습니다.</p>
            </div>
          </div>
        </aside>
      </section>
    </Screen>
  );
}

function PartsScreen({
  addRequest,
  setActiveMenu,
  partsBasket,
  setPartsBasket,
  addToast,
  parts,
  livePartQuotes,
  isPriceLoading,
  lastCheckedAt,
  refreshPrices
}: {
  addRequest: (r: Omit<WorkItem, "id">) => void;
  setActiveMenu: (m: MenuKey) => void;
  partsBasket: BasketItem[];
  setPartsBasket: (v: BasketItem[]) => void;
  addToast: (message: string, type?: "success" | "error" | "info") => void;
  parts: typeof equipmentParts;
  livePartQuotes: Record<string, { status: "live" | "fallback"; source: string; checkedAt: string; searchUrl: string; gmarketUrl: string }>;
  isPriceLoading: boolean;
  lastCheckedAt: string | null;
  refreshPrices: () => Promise<void>;
}) {
  const [partQuery, setPartQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let result = parts;
    if (selectedCategory) {
      const catObj = partsCategories.find(c => c.id === selectedCategory);
      if (catObj) {
        result = result.filter(p => (catObj.items as readonly string[]).includes(p.category));
      }
    }
    if (partQuery) {
      result = result.filter(p => 
        p.name.toLowerCase().includes(partQuery.toLowerCase()) || 
        p.category.toLowerCase().includes(partQuery.toLowerCase())
      );
    }
    return result;
  }, [partQuery, parts, selectedCategory]);

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
    setPartsBasket(partsBasket.filter(p => p.id !== id));
  };

  const goToEquipment = () => {
    setActiveMenu("equipment");
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

  const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);

  return (
    <Screen title="소모품·주변기기" desc="카테고리별로 필요한 부품을 담아 견적을 내거나 장비 구매에 추가하세요.">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Category Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {partsCategories.map((cat) => {
              const Icon = cat.icon;
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(active ? null : cat.id)}
                  className={`flex flex-col items-start rounded-2xl border p-5 transition-all ${active ? "border-blue-600 bg-blue-50 shadow-lg shadow-blue-100" : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-md"}`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h4 className={`mt-4 font-black ${active ? "text-blue-900" : "text-slate-800"}`}>{cat.name}</h4>
                  <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cat.items.length} CATEGORIES</p>
                </button>
              );
            })}
          </div>

          <section className="surface-strong rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-100">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-[220px] flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Search className="h-5 w-5 text-slate-400" />
                <input value={partQuery} onChange={(e) => setPartQuery(e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none" placeholder="부품명 또는 모델 검색" />
              </div>
              <button
                type="button"
                onClick={() => void refreshPrices()}
                disabled={isPriceLoading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isPriceLoading ? "animate-spin" : ""}`} />
                {isPriceLoading ? "가격 조회 중.." : "가격 새로고침"}
              </button>
            </div>
            <p className="mb-6 text-[11px] font-medium text-slate-500">
              {lastCheckedAt
                ? `실시간 가격 기준 ${new Date(lastCheckedAt).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit"
                  })} · 다나와 기준, 지마켓은 검색 바로가기를 제공합니다.`
                : "다나와 실시간 가격을 불러오고 있습니다."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
               {filteredItems.map(part => (
                 <article key={part.id} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-lg group">
                    <div className="flex items-start justify-between">
                       <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500 uppercase">{part.category}</span>
                       <div className="text-right">
                         <span className="block text-sm font-black text-slate-900">{part.price.toLocaleString()}원</span>
                         <span className="block text-[10px] font-bold text-emerald-600">{livePartQuotes[part.id]?.status === "live" ? "실시간가" : "기준가"}</span>
                       </div>
                    </div>
                    <h4 className="mt-3 text-sm font-extrabold text-slate-800 leading-tight grow">{part.name}</h4>
                    <p className="mt-1 text-[11px] text-slate-500">{part.description}</p>
                    
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => openDanawa(part.id, part.name)} className="focus-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-all">
                        다나와
                      </button>
                      <button onClick={() => openGmarket(part.id, part.name)} className="focus-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-all">
                        지마켓
                      </button>
                      <button onClick={() => addToBasket(part)} className="focus-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-[11px] font-bold text-white hover:bg-blue-700 transition-all">
                        담기
                      </button>
                    </div>
                 </article>
               ))}
               {filteredItems.length === 0 && (
                 <div className="col-span-full py-12 text-center text-slate-400 font-medium">검색 결과가 없습니다.</div>
               )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="surface-strong rounded-2xl p-5 border border-slate-100 shadow-sm sticky top-[100px]">
            <h4 className="flex items-center justify-between font-black text-slate-800">
              <span className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-blue-600" /> 장바구니</span>
              <span className="text-xs font-bold text-blue-600">{partsBasket.length}</span>
            </h4>
            
            <div className="mt-4 min-h-[100px] max-h-[400px] overflow-y-auto space-y-2 pr-2">
              {partsBasket.length === 0 ? (
                <p className="py-8 text-center text-[11px] font-medium text-slate-400">비어있음</p>
              ) : (
                partsBasket.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 group">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-slate-700">{p.name}</p>
                      <p className="text-[10px] font-medium text-slate-400">{p.price.toLocaleString()}원</p>
                    </div>
                    <button onClick={() => removeFromBasket(p.id)} className="text-slate-400 hover:text-rose-500 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {partsBasket.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500">합계</span>
                  <span className="text-lg font-black text-blue-600">{basketTotal.toLocaleString()}원</span>
                </div>
                
                <button 
                  onClick={goToEquipment}
                  className="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all"
                >
                  장비 구매로 이동
                  <ArrowRight className="h-4 w-4" />
                </button>
                
                <button 
                  onClick={() => {
                    const desc = partsBasket.map(p => `- ${p.name}: ${p.price.toLocaleString()}원`).join("\n");
                    addRequest({
                      module: "부품 구매",
                      title: `${partsBasket[0].name} 외 ${partsBasket.length - 1}건 소모품 구매`,
                      requester: "경영지원",
                      owner: "경영지원",
                      status: "접수",
                      priority: "보통",
                      due: "이번 주",
                      audit: "장바구니 통합 요청",
                      description: `요청 부품 목록:\n${desc}`,
                      amount: `총 ${partsBasket.length}종 / ${basketTotal.toLocaleString()}원`,
                      source: "admin_console"
                    });
                    setPartsBasket([]);
                    addToast("소모품 구매 요청이 접수되었습니다.", "success");
                  }}
                  className="mt-3 flex h-10 w-full items-center justify-center text-[10px] font-bold text-slate-400 hover:text-slate-600"
                >
                  단독 구매 요청하기
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </Screen>
  );
}
