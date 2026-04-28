import { NextResponse } from "next/server";

type TargetInput = {
  id?: string;
  name?: string;
  url: string;
  username?: string;
  password?: string;
  auth?: string;
};

type WebDavItem = {
  name: string;
  path: string;
  type: "folder" | "file";
  size: number | null;
  modified: string | null;
};

function isTargetInput(value: unknown): value is TargetInput {
  return typeof value === "object" && value !== null && typeof (value as TargetInput).url === "string";
}

function buildAuthHeader(target: TargetInput) {
  if (target.auth) return target.auth;
  if (target.username && target.password) {
    return `Basic ${Buffer.from(`${target.username}:${target.password}`).toString("base64")}`;
  }
  return "";
}

function parseItems(xml: string): WebDavItem[] {
  const blocks = xml.match(/<d:response[\s\S]*?<\/d:response>/gi) ?? [];
  return blocks.slice(1, 6).map((block, index) => {
    const href = block.match(/<d:href>(.*?)<\/d:href>/i)?.[1] ?? `item-${index}`;
    const decodedHref = decodeURIComponent(href);
    const trimmed = decodedHref.replace(/\/$/, "");
    const name = trimmed.split("/").filter(Boolean).pop() ?? `item-${index + 1}`;
    const sizeRaw = block.match(/<d:getcontentlength>(.*?)<\/d:getcontentlength>/i)?.[1];
    const modified = block.match(/<d:getlastmodified>(.*?)<\/d:getlastmodified>/i)?.[1] ?? null;
    const type = /<d:collection\/>/i.test(block) ? "folder" : "file";
    return {
      name,
      path: decodedHref,
      type,
      size: sizeRaw ? Number(sizeRaw) : null,
      modified
    };
  });
}

async function probeTarget(target: TargetInput) {
  const auth = buildAuthHeader(target);
  const startedAt = Date.now();
  const response = await fetch(target.url, {
    method: "PROPFIND",
    headers: {
      Depth: "1",
      Authorization: auth,
      "Content-Type": "application/xml"
    },
    body: `<?xml version="1.0" encoding="utf-8" ?>
      <d:propfind xmlns:d="DAV:">
        <d:prop>
          <d:displayname />
          <d:getcontentlength />
          <d:getlastmodified />
          <d:resourcetype />
        </d:prop>
      </d:propfind>`,
    cache: "no-store"
  });

  const latencyMs = Date.now() - startedAt;
  const text = await response.text();
  const items = response.ok ? parseItems(text) : [];

  return {
    id: target.id ?? target.name ?? target.url,
    name: target.name ?? target.url,
    ok: response.ok,
    status: response.status,
    latencyMs,
    message: response.ok ? "WebDAV 연결 성공" : `WebDAV 응답 오류 (${response.status})`,
    items
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bodyObj = body as Record<string, unknown>;
  const targets = Array.isArray(bodyObj.targets) ? bodyObj.targets.filter(isTargetInput) : [];

  if (targets.length === 0) {
    return NextResponse.json({ ok: false, configured: false, message: "No valid targets", targets: [], items: [] }, { status: 400 });
  }

  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        return await probeTarget(target);
      } catch (error) {
        return {
          id: target.id ?? target.name ?? target.url,
          name: target.name ?? target.url,
          ok: false,
          message: error instanceof Error ? error.message : "WebDAV 연결 실패",
          items: []
        };
      }
    })
  );

  return NextResponse.json({
    ok: results.some((result) => result.ok),
    configured: true,
    message: results.some((result) => result.ok) ? "WebDAV 점검 완료" : "모든 WebDAV 타겟 연결 실패",
    targets: results,
    items: results.flatMap((result) =>
      result.items.map((item) => ({
        ...item,
        targetName: result.name
      }))
    )
  });
}
