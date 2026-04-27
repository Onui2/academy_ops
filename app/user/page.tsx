import type { Metadata } from "next";
import { UserPortal } from "@/components/user-portal";

export const metadata: Metadata = {
  title: "사용자 포털"
};

export default function UserPage() {
  return <UserPortal />;
}
