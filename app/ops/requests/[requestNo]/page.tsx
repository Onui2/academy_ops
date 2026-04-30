import { TeacherAccessGate } from "@/components/teacher-access-gate";
import { RequestDetailScreen } from "@/components/request-detail-screen";

export default async function OpsRequestDetailPage({
  params
}: {
  params: Promise<{ requestNo: string }>;
}) {
  const { requestNo } = await params;

  return (
    <TeacherAccessGate portal="admin">
      <RequestDetailScreen requestNo={requestNo} portal="admin" />
    </TeacherAccessGate>
  );
}
