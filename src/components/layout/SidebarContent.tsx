"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Home, BarChart2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { href: "/home", label: "My Courses", icon: Home },
  { href: "/dashboard", label: "Progress", icon: BarChart2 },
];

// Inner sidebar contents, shared by the desktop sidebar and the mobile drawer.
// `onNavigate` lets the mobile drawer close itself when a link is tapped.
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-base text-accent-foreground">
          🔊
        </div>
        <span className="font-display text-xl leading-none">TalktheTalk</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <Separator className="my-3" />

      <div className="flex items-center gap-1 px-1">
        <Link
          href="/profile"
          onClick={onNavigate}
          className={cn(
            "flex flex-1 min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted",
            pathname === "/profile" && "bg-muted"
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.image ?? ""} />
            <AvatarFallback>{user?.name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <span className="flex-1 min-w-0 truncate text-xs font-medium">{user?.name ?? "You"}</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  );
}
