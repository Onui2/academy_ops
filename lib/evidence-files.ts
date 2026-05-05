import type { RequestAttachment } from "@/types/request";

export type EvidenceFileValue = {
  fileName: string;
  fileUrl: string;
  storagePath?: string;
  fileSize?: number;
  mimeType?: string;
};

export function serializeEvidenceFile(file: EvidenceFileValue) {
  return JSON.stringify({
    fileName: file.fileName,
    fileUrl: file.fileUrl,
    storagePath: file.storagePath ?? "",
    fileSize: file.fileSize ?? 0,
    mimeType: file.mimeType ?? ""
  });
}

export function parseEvidenceFile(entry: string): EvidenceFileValue {
  try {
    const parsed = JSON.parse(entry) as Partial<EvidenceFileValue>;
    if (typeof parsed.fileName === "string" && typeof parsed.fileUrl === "string") {
      return {
        fileName: parsed.fileName,
        fileUrl: parsed.fileUrl,
        storagePath: typeof parsed.storagePath === "string" ? parsed.storagePath : "",
        fileSize: typeof parsed.fileSize === "number" ? parsed.fileSize : 0,
        mimeType: typeof parsed.mimeType === "string" ? parsed.mimeType : ""
      };
    }
  } catch {
    // Legacy plain filename format.
  }

  return {
    fileName: entry.split("/").pop() || entry,
    fileUrl: entry.startsWith("/") || entry.startsWith("http://") || entry.startsWith("https://") ? entry : "",
    storagePath: entry.startsWith("/") || entry.startsWith("http://") || entry.startsWith("https://") ? "" : entry,
    fileSize: 0,
    mimeType: ""
  };
}

export function getEvidenceFileName(entry: string) {
  return parseEvidenceFile(entry).fileName;
}

export function getEvidenceFileNames(entries?: string[]) {
  return (entries ?? []).map(getEvidenceFileName);
}

export function buildEvidenceAttachments(
  requestNo: string,
  entries: string[] | null | undefined,
  uploadedBy: string,
  createdAt: string
): RequestAttachment[] {
  return (entries ?? []).map((entry, index) => {
    const parsed = parseEvidenceFile(entry);
    return {
      id: `${requestNo}-attachment-${index + 1}`,
      fileName: parsed.fileName,
      fileUrl: parsed.fileUrl,
      fileSize: parsed.fileSize ?? 0,
      mimeType: parsed.mimeType ?? "",
      uploadedBy,
      createdAt
    };
  });
}
