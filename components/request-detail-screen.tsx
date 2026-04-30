"use client";

import { ArrowLeft, Loader2, MessageSquarePlus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { workItems as seedItems } from "@/lib/ops-data";
import { StatusPill } from "@/components/status-pill";
import type { WorkItem } from "@/types/ops";
import type { RequestComment, RequestDetail } from "@/types/request";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function RequestDetailScreen({
  requestNo,
  portal
}: {
  requestNo: string;
  portal: "user" | "admin";
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [isLocalFallback, setIsLocalFallback] = useState(false);
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function resolveWorkflowStatusFromItem(item: WorkItem): RequestDetail["workflowStatus"] {
    if (item.status === "완료") return "COMPLETED";
    if (item.status === "승인 대기") return "APPROVAL_PENDING";
    if (item.status === "검토") return "TRIAGED";
    if (item.status === "보류") return "REJECTED";
    if (item.status === "진행") return "IN_PROGRESS";
    return "SUBMITTED";
  }

  function buildLocalFallback(requestItem: WorkItem): RequestDetail {
    const now = new Date().toISOString();

    return {
      requestNo: requestItem.id,
      workflowStatus: resolveWorkflowStatusFromItem(requestItem),
      category: requestItem.module === "A/S" ? "as" : requestItem.module === "NAS" ? "nas" : requestItem.module === "태블릿 렌탈" ? "tablet" : "other",
      subCategory: null,
      priorityCode:
        requestItem.priority === "긴급" ? "URGENT" : requestItem.priority === "높음" ? "HIGH" : requestItem.priority === "낮음" ? "LOW" : "NORMAL",
      requesterName: requestItem.requester,
      requesterUserId: null,
      branchId: null,
      branchName: null,
      assignedDepartment: null,
      assignedUserId: null,
      assignedUserName: requestItem.owner,
      createdAt: now,
      updatedAt: now,
      completedAt: requestItem.status === "완료" ? now : null,
      approvalState: requestItem.status === "승인 대기" ? "PENDING" : "NOT_REQUIRED",
      metadata: {
        localOnly: true
      },
      workItem: requestItem,
      sla: {
        dueAt: null,
        pausedAt: null,
        breached: false,
        remainingMinutes: null,
        displayLabel: "로컬 요청"
      },
      comments: [],
      progressLogs: [],
      attachments: (requestItem.evidenceFiles ?? []).map((fileName, index) => ({
        id: `${requestItem.id}-local-attachment-${index + 1}`,
        fileName,
        fileUrl: "",
        fileSize: 0,
        mimeType: "",
        uploadedBy: requestItem.requester,
        createdAt: now
      }))
    };
  }

  function findLocalFallback(requestNo: string) {
    if (typeof window === "undefined") return null;

    try {
      const raw = window.localStorage.getItem("academy-ops-hub-state-v2");
      const parsed = raw ? (JSON.parse(raw) as { items?: WorkItem[] }) : null;
      const localItem = parsed?.items?.find((item) => item.id === requestNo);
      if (localItem) return buildLocalFallback(localItem);
    } catch {
      // Ignore malformed local cache and continue to seed fallback.
    }

    const seedItem = seedItems.find((item) => item.id === requestNo);
    return seedItem ? buildLocalFallback(seedItem) : null;
  }

  useEffect(() => {
    let active = true;

    const loadDetail = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(`/api/requests/${encodeURIComponent(requestNo)}`, {
          method: "GET",
          cache: "no-store"
        });

        const data = (await response.json()) as { item?: RequestDetail; message?: string };
        if (!response.ok || !data.item) {
          const localFallback = findLocalFallback(requestNo);
          if (localFallback) {
            if (!active) return;
            setDetail(localFallback);
            setIsLocalFallback(true);
            return;
          }

          throw new Error(data.message ?? "요청 상세를 불러오지 못했습니다.");
        }

        if (!active) return;
        setDetail(data.item);
        setIsLocalFallback(false);
      } catch (error) {
        const localFallback = findLocalFallback(requestNo);
        if (localFallback) {
          if (!active) return;
          setDetail(localFallback);
          setIsLocalFallback(true);
          return;
        }

        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "요청 상세를 불러오지 못했습니다.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadDetail();
    return () => {
      active = false;
    };
  }, [requestNo]);

  const visibleComments = useMemo(() => detail?.comments ?? [], [detail]);

  async function submitComment() {
    if (isLocalFallback) {
      setErrorMessage("로컬 요청은 서버 동기화 후 댓글을 등록할 수 있습니다.");
      return;
    }

    if (!comment.trim()) {
      setErrorMessage("댓글 내용을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestNo)}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          comment
        })
      });

      const data = (await response.json()) as { comment?: RequestComment; message?: string };
      if (!response.ok || !data.comment) {
        throw new Error(data.message ?? "댓글을 저장하지 못했습니다.");
      }

      setDetail((current) => (current ? { ...current, comments: [...current.comments, data.comment!] } : current));
      setComment("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "댓글을 저장하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-6xl">
        <button
          type="button"
          onClick={() => router.push(portal === "admin" ? "/ops" : "/user")}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          돌아가기
        </button>

        {isLoading ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <p className="text-sm font-semibold text-slate-700">요청 상세를 불러오는 중입니다.</p>
          </div>
        ) : errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
            {errorMessage}
          </div>
        ) : detail ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-6">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Request Detail</p>
                    <h1 className="mt-2 text-2xl font-black text-slate-900">{detail.workItem.title}</h1>
                    <p className="mt-2 text-sm text-slate-500">
                      {detail.requestNo} · {detail.workItem.module} · {detail.requesterName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={detail.workItem.status} />
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                      {detail.workflowStatus}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-bold text-slate-400">우선순위</p>
                    <p className="mt-2 text-lg font-black text-slate-900">{detail.workItem.priority}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-bold text-slate-400">SLA</p>
                    <p className={`mt-2 text-lg font-black ${detail.sla.breached ? "text-rose-600" : "text-slate-900"}`}>{detail.sla.displayLabel}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-bold text-slate-400">담당자</p>
                    <p className="mt-2 text-lg font-black text-slate-900">{detail.assignedUserName ?? detail.workItem.owner}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-bold text-slate-400">승인 상태</p>
                    <p className="mt-2 text-lg font-black text-slate-900">{detail.approvalState}</p>
                  </article>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <p className="text-[11px] font-bold text-slate-400">상세 설명</p>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">{detail.workItem.description || "설명 없음"}</pre>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <h2 className="text-lg font-black text-slate-900">진행 로그</h2>
                </div>
                <div className="mt-4 grid gap-3">
                  {detail.progressLogs.length ? (
                    detail.progressLogs.map((log) => (
                      <article key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-black text-slate-900">{log.summary}</p>
                          <span className="text-xs font-semibold text-slate-500">{formatDateTime(log.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {log.actorName} · {log.actionType}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      아직 기록된 진행 로그가 없습니다.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <h2 className="text-lg font-black text-slate-900">댓글</h2>
                </div>
                {isLocalFallback ? (
                  <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    아직 DB에 동기화되지 않은 요청이라 댓글과 감사 로그는 읽기 전용으로 표시됩니다.
                  </p>
                ) : null}
                <div className="mt-4 grid gap-3">
                  {visibleComments.length ? (
                    visibleComments.map((entry) => (
                      <article key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-black text-slate-900">{entry.userName}</p>
                          <span className="text-xs font-semibold text-slate-500">{formatDateTime(entry.createdAt)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{entry.comment}</p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      아직 등록된 댓글이 없습니다.
                    </p>
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-0 placeholder:text-slate-400"
                    placeholder="진행 상황이나 추가 요청 내용을 남겨 주세요."
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void submitComment()}
                      disabled={isSubmitting || isLocalFallback}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isSubmitting ? "저장 중..." : "댓글 등록"}
                    </button>
                  </div>
                </div>
              </section>
            </section>

            <aside className="space-y-6">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-black text-slate-900">요청 정보</h2>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-bold text-slate-400">요청자</p>
                    <p className="mt-1 font-black text-slate-900">{detail.requesterName}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-bold text-slate-400">지점</p>
                    <p className="mt-1 font-black text-slate-900">{detail.branchName ?? "-"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-bold text-slate-400">생성일</p>
                    <p className="mt-1 font-black text-slate-900">{formatDateTime(detail.createdAt)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-bold text-slate-400">SLA 마감</p>
                    <p className="mt-1 font-black text-slate-900">{formatDateTime(detail.sla.dueAt)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-black text-slate-900">첨부 파일</h2>
                <div className="mt-4 grid gap-3">
                  {detail.attachments.length ? (
                    detail.attachments.map((file) => (
                      <div key={file.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        {file.fileName}
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      등록된 첨부 파일이 없습니다.
                    </p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}
