import { createHmac, timingSafeEqual } from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "academy-ops-dev-secret-change-in-production";

export function signSessionPayload(payload: string): string {
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionPayload(value: string): string | null {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payload = value.slice(0, dotIndex);
  const sig = value.slice(dotIndex + 1);
  const expected = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");

  try {
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    return payload;
  } catch {
    return null;
  }
}
