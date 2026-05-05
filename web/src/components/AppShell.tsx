import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  Brain,
  Cable,
  LayoutDashboard,
  LogOut,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "../auth";

type NavItem = {
  to: "/app" | "/app/connect" | "/app/memories" | "/app/settings";
  label: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard },
  { to: "/app/connect", label: "Connect Slack", icon: Cable },
  { to: "/app/memories", label: "Memories", icon: Brain },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="extraction-grid min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-6">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 flex-col rounded-2xl border border-white/8 bg-white/[0.03] p-4 md:flex">
          <Link to="/" className="px-2 py-1">
            <Logo />
          </Link>
          <nav className="mt-6 space-y-1">
            {NAV.map((item) => {
              const active =
                item.to === "/app"
                  ? location.pathname === "/app"
                  : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-white/10 text-ink-50"
                      : "text-ink-200 hover:bg-white/5 hover:text-ink-50"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-2 pt-4">
            <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink-50">
                  {user?.firstName ?? user?.email ?? "You"}
                </div>
                <div className="truncate text-xs text-ink-400">
                  {user?.email}
                </div>
              </div>
              <button
                onClick={signOut}
                aria-label="Sign out"
                className="rounded-md p-1 text-ink-300 hover:bg-white/10 hover:text-ink-50"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
