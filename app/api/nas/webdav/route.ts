import { NextResponse } from "next/server";

type Target = {
  url: string;
  auth: string;
};

function isTarget(obj: unknown): obj is Target {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "url" in obj &&
    "auth" in obj &&
    typeof (obj as Target).url === "string" &&
    typeof (obj as Target).auth === "string"
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bodyObj = body as Record<string, unknown>;
  const targets = (Array.isArray(bodyObj?.targets)) 
    ? bodyObj.targets.filter(isTarget) 
    : [];

  if (targets.length === 0) {
    return NextResponse.json({ error: "No valid targets" }, { status: 400 });
  }

  return NextResponse.json({ message: "Success" });
}
