import { HarnessError } from "@/lib/harness/harness-error";

const allowedExtensions = new Set(["jpg", "jpeg", "png", "pdf", "xlsx", "docx"]);
const blockedExtensions = new Set(["exe", "bat", "cmd", "ps1", "sh", "js", "html", "php", "zip", "rar"]);
const allowedMimePrefixes = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

export const uploadPolicy = {
  maxFiles: 5,
  maxBytes: 10 * 1024 * 1024,
  allowedExtensions: [...allowedExtensions]
};

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function resolveAttachmentFileName(value: string) {
  try {
    const parsed = JSON.parse(value) as { fileName?: string };
    if (typeof parsed.fileName === "string" && parsed.fileName.trim()) {
      return parsed.fileName.trim();
    }
  } catch {
    // Legacy plain filename format.
  }

  return value;
}

export function validateAttachmentNames(fileNames: string[]) {
  if (fileNames.length > uploadPolicy.maxFiles) {
    throw new HarnessError("첨부 파일 개수를 초과했습니다.", 422, "첨부 파일은 최대 5개까지 등록할 수 있습니다.");
  }

  fileNames.forEach((rawFileName) => {
    const fileName = resolveAttachmentFileName(rawFileName);
    const extension = getExtension(fileName);
    if (!extension) {
      throw new HarnessError("확장자가 없는 파일은 허용되지 않습니다.", 422, "허용되지 않는 첨부 파일 형식이 포함되어 있습니다.");
    }
    if (blockedExtensions.has(extension) || !allowedExtensions.has(extension)) {
      throw new HarnessError(`Blocked attachment extension: ${extension}`, 422, "허용되지 않는 첨부 파일 형식이 포함되어 있습니다.");
    }
  });
}

export function validateUploadDescriptor(file: { fileName: string; mimeType: string; fileSize: number }) {
  const extension = getExtension(file.fileName);
  if (blockedExtensions.has(extension) || !allowedExtensions.has(extension)) {
    throw new HarnessError(`Blocked attachment extension: ${extension}`, 422, "허용되지 않는 첨부 파일 형식이 포함되어 있습니다.");
  }
  if (!allowedMimePrefixes.includes(file.mimeType)) {
    throw new HarnessError(`Blocked attachment mime type: ${file.mimeType}`, 422, "허용되지 않는 첨부 파일 형식이 포함되어 있습니다.");
  }
  if (file.fileSize > uploadPolicy.maxBytes) {
    throw new HarnessError("Attachment exceeded file size policy.", 422, "첨부 파일 용량 제한을 초과했습니다.");
  }
}
