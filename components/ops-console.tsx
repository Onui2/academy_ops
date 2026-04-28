"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Filter,
  FolderOpen,
  HardDrive,
  Headphones,
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
import { 
  aiHarnessSteps, 
  equipmentParts, 
  equipmentPresets,
  modules, 
  nasMetrics, 
  workItems as seedItems 
} from "@/lib/ops-data";
import { createClient } from "@/lib/supabase";
import {
  createAuditLog,
  createRequest as createDbRequest,
  deleteRequest as deleteDbRequest,
  ensureProfile,
  fetchProfileRole,
  fetchRequests,
  updateRequestStatus
} from "@/lib/ops-repository";
import { StatusPill } from "@/components/status-pill";
import type { EquipmentConfig, UserRole, WorkItem, WorkPriority, WorkStatus } from "@/types/ops";
import type { User } from "@supabase/supabase-js";

type MenuKey = "dashboard" | "queue" | "equipment" | "parts" | "tablet" | "as" | "nas" | "audit" | "subly";
type AuditEvent = { id: string; at: string; actor: string; event: string };
type RequestForm = { module: string; title: string; requester: string; priority: WorkPriority; description: string; amount: string; vendor: string };
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

const storageKey = "academy-ops-hub-state-v2";
const webdavTargetsKey = "academy-ops-hub-webdav-targets-v1";

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
  title: "",
  requester: "손샘학원(본사)",
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
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [syncState, setSyncState] = useState("데이터 연동 중");
  const [activeMenu, setActiveMenu] = useState<MenuKey>("dashboard");
  const [role, setRole] = useState<UserRole>("super_admin");
  const [partsBasket, setPartsBasket] = useState<any[]>([]);
  const [symptom, setSymptom] = useState("빔프로젝터 화면이 깜박이고 소리가 끊김");
  const [items, setItems] = useState<WorkItem[]>(seedItems);
  const [audit, setAudit] = useState<AuditEvent[]>(initialAudit);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WorkStatus | "전체">("전체");
  const [selectedId, setSelectedId] = useState(seedItems[0]?.id ?? "");
  const [form, setForm] = useState<RequestForm>(defaultForm);
  const [equipment, setEquipment] = useState<EquipmentForm>({
    item: "",
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
  const [tablet, setTablet] = useState({
    academy: "",
    model: "iPad Air (5th Gen)",
    count: 1,
    duration: "12개월",
    purpose: "교재 열람용",
    neededDate: new Date().toISOString().slice(0, 10)
  });
  const [nasUser, setNasUser] = useState("new.staff@academy.local");
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
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "error" | "info" }>>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now().toString();
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 3000);
  }, []);

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

  const loadDbRequests = useCallback(async (nextUser = user) => {
    if (!supabase || !nextUser) return;
    try {
      setSyncState("DB 동기화 중");
      await ensureProfile(supabase, nextUser);
      const profileRole = await fetchProfileRole(supabase, nextUser);
      setRole(profileRole);
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

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void loadDbRequests(nextUser);
      } else {
        setItems(seedItems);
        setSyncState("로그인 필요");
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
  const visibleMenuItems = menuItems.filter((item) => item.key !== "audit" || isAdminRole(role));

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
      } else {
        setItems((current) => [next, ...current]);
      }
      setSelectedId(id);
      setActiveMenu("queue");
      addAudit("Router AI", `${id} ${request.module} 요청 접수`);
      addToast(`${id} 요청이 성공적으로 접수되었습니다.`, "success");
    } catch (error) {
      setSyncState(error instanceof Error ? error.message : "요청 생성 실패");
      addToast("요청 생성 중 오류가 발생했습니다.", "error");
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
          approvedByAcademyAdmin: true,
          approvalNote: item.approvalNote
        },
        `${item.id} 학원 관리자 승인`
      );
      addToast(`${item.id} 학원 관리자 승인이 완료되었습니다.`, "success");
      return;
    }

    if (role === "super_admin" && item.status === "승인 대기") {
      updateItem(
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
      addToast(`${item.id} 최종 승인이 완료되어 담당자에게 전달되었습니다.`, "success");
      return;
    }

    updateItem(item.id, { status: nextStatus(item.status), audit: `${role} 승인 처리`, approvalStep: (item.approvalStep ?? 0) + 1, approvalNote: item.approvalNote }, `${item.id} 승인 진행`);
    addToast(`${item.id} 승인 처리되었습니다.`, "success");
  };
  const reject = (item: WorkItem) => {
    updateItem(item.id, { status: "보류", audit: item.rejectionNote || "반려 또는 보완 요청", rejectionNote: item.rejectionNote || "보완 필요" }, `${item.id} 보류 처리`);
    addToast(`${item.id} 요청이 보류 처리되었습니다.`, "info");
  };
  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId(items.find((item) => item.id !== id)?.id ?? "");
    addAudit("관리자", `${id} 삭제`);
    if (supabase) {
      deleteDbRequest(supabase, id).catch((error) => {
        setSyncState(error instanceof Error ? error.message : "삭제 실패");
        addToast("데이터 삭제에 실패했습니다.", "error");
      });
    }
    addToast("요청이 삭제되었습니다.", "info");
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
    const isDesktop = equipment.item === "데스크톱";
    const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);
    const basePrice = isDesktop ? totalPrice : equipment.unitPrice;
    const total = (equipment.count * basePrice) + basketTotal;
    const needsAccountingConfirm = total > 500000;

    const configLines = isDesktop
      ? [
          "--- 본체 조립 사양 ---",
          ...Object.entries(config.parts).map(([cat, id]) => {
            const part = equipmentParts.find((p) => p.id === id);
            return `${cat}: ${part?.name ?? "미선택"} (${part?.price.toLocaleString()}원)`;
          })
        ]
      : [];

    const basketLines = partsBasket.length > 0
      ? [
          "--- 추가 구성품 (장바구니) ---",
          ...partsBasket.map(p => `${p.name}: ${p.price.toLocaleString()}원`)
        ]
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
    requester: "손샘학원(본사)",
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
  
  const createTabletRequest = () => addRequest({
    module: "태블릿 렌탈",
    title: `${tablet.academy} ${tablet.model} ${tablet.count}대 렌탈`,
    requester: tablet.academy,
    owner: "경영지원",
    status: "접수",
    priority: "보통",
    due: tablet.neededDate,
    audit: "렌탈 업체 견적 요청 대기",
    description: `모델: ${tablet.model}\n수량: ${tablet.count}대\n기간: ${tablet.duration}\n용도: ${tablet.purpose}`,
    amount: `${tablet.count}대 / ${tablet.duration}`,
    vendor: "미정",
    approvalStep: 0,
    source: "admin_console"
  });

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
              {activeMenu === "equipment" ? <EquipmentScreen equipment={equipment} setEquipment={setEquipment} createEquipment={createEquipment} config={config} setConfig={setConfig} updateConfig={updateConfig} totalPrice={totalPrice} partsBasket={partsBasket} setPartsBasket={setPartsBasket} /> : null}
              {activeMenu === "parts" ? <PartsScreen addRequest={addRequest} setActiveMenu={setActiveMenu} setEquipment={setEquipment} equipment={equipment} partsBasket={partsBasket} setPartsBasket={setPartsBasket} /> : null}
              {activeMenu === "tablet" ? <TabletScreen tablet={tablet} setTablet={setTablet} createTabletRequest={createTabletRequest} role={role} /> : null}
              {activeMenu === "as" ? <AsScreen symptom={symptom} setSymptom={setSymptom} diagnosis={diagnosis.answer} createAsTicket={createAsTicket} /> : null}
              {activeMenu === "nas" ? (
                <NasScreen 
                  nasUser={nasUser} 
                  setNasUser={setNasUser} 
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
          )}
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
          <div className="flex h-48 items-end gap-2 px-2">
            {[45, 62, 58, 85, 72, 90, 65].map((height, i) => (
              <div key={i} className="group relative flex flex-1 flex-col items-center gap-2">
                <div 
                  className="w-full rounded-t-lg bg-blue-100 transition-all duration-500 hover:bg-blue-600" 
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-slate-800 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {height}건
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{["월", "화", "수", "목", "금", "토", "일"][i]}</span>
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
                if (name.includes("장비")) props.setActiveMenu("equipment");
                else if (name.includes("A/S")) props.setActiveMenu("as");
                else if (name.includes("NAS")) props.setActiveMenu("nas");
                else if (name.includes("태블릿")) props.setActiveMenu("tablet");
                else if (name.includes("부품")) props.setActiveMenu("parts");
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
  createManualRequest: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<WorkItem | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<WorkItem | null>(null);

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
  config,
  setConfig,
  updateConfig,
  totalPrice,
  partsBasket,
  setPartsBasket
}: {
  equipment: EquipmentForm;
  setEquipment: (value: EquipmentForm) => void;
  createEquipment: () => void;
  config: EquipmentConfig;
  setConfig: (config: EquipmentConfig) => void;
  updateConfig: (category: string, partId: string) => void;
  totalPrice: number;
  partsBasket: any[];
  setPartsBasket: (v: any[]) => void;
}) {
  const isDesktop = equipment.item === "데스크톱";
  const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);
  const basePrice = isDesktop ? totalPrice : equipment.unitPrice;
  const total = (equipment.count * basePrice) + basketTotal;

  return (
    <Screen title="장비 구매" desc="컴퓨터 장비 구매 요청을 작성합니다. 데스크탑은 세부 부품을 직접 구성할 수 있습니다.">
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="surface-strong overflow-hidden rounded-2xl">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <PackageCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-bold">장비 사양 및 요청서</h3>
              <p className="text-sm text-slate-500">
                {isDesktop ? "부품별 구성을 선택하여 조립 PC 견적을 완성하세요." : "구매하실 장비의 모델과 단가를 입력하세요."}
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            <EquipmentRow label="학원/지점">
              <input value={equipment.academy} onChange={(event) => setEquipment({ ...equipment, academy: event.target.value })} className="field w-full" placeholder="손샘학원(대구)" />
            </EquipmentRow>
            <EquipmentRow label="품목">
              <select value={equipment.item} onChange={(event) => setEquipment({ ...equipment, item: event.target.value })} className="field w-full">
                <option>노트북</option>
                <option>데스크톱</option>
                <option>모니터</option>
                <option>태블릿</option>
                <option>프린터</option>
                <option>공유기/네트워크 장비</option>
                <option>기타 장비</option>
              </select>
            </EquipmentRow>

            {isDesktop ? (
              <div className="bg-blue-50/30 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-blue-900">🖥️ 본체 조립 사양</h4>
                  <span className="text-xs font-bold text-blue-600">총 {totalPrice.toLocaleString()}원</span>
                </div>
                
                <div className="mb-6">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-blue-400">프리셋 불러오기</p>
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

                <div className="grid gap-6">
                  {Object.keys(config.parts).map((category) => (
                    <div key={category} className="grid gap-2 sm:grid-cols-[100px_1fr]">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">{category}</span>
                      <div className="grid gap-2">
                        <select
                          value={config.parts[category] || ""}
                          onChange={(e) => updateConfig(category, e.target.value)}
                          className="field w-full border-blue-200 text-sm"
                        >
                          {equipmentParts
                            .filter((p) => p.category === category)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.tier === "고성능" ? "🚀 " : p.tier === "업무용" ? "💼 " : ""}
                                {p.name} (+{p.price.toLocaleString()}원)
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
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
                  {isDesktop ? "본체" : "본체/본품"} {basePrice.toLocaleString()}원
                </span>
                {partsBasket.length > 0 && <span className="text-[10px] font-bold text-blue-600">+ 구성품 {basketTotal.toLocaleString()}원</span>}
              </div>
              <div className={`text-2xl font-black tracking-tighter ${(equipment.count >= 2 || basePrice >= 700000) ? "text-rose-600" : "text-blue-600"}`}>
                <span className="mr-1 text-sm font-bold text-slate-400">총 견적</span>
                {total.toLocaleString()}원
              </div>
            </div>
            <button
              onClick={() => {
                if (isDesktop) {
                  setEquipment({ ...equipment, unitPrice: basePrice });
                }
                createEquipment();
                setPartsBasket([]);
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
              ) : totalPrice > 750000 ? (
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
    <div className="grid gap-3 bg-white md:grid-cols-[120px_1fr]">
      <div className="bg-slate-50 px-5 py-4 text-sm font-bold text-slate-900">{label}</div>
      <div className="px-4 py-3">{children}</div>
    </div>
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


function NasScreen({
  nasUser,
  setNasUser,
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
  createNasRequest: () => void;
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

        <div className="grid gap-4 md:grid-cols-3">
          {nasMetrics.map((metric) => (
            <article key={metric.label} className="surface-strong rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">{metric.label}</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <HardDrive className="h-4 w-4 text-slate-600" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-4 text-3xl font-black">{metric.value}</div>
              <p className="mt-1 text-xs font-semibold text-gray-400">{metric.detail}</p>
              <div className="mt-4 progress-track bg-slate-100">
                <div className={`h-full rounded-full transition-all duration-500 ${metric.health === "주의" ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" : metric.health === "위험" ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" : "bg-emerald-500"}`} style={{ width: metric.value.includes("%") ? metric.value : "62%" }} />
              </div>
            </article>
          ))}
        </div>

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
              <ActionButton onClick={createNasRequest} label="권한 발급용 티켓 생성" />
            </FormPanel>
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

function RequestComposer({ form, setForm, createRequest }: { form: RequestForm; setForm: (value: RequestForm) => void; createRequest: () => void }) {
  return (
    <section>
      <div className="grid gap-3">
        <select value={form.module} onChange={(event) => setForm({ ...form, module: event.target.value })} className="field" aria-label="모듈">
          <option>전산 장비</option><option>A/S</option><option>부품 구매</option><option>NAS</option>
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
        <div class="muted">Academy Ops Hub 업무 접수증</div>
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
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
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


function TabletScreen({ tablet, setTablet, createTabletRequest, role }: { tablet: any; setTablet: (v: any) => void; createTabletRequest: () => void; role: UserRole }) {
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
            <EquipmentRow label="학원/지점">
               <input value={tablet.academy} onChange={(e) => setTablet({...tablet, academy: e.target.value})} className="field w-full" placeholder="손샘학원(본사)" />
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
               <div className="field w-full bg-slate-50 font-bold text-slate-500">36개월 고정</div>
            </EquipmentRow>
            <EquipmentRow label="사용 용도">
               <input value={tablet.purpose} onChange={(e) => setTablet({...tablet, purpose: e.target.value})} className="field w-full" placeholder="교재 열람, 테스트용 등" />
            </EquipmentRow>
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
               setTablet({...tablet, duration: "36개월"});
               createTabletRequest();
             }} className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 text-sm font-bold text-white hover:bg-amber-700 shadow-lg shadow-amber-100 transition-all">
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                렌탈 요청 생성
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

function PartsScreen({ addRequest, setActiveMenu, setEquipment, equipment, partsBasket, setPartsBasket }: { addRequest: (r: any) => void; setActiveMenu: (m: MenuKey) => void; setEquipment: (v: any) => void; equipment: any; partsBasket: any[]; setPartsBasket: (v: any[]) => void }) {
  const [partQuery, setPartQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const categories = [
    { id: "PC", name: "데스크톱 부품", icon: HardDrive, items: ["CPU", "RAM", "SSD", "Graphic Card", "Mainboard", "Power", "Case", "Monitor"] },
    { id: "Input", name: "주변기기", icon: Headphones, items: ["Keyboard", "Mouse"] },
    { id: "Cable", name: "케이블/허브", icon: Search, items: ["Cables"] },
    { id: "Supply", name: "사무 소모품", icon: ClipboardList, items: ["Consumables"] }
  ];

  const filteredItems = useMemo(() => {
    let result = equipmentParts;
    if (selectedCategory) {
      const catObj = categories.find(c => c.id === selectedCategory);
      if (catObj) {
        result = result.filter(p => catObj.items.includes(p.category));
      }
    }
    if (partQuery) {
      result = result.filter(p => 
        p.name.toLowerCase().includes(partQuery.toLowerCase()) || 
        p.category.toLowerCase().includes(partQuery.toLowerCase())
      );
    }
    return result;
  }, [selectedCategory, partQuery]);

  const addToBasket = (part: any) => {
    setPartsBasket([...partsBasket, { ...part, id: Date.now() + Math.random() }]);
  };

  const removeFromBasket = (id: number) => {
    setPartsBasket(partsBasket.filter(p => p.id !== id));
  };

  const goToEquipment = () => {
    const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);
    setActiveMenu("equipment");
  };

  const openDanawa = (query: string) => {
    window.open(`https://search.danawa.com/mobile/dsearch.php?keyword=${encodeURIComponent(query)}`, "_blank");
  };

  const basketTotal = partsBasket.reduce((sum, p) => sum + p.price, 0);

  return (
    <Screen title="소모품·주변기기" desc="카테고리별로 필요한 부품을 담아 견적을 내거나 장비 구매에 추가하세요.">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Category Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {categories.map((cat) => {
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
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
               <Search className="h-5 w-5 text-slate-400" />
               <input value={partQuery} onChange={(e) => setPartQuery(e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none" placeholder="부품명 또는 모델 검색" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
               {filteredItems.map(part => (
                 <article key={part.id} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-lg group">
                    <div className="flex items-start justify-between">
                       <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500 uppercase">{part.category}</span>
                       <span className="text-sm font-black text-slate-900">{part.price.toLocaleString()}원</span>
                    </div>
                    <h4 className="mt-3 text-sm font-extrabold text-slate-800 leading-tight grow">{part.name}</h4>
                    <p className="mt-1 text-[11px] text-slate-500">{part.description}</p>
                    
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => openDanawa(part.name)} className="focus-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-all">
                        다나와
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
