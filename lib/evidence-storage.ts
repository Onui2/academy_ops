import path from "path";
import { randomUUID } from "crypto";
import { createServiceSupabaseClient } from "@/lib/server-supabase";
import type { EvidenceFileValue } from "@/lib/evidence-files";

export const OPS_EVIDENCE_BUCKET = "ops-evidence";

export async function ensureEvidenceBucket() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    throw new Error("서버 설정이 완료되지 않았습니다.");
  }

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const exists = (buckets ?? []).some((bucket) => bucket.id === OPS_EVIDENCE_BUCKET || bucket.name === OPS_EVIDENCE_BUCKET);
  if (exists) return supabase;

  const { error: createError } = await supabase.storage.createBucket(OPS_EVIDENCE_BUCKET, {
    public: false,
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ],
    fileSizeLimit: "10485760"
  });

  if (createError) throw createError;
  return supabase;
}

function sanitizeBaseName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "file";
}

export async function uploadEvidenceToStorage(files: File[], actorScope: string) {
  const supabase = await ensureEvidenceBucket();
  const date = new Date();
  const datePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;

  const uploaded = await Promise.all(
    files.map(async (file) => {
      const ext = path.extname(file.name).toLowerCase();
      const base = sanitizeBaseName(path.basename(file.name, ext));
      const storagePath = `${actorScope}/${datePath}/${Date.now()}-${randomUUID().slice(0, 8)}-${base}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error } = await supabase.storage.from(OPS_EVIDENCE_BUCKET).upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });

      if (error) throw error;

      return {
        fileName: file.name,
        fileUrl: "",
        storagePath,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream"
      } satisfies EvidenceFileValue;
    })
  );

  return uploaded;
}

export async function createEvidenceSignedUrl(storagePath: string, expiresIn = 60 * 30) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    throw new Error("서버 설정이 완료되지 않았습니다.");
  }
  const { data, error } = await supabase.storage.from(OPS_EVIDENCE_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
