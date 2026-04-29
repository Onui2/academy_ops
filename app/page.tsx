import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { fetchProfileRole } from "@/lib/ops-repository";

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  try {
    const role = await fetchProfileRole(supabase, data.user);
    if (role === "general") {
      redirect("/user");
    } else {
      redirect("/ops");
    }
  } catch (e) {
    // Fallback if profile doesn't exist
    redirect("/user");
  }
}
