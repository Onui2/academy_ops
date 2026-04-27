import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NAS_WEBDAV_URL;
  const username = process.env.NAS_WEBDAV_USERNAME;
  const password = process.env.NAS_WEBDAV_PASSWORD;

  if (!url || !username || !password) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        message: "NAS WebDAV env not configured",
        items: []
      },
      { status: 200 }
    );
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "PROPFIND",
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        Depth: "1",
        "Content-Type": "application/xml"
      },
      body: `<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:displayname/><D:getcontentlength/><D:getlastmodified/><D:resourcetype/></D:prop></D:propfind>`,
      cache: "no-store"
    });

    const text = await response.text();

    return NextResponse.json({
      ok: response.ok || response.status === 207,
      configured: true,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      message: response.ok || response.status === 207 ? "WebDAV connected" : response.statusText,
      items: parseDavItems(text).slice(0, 12)
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "WebDAV connection failed",
      items: []
    });
  }
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
