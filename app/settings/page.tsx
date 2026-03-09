import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SettingsClient } from "./client-page";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-8 h-screen overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">設定</h1>
            <p className="text-muted-foreground">
              アカウントの設定や外観を変更できます。
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SettingsClient fullName={profile?.full_name || ""} />
        </div>
      </main>
    </div>
  );
}
