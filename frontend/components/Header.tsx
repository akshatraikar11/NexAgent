"use client";

import { ReactNode, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Bell, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

const titles: Record<string, { title: string; sub: string }> = {
  "/":               { title: "Overview",                sub: "Autonomous incident triage & telemetry" },
  "/dashboard":      { title: "Operations Dashboard",    sub: "Real-time decisions, scores & drift metrics" },
  "/triage":         { title: "Ticket Triage",           sub: "ITIL-classified ticket automation" },
  "/incidents":      { title: "Incident Response",       sub: "Sentry alert → CCEP → SRE action" },
  "/ci":             { title: "CI Test Triage",          sub: "Flaky vs regression detection" },
  "/build-deploy":   { title: "Build / Deploy Triage",   sub: "Transient infra vs config error" },
  "/mergegate":      { title: "MergeGate PR Review",     sub: "Risk-gated auto-merge pipeline" },
  "/knowledge-base":    { title: "Knowledge Base",          sub: "Quality-gated self-learning KB" },
  "/knowledge-analytics": { title: "KM Analytics",           sub: "SECI model — tacit-to-explicit conversion" },
  "/onboarding":        { title: "Setup Wizard",             sub: "Configure NexAgent for your organization" },
  "/approvals":      { title: "Approvals Queue",         sub: "Escalated decisions awaiting review" },
  "/audit":          { title: "Audit Trail",             sub: "Immutable cryptographic action log" },
  "/settings":       { title: "Platform Settings",       sub: "CCEP weights, threshold & reversibility map" },
  "/ccep":           { title: "CCEP Explainability",     sub: "Multi-signal confidence breakdown" },
  "/weight-drift":   { title: "Weight Drift Sentinel",   sub: "CCEP weight evolution & divergence tracker" },
  "/sla":            { title: "SLA Tracker",             sub: "Ticket SLA deadlines & breach status" },
  "/correlation":    { title: "Alert Correlation",       sub: "Incident grouping & noise reduction" },
  "/analytics":      { title: "Pipeline Telemetry",      sub: "Auto-resolution rates & step latencies" },
};

export function Header({ mobileMenuButton }: { mobileMenuButton?: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const page = titles[pathname] ?? { title: "NexAgent", sub: "Autonomous AI Operations" };
  const [unread, setUnread] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const prevUnread = useRef(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!user) return;
    const poll = () => api.notifications.unreadCount().then((r) => {
      prevUnread.current = r.count;
      setUnread(r.count);
    }).catch(() => {});
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [user]);

  return (
    <header className={`header-light px-4 md:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 transition-shadow duration-200 ${scrolled ? "header-scrolled" : ""}`}>
      <div className="flex items-center gap-3">
        {mobileMenuButton}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-900 tracking-tight font-display">{page.title}</h1>
            <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
              LIVE
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden sm:block font-sans">{page.sub}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick Search */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer">
          <Search size={13} className="text-slate-400" />
          <span className="text-xs">Search incidents, tickets, logs...</span>
          <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-white border border-slate-200 text-slate-600 shadow-sm">
            ⌘K
          </kbd>
        </div>

        {/* Live SSE Indicator */}
        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 glow-pulse" />
          <span className="text-[11px] font-mono font-semibold text-emerald-800">12ms SSE</span>
        </div>

        {/* Notification Bell */}
        {user && (
          <Link
            href="/audit"
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Notifications"
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        )}

        {/* User / Auth */}
        {user ? (
          <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
            <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center text-white text-xs font-semibold">
              {user.name?.[0]?.toUpperCase() ?? "A"}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-slate-900 truncate leading-tight">{user.name}</p>
              <p className="text-[10px] text-slate-500 font-mono uppercase">{user.role}</p>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold btn-executive"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
