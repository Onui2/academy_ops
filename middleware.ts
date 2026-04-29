import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("flipedu_teacher_session");
  const hasSession = !!sessionCookie?.value;

  const isProtectedPath = request.nextUrl.pathname.startsWith("/user") || request.nextUrl.pathname.startsWith("/ops");

  // Protect /user and /ops routes
  if (!hasSession && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If user is logged in and accesses /login or /, redirect to their correct dashboard
  if (hasSession && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/")) {
    try {
      // Basic base64 decode for edge runtime
      const base64 = sessionCookie.value.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(atob(base64));
      
      const role = decoded.portalRole;
      const url = request.nextUrl.clone();
      url.pathname = role === "admin" ? "/ops" : "/user";
      return NextResponse.redirect(url);
    } catch {
      // If parsing fails, proceed and let client-side components handle invalid sessions
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

