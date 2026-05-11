import { createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookEventName =
  | "request.submitted"
  | "approval.required"
  | "approval.approved"
  | "approval.rejected"
  | "request.completed"
  | "request.canceled";

export type WebhookPayload = {
  event: WebhookEventName;
  timestamp: string;
  requestNo: string;
  workflowStatus: string;
  category?: string;
  requesterName?: string | null;
  branchName?: string | null;
  title?: string;
  priority?: string;
  metadata?: Record<string, unknown>;
};

type WebhookConfigRow = {
  id: string;
  url: string;
  secret: string | null;
  enabled: boolean;
  events: string[];
};

type DeliveryResult = {
  configId: string;
  urlMasked: string;
  success: boolean;
  statusCode: number | null;
  errorMessage: string | null;
};

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.slice(0, 20);
    return `${parsed.protocol}//${parsed.hostname}${path}${parsed.pathname.length > 20 ? "***" : ""}`;
  } catch {
    return url.slice(0, 30) + "***";
  }
}

async function fetchWebhookConfigs(supabase: SupabaseClient): Promise<WebhookConfigRow[]> {
  try {
    const { data } = await supabase
      .from("webhook_configs")
      .select("id, url, secret, enabled, events")
      .eq("enabled", true);
    return (data ?? []) as WebhookConfigRow[];
  } catch {
    return [];
  }
}

function buildEnvConfigs(): WebhookConfigRow[] {
  const raw = process.env.WEBHOOK_URLS ?? "";
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url, i) => ({
      id: `env-${i}`,
      url,
      secret: process.env.WEBHOOK_SECRET ?? null,
      enabled: true,
      events: []
    }));
}

async function sendToUrl(
  url: string,
  payload: WebhookPayload,
  secret: string | null,
  attempt = 1
): Promise<{ statusCode: number | null; success: boolean; error: string | null }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event": payload.event,
    "X-Webhook-Timestamp": payload.timestamp,
    "X-Webhook-Attempt": String(attempt)
  };

  if (secret) {
    const hmac = createHmac("sha256", secret);
    hmac.update(body);
    headers["X-Hub-Signature-256"] = `sha256=${hmac.digest("hex")}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000)
    });
    const success = res.status >= 200 && res.status < 300;

    if (!success && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return sendToUrl(url, payload, secret, attempt + 1);
    }

    return { statusCode: res.status, success, error: success ? null : `HTTP ${res.status}` };
  } catch (err) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return sendToUrl(url, payload, secret, attempt + 1);
    }
    return {
      statusCode: null,
      success: false,
      error: err instanceof Error ? err.message : "Unknown error"
    };
  }
}

async function logDelivery(
  supabase: SupabaseClient,
  configId: string,
  event: string,
  requestNo: string,
  urlMasked: string,
  result: { success: boolean; statusCode: number | null; error: string | null }
) {
  try {
    await supabase.from("webhook_delivery_logs").insert({
      config_id: configId.startsWith("env-") ? null : configId,
      event,
      request_no: requestNo,
      url_masked: urlMasked,
      status_code: result.statusCode,
      success: result.success,
      error_message: result.error
    });
  } catch {
    // delivery log failure must not propagate
  }
}

export async function dispatchWebhookEvent(
  payload: WebhookPayload,
  supabase?: SupabaseClient
): Promise<DeliveryResult[]> {
  const dbConfigs = supabase ? await fetchWebhookConfigs(supabase) : [];
  const envConfigs = buildEnvConfigs();

  const allConfigs = [
    ...dbConfigs,
    ...envConfigs.filter((e) => !dbConfigs.some((d) => d.url === e.url))
  ];

  const targets = allConfigs.filter((config) => {
    if (!config.enabled) return false;
    if (config.events.length > 0 && !config.events.includes(payload.event)) return false;
    return true;
  });

  if (!targets.length) return [];

  const results = await Promise.all(
    targets.map(async (config): Promise<DeliveryResult> => {
      const urlMasked = maskUrl(config.url);
      const result = await sendToUrl(config.url, payload, config.secret);

      if (supabase) {
        await logDelivery(supabase, config.id, payload.event, payload.requestNo, urlMasked, result);
      }

      return {
        configId: config.id,
        urlMasked,
        success: result.success,
        statusCode: result.statusCode,
        errorMessage: result.error
      };
    })
  );

  return results;
}

export async function sendTestWebhook(
  url: string,
  secret: string | null
): Promise<{ success: boolean; statusCode: number | null; error: string | null }> {
  const payload: WebhookPayload = {
    event: "request.submitted",
    timestamp: new Date().toISOString(),
    requestNo: "TEST-00000000-000-000",
    workflowStatus: "SUBMITTED",
    category: "equipment",
    requesterName: "웹훅 테스트",
    branchName: "테스트 지점",
    title: "웹훅 연결 테스트",
    priority: "보통"
  };
  return sendToUrl(url, payload, secret, 1);
}
