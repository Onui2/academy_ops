import { NextResponse } from "next/server";
import { isHarnessError } from "@/lib/harness/harness-error";
import { requireAuthenticatedActor } from "@/lib/harness/security/auth-guard";
import { uploadPolicy, validateUploadDescriptor } from "@/lib/harness/security/upload-policy";
import { uploadEvidenceToStorage } from "@/lib/evidence-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = requireAuthenticatedActor(request);
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);

    if (!files.length) {
      return NextResponse.json({ message: "업로드할 파일이 없습니다." }, { status: 400 });
    }

    if (files.length > uploadPolicy.maxFiles) {
      return NextResponse.json({ message: "첨부 파일은 최대 5개까지 등록할 수 있습니다." }, { status: 422 });
    }

    files.forEach((file) => {
      validateUploadDescriptor({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size
      });
    });

    const actorScope = `${actor.brandId || "brand"}/${actor.branchId || "branch"}/${actor.username || "user"}`;
    const uploaded = await uploadEvidenceToStorage(files, actorScope);
    return NextResponse.json({ files: uploaded });
  } catch (error) {
    if (isHarnessError(error)) {
      return NextResponse.json({ message: error.exposeMessage }, { status: error.status });
    }

    console.error("[evidence-upload]", error);
    return NextResponse.json({ message: "첨부 파일 업로드에 실패했습니다." }, { status: 500 });
  }
}
