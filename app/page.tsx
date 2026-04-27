import type { Metadata } from "next";
import { OpsConsole } from "@/components/ops-console";

export const metadata: Metadata = {
  title: "관리자 콘솔"
};

export default function Home() {
  return <OpsConsole />;
}
