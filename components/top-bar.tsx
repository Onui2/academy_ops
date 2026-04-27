import { Bell, Search, ShieldCheck, UserCircle2 } from "lucide-react";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">EduOS Manager</p>
          <h1 className="text-xl font-black tracking-tight text-slate-900">경영지원 통합 센터</h1>
        </div>
        <div className="ml-auto hidden min-w-[260px] max-w-sm flex-1 items-center gap-2 rounded border border-border bg-white px-3 py-2 shadow-panel md:flex">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="요청 번호, 학원, 업무 검색"
          />
        </div>
        <button className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded border border-border bg-white text-muted-foreground shadow-panel" aria-label="알림">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>
        <button className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded border border-border bg-white text-primary shadow-panel" aria-label="보안 상태">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </button>
        <button className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded bg-primary text-primary-foreground" aria-label="사용자 메뉴">
          <UserCircle2 className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
