"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Home, Ticket, AlertTriangle, BookOpen,
  ClipboardList, ScrollText, Settings, BarChart3, Sliders, LogOut,
  GitBranch, GitMerge, Rocket, Clock, Link2, LineChart, X,
  Brain, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type NavEntry =
  | { href: string; label: string; icon: React.ElementType; separator?: undefined }
  | { separator: string; href?: undefined; label?: undefined; icon?: undefined };

const navEntries: NavEntry[] = [
  { href: "/",              label: "Overview",       icon: Home },
  { href: "/dashboard",     label: "Dashboard",      icon: LayoutDashboard },
  { separator: "Incident Triage" },
  { href: "/triage",        label: "Ticket Triage",  icon: Ticket },
  { href: "/incidents",     label: "Live Incidents", icon: AlertTriangle },
  { href: "/ci",            label: "CI Pipeline",    icon: GitBranch },
  { href: "/build-deploy",  label: "Build & Deploy", icon: Rocket },
  { href: "/mergegate",     label: "MergeGate",      icon: GitMerge },
  { separator: "AI Intelligence" },
  { href: "/knowledge-base",      label: "Knowledge Base",  icon: BookOpen },
  { href: "/knowledge-analytics", label: "KM Analytics",    icon: Brain },
  { href: "/approvals",           label: "Approvals",       icon: ClipboardList },
  { href: "/sla",                 label: "SLA Guard",       icon: Clock },
  { href: "/correlation",         label: "Alert Correlation", icon: Link2 },
  { href: "/analytics",           label: "Telemetry",       icon: LineChart },
  { separator: "Platform Ops" },
  { href: "/audit",               label: "Audit Trail",     icon: ScrollText },
  { href: "/settings",            label: "Settings",        icon: Settings },
  { href: "/ccep",                label: "CCEP Engine",     icon: BarChart3 },
  { href: "/weight-drift",        label: "Model Drift",     icon: Sliders },
  { href: "/onboarding",          label: "Setup Wizard",    icon: Sparkles },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex flex-col w-64 min-h-screen sidebar-light shrink-0 z-20">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-slate-200/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xs tracking-wider font-display">NX</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-display font-bold text-sm text-slate-900 tracking-tight">NexAgent</p>
                <span className="px-1.5 py-0.2 text-[9px] font-semibold tracking-wider rounded bg-slate-100 text-slate-700 border border-slate-200">
                  AI OPS
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">CCEP Core v2.4</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors md:hidden"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Status indicator */}
        <div className="mt-3.5 px-2.5 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 glow-pulse" />
            <span className="text-[10px] font-mono font-medium text-emerald-800">SENTINEL ONLINE</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-700 font-semibold">99.98%</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navEntries.map((item, idx) => {
          if ('separator' in item && item.separator) {
            return (
              <div key={`sep-${idx}`} className="pt-5 pb-2 px-2.5 section-separator">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  {item.separator}
                </p>
              </div>
            );
          }

          const navItem = item as { href: string; label: string; icon: React.ElementType };
          const active = pathname === navItem.href;
          const Icon = navItem.icon;

          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 group",
                active
                  ? "nav-active-bar font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
              )}
            >
              <Icon
                size={16}
                className={cn(
                  "transition-colors duration-150 shrink-0",
                  active ? "text-white" : "text-slate-500 group-hover:text-slate-900"
                )}
              />
              <span>{navItem.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Capsule */}
      {user && (
        <div className="px-4 py-3.5 border-t border-slate-200/80 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                {user.name?.[0]?.toUpperCase() ?? "A"}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{user.name}</p>
                <p className="text-[10px] text-slate-500 truncate uppercase font-mono">{user.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
