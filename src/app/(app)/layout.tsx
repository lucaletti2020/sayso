import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileTopBar } from "@/components/layout/MobileTopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    // h-dvh (not h-screen/100vh) so the layout tracks the real visible area on
    // mobile as the browser bars expand/collapse; extra bottom padding keeps
    // the last elements clear of the browser's bottom bar.
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileTopBar />
        <main className="flex-1 overflow-y-auto p-6 pb-24 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
