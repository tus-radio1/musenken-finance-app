"use client";

import { createContext, useContext } from "react";
import { useSidebarData } from "@/lib/use-sidebar-data";

type SidebarDataContextValue = ReturnType<typeof useSidebarData>;

const SidebarDataContext = createContext<SidebarDataContextValue | null>(null);

export function SidebarDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarData = useSidebarData();

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
