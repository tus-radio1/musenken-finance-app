import { getCurrentProfile } from "@/lib/sidebar-data";
import { getCurrentUser } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { SettingsClient } from "./client-page";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

export default async function SettingsPage() {
  const auth = await getCurrentUser();
  if (!auth) redirect("/login");

  const profile = await getCurrentProfile();

  return (
    <PageShell width="form">
      <PageHeader
        title="設定"
        description="アカウントの設定や外観を変更できます。"
      />
      <SettingsClient fullName={profile?.name || ""} />
    </PageShell>
  );
}
