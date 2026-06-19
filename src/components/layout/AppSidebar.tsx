import { SidebarContent } from "@/components/layout/SidebarContent";

// Desktop sidebar (hidden on mobile — the mobile nav lives in MobileTopBar).
export function AppSidebar() {
  return (
    <aside className="hidden h-full w-60 flex-col border-r bg-muted/30 px-3 py-4 md:flex">
      <SidebarContent />
    </aside>
  );
}
