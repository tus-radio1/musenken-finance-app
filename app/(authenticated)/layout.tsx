import { SidebarDataProvider } from "@/components/sidebar-data-provider";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarDataProvider>{children}</SidebarDataProvider>;
}
