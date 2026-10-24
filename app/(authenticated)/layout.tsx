import { SidebarDataProvider } from "@/components/sidebar-data-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { getSidebarData } from "@/lib/sidebar-data";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarData = await getSidebarData();
  return (
    <SidebarDataProvider data={sidebarData}>
      <div className="min-h-screen bg-background">
        <div className="flex h-screen">
          <AppSidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
        <MobileSidebar />
        <MobileBottomNav />
      </div>
    </SidebarDataProvider>
  );
}
