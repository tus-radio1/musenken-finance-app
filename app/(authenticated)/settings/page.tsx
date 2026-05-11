import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
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
    .select("name")
    .eq("id", user.id)
    .single();

  return (
    <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">設定</h1>
            <p className="text-muted-foreground">
              アカウントの設定や外観を変更できます。
            </p>
          </div>
        </div>
        <SettingsClient fullName={profile?.name || ""} />
      </div>
    </main>
  );
}
