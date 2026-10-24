"use client";

import { createContext, useContext } from "react";
import type { SidebarData } from "@/lib/sidebar-types";
import { useSidebarData } from "@/lib/use-sidebar-data";

type SidebarDataContextValue = ReturnType<typeof useSidebarData>;

const SidebarDataContext = createContext<SidebarDataContextValue | null>(null);

export function SidebarDataProvider({
  children,
  data,
}: {
  children: React.ReactNode;
  data: SidebarData;
}) {
  const sidebarData = useSidebarData(data);

  return (
    <SidebarDataContext.Provider value={sidebarData}>
      {children}
    </SidebarDataContext.Provider>
  );
}

export function useSidebarDataContext(): SidebarDataContextValue {
  const context = useContext(SidebarDataContext);
  if (context === null) {
    throw new Error(
      "useSidebarDataContext must be used within a SidebarDataProvider",
    );
  }
  return context;
}
