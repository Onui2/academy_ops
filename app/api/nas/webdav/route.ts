import { NextResponse } from "next/server";

export async function GET() {
  const targets = getTargets();

  if (!targets.length) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        message: "NAS WebDAV env not configured",
        targets: [],
        items: []
      },
      { status: 200 }
    );
  }

  const results = await Promise.all(targets.map(checkTarget));
  const okCount = results.filter((item) => item.ok).length;

  return NextResponse.json({
    ok: okCount > 0,
    configured: true,
    message: `${okCount}/${results.length} NAS connected`,
    targets: results,
    items: results.flatMap((target) => target.items.map((item) => ({ ...item, targetId: target.id, targetName: target.name }))).slice(0, 24)
  });
}

type WebDavTarget = {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
};

async function checkTarget(target: WebDavTarget) {
  const startedAt = Date.now();

  try {
    const response = await fetch(target.url, {
      method: "PROPFIND",
      headers: {
        Authorization: `Basic ${Buffer.from(`${target.username}:${target.password}`).toString("base64")}`,
        Depth: "1",
        "Content-Type": "application/xml"
      },
      body: `<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:displayname/><D:getcontentlength/><D:getlastmodified/><D:resourcetype/></D:prop></D:propfind>`,
      cache: "no-store"
    });

    const text = await response.text();

    return {
      id: target.id,
      name: target.name,
      ok: response.ok || response.status === 207,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      message: response.ok || response.status === 207 ? "WebDAV connected" : response.statusText,
      items: parseDavItems(text).slice(0, 12)
    };
  } catch (error) {
    return {
      id: target.id,
      name: target.name,
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "WebDAV connection failed",
      items: []
    };
  }
}

function getTargets(): WebDavTarget[] {
  const rawTargets = process.env.NAS_WEBDAV_TARGETS;

  if (rawTargets) {
    try {
      const parsed = JSON.parse(rawTargets) as WebDavTarget[];
      return parsed.filter((target) => target.url && target.username && target.password);
    } catch {
      return [];
    }
  }

  const url = process.env.NAS_WEBDAV_URL;
  const username = process.env.NAS_WEBDAV_USERNAME;
  const password = process.env.NAS_WEBDAV_PASSWORD;

  if (!url || !username || !password) return [];

  return [
    {
      id: "default",
      name: process.env.NAS_WEBDAV_NAME ?? "NAS",
      url,
      username,
      password
    }
  ];
}

function parseDavItems(xml: string) {
  const responses = xml.match(/<[^:>]*:?response[\s\S]*?<\/[^:>]*:?response>/g) ?? [];

  return responses.map((entry) => {
    const href = pick(entry, "href");
    const displayName = pick(entry, "displayname") || decodeURIComponent(href.split("/").filter(Boolean).at(-1) ?? "/");
    const size = pick(entry, "getcontentlength");
    const modified = pick(entry, "getlastmodified");
    const isDirectory = /<[^:>]*:?collection\s*\/?>/.test(entry);

    return {
      name: displayName || "/",
      path: href,
      type: isDirectory ? "folder" : "file",
      size: size ? Number(size) : null,
      modified: modified || null
    };
  });
}

function pick(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<[^:>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}
