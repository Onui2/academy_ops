const dangerousKeys = ["password", "token", "secret", "session", "cookie", "authorization", "apiKey", "serviceRoleKey"];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizePlainText(value: string) {
  return escapeHtml(value.replace(/\u0000/g, "").trim());
}

export function sanitizeRecord<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeRecord(item)) as T;
  }

  if (typeof input === "string") {
    return sanitizePlainText(input) as T;
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const next = Object.entries(input as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key] = sanitizeRecord(value);
    return acc;
  }, {});

  return next as T;
}

export function redactSensitiveFields(input: Record<string, unknown> | null | undefined) {
  if (!input) return null;

  return Object.entries(input).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const lowered = key.toLowerCase();
    if (dangerousKeys.some((candidate) => lowered.includes(candidate.toLowerCase()))) {
      acc[key] = "[REDACTED]";
      return acc;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      acc[key] = redactSensitiveFields(value as Record<string, unknown>);
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}
