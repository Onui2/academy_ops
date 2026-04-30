import { TeacherAccessGate } from "@/components/teacher-access-gate";
import { RequestDetailScreen } from "@/components/request-detail-screen";

export default async function UserRequestDetailPage({
  params
}: {
  params: Promise<{ requestNo: string }>;
}) {
  const { requestNo } = await params;

  return (
    <TeacherAccessGate portal="user">
      <RequestDetailScreen requestNo={requestNo} portal="user" />
    </TeacherAccessGate>
  );
}
