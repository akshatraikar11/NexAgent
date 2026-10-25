"use client";

import { ReactNode, useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut, Bell, Search, X, CheckCircle2, AlertTriangle, ArrowRight,
  GitBranch, GitMerge, Rocket, Ticket, BookOpen, Brain, Clock, Link2,
  LineChart, ScrollText, Settings, BarChart3, Sliders, Sparkles, Check
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type Notification } from "@/lib/api";

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

const COMMANDS = [
  // Pipelines
  { label: "MergeGate PR Review", href: "/mergegate", category: "Pipelines", icon: GitMerge, desc: "Autonomous GitHub PR risk assessment & merge" },
  { label: "CI Test Triage", href: "/ci", category: "Pipelines", icon: GitBranch, desc: "Flaky vs regression analysis on GitHub Actions" },
  { label: "Build / Deploy Triage", href: "/build-deploy", category: "Pipelines", icon: Rocket, desc: "Docker infra timeout vs configuration triage" },
  { label: "Live Incidents Response", href: "/incidents", category: "Pipelines", icon: AlertTriangle, desc: "Sentry outages, P0-P3 severity, Slack & PagerDuty" },
  { label: "Ticket Triage & Host Fix", href: "/triage", category: "Pipelines", icon: Ticket, desc: "Jira Cloud triage & Windows 11 host remediation" },

  // AI Intelligence
  { label: "Approvals & Overrides", href: "/approvals", category: "AI Intelligence", icon: CheckCircle2, desc: "Review held decisions and tune CCEP signals" },
  { label: "Knowledge Base", href: "/knowledge-base", category: "AI Intelligence", icon: BookOpen, desc: "Search and manage ChromaDB vector runbooks" },
  { label: "KM Analytics (SECI)", href: "/knowledge-analytics", category: "AI Intelligence", icon: Brain, desc: "Tacit-to-explicit knowledge spiral metrics" },
  { label: "SLA Guard", href: "/sla", category: "AI Intelligence", icon: Clock, desc: "Live countdowns and response target monitoring" },
  { label: "Alert Correlation", href: "/correlation", category: "AI Intelligence", icon: Link2, desc: "Root cause clustering and cascading noise reduction" },
  { label: "Pipeline Telemetry", href: "/analytics", category: "AI Intelligence", icon: LineChart, desc: "Decision trends, latencies and resolution rates" },

  // Operations
  { label: "Audit Trail", href: "/audit", category: "Platform Ops", icon: ScrollText, desc: "Cryptographic activity and decision change logs" },
  { label: "Platform Settings & Webhooks", href: "/settings", category: "Platform Ops", icon: Settings, desc: "Inbound webhook listeners, weights & thresholds" },
  { label: "CCEP Engine Math", href: "/ccep", category: "Platform Ops", icon: BarChart3, desc: "Multi-signal radar explainability & verification" },
  { label: "Model Weight Drift", href: "/weight-drift", category: "Platform Ops", icon: Sliders, desc: "Historical weight drift and convergence chart" },
  { label: "Setup Wizard", href: "/onboarding", category: "Platform Ops", icon: Sparkles, desc: "Guided organization and policy configuration" },
];

export function Header({ mobileMenuButton }: { mobileMenuButton?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const page = titles[pathname] ?? { title: "NexAgent", sub: "Autonomous AI Operations" };

  // States
  const [unread, setUnread] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [latencyMs, setLatencyMs] = useState(12);

  // Search Palette State
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Notifications Popover State
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Measure actual SSE/API latency periodically
  const pingHealth = useCallback(async () => {
    try {
      const t0 = performance.now();
      await fetch("http://localhost:3001/health", { cache: "no-store" });
      const duration = Math.max(4, Math.round(performance.now() - t0));
      setLatencyMs(duration);
    } catch {
      // Keep previous
    }
  }, []);

  useEffect(() => {
    pingHealth();
    const interval = setInterval(pingHealth, 15_000);
    return () => clearInterval(interval);
  }, [pingHealth]);

  // Scroll effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Poll notifications count
  const pollUnread = useCallback(() => {
    if (!user) return;
    api.notifications.unreadCount().then((r) => setUnread(r.count)).catch(() => {});
  }, [user]);

  useEffect(() => {
    pollUnread();
    const id = setInterval(pollUnread, 30_000);
    return () => clearInterval(id);
  }, [pollUnread]);

  // Fetch full notifications list when popover opens
  useEffect(() => {
    if (isNotifOpen) {
      setLoadingNotifs(true);
      api.notifications
        .list()
        .then((list) => {
          setNotifications(Array.isArray(list) ? list : []);
        })
        .catch(() => setNotifications([]))
        .finally(() => setLoadingNotifs(false));
    }
  }, [isNotifOpen]);

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  // Close notifications on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    if (isNotifOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isNotifOpen]);

  // Keyboard shortcut for Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      } else if (e.key === "Escape" && isPaletteOpen) {
        setIsPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPaletteOpen]);

  // Auto focus input when palette opens
  useEffect(() => {
    if (isPaletteOpen) {
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isPaletteOpen]);

  // Filter commands by search
  const filteredCommands = COMMANDS.filter((cmd) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.desc.toLowerCase().includes(q)
    );
  });

  // Handle arrow key navigation in command palette
  const handlePaletteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
      e.preventDefault();
      router.push(filteredCommands[selectedIndex].href);
      setIsPaletteOpen(false);
    }
  };

  return (
    <>
      <header
        className={`header-light px-4 md:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 transition-shadow duration-200 ${
          scrolled ? "header-scrolled" : ""
        }`}
      >
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
          {/* Quick Search Button (Opens Cmd+K Palette) */}
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-all cursor-pointer group"
          >
            <Search size={13} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
            <span className="text-xs">Search incidents, tickets, logs...</span>
            <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-white border border-slate-200 text-slate-600 shadow-sm group-hover:border-slate-300">
              ⌘K
            </kbd>
          </button>

          {/* Live SSE / Health Latency Indicator */}
          <div
            className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 cursor-default select-none transition-all hover:bg-emerald-100/60"
            title="Real-time SSE Event Stream & Heartbeat"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 glow-pulse" />
            <span className="text-[11px] font-mono font-semibold text-emerald-800 tabular-nums">
              {latencyMs}ms SSE
            </span>
          </div>

          {/* Notification Bell with Interactive Dropdown */}
          {user && (
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setIsNotifOpen((prev) => !prev)}
                className={`relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors ${
                  isNotifOpen ? "bg-slate-100 text-slate-900" : ""
                }`}
                title="Notifications & Alerts"
              >
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {/* Popover Dropdown */}
              {isNotifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200/80 shadow-2xl z-50 overflow-hidden animate-scale-in">
                  <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Notifications</span>
                      {unread > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-700 rounded-full">
                          {unread} new
                        </span>
                      )}
                    </div>
                    {unread > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        <Check size={11} />
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {loadingNotifs ? (
                      <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                        <p>Loading alerts…</p>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-8 text-center space-y-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                          <CheckCircle2 size={16} />
                        </div>
                        <p className="text-xs font-semibold text-slate-800">All caught up!</p>
                        <p className="text-[11px] text-muted-foreground">Zero unread notifications or escalations.</p>
                      </div>
                    ) : (
                      notifications.slice(0, 10).map((n) => (
                        <div
                          key={n.id}
                          className={`p-3 text-xs transition-colors hover:bg-slate-50 ${
                            !n.isRead ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                                n.severity === "CRITICAL" || n.severity === "HIGH"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {n.severity}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="font-semibold text-slate-900 leading-tight">{n.title}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="p-2 border-t border-slate-100 bg-slate-50/50 text-center">
                    <Link
                      href="/audit"
                      onClick={() => setIsNotifOpen(false)}
                      className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      View full Audit Trail →
                    </Link>
                  </div>
                </div>
              )}
            </div>
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
              <Link href="/signup" className="px-3.5 py-1.5 rounded-xl text-xs font-semibold btn-executive">
                Get Started
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* ⌘K Command Palette Modal */}
      {isPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="p-3.5 border-b border-slate-100 flex items-center gap-3">
              <Search size={16} className="text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Type a page, pipeline, or feature name..."
                className="w-full text-sm bg-transparent outline-none placeholder:text-slate-400 text-slate-900"
              />
              <button
                type="button"
                onClick={() => setIsPaletteOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={15} />
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredCommands.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No commands or pages matching &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredCommands.map((cmd, idx) => {
                  const Icon = cmd.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={cmd.href}
                      onClick={() => {
                        router.push(cmd.href);
                        setIsPaletteOpen(false);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-slate-700 hover:bg-slate-100/80"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? "bg-primary text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          <Icon size={14} />
                        </div>
                        <div className="truncate">
                          <p className="font-semibold text-slate-900 truncate">{cmd.label}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{cmd.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {cmd.category}
                        </span>
                        <ArrowRight size={12} className={isSelected ? "text-primary" : "text-slate-300"} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer shortcuts */}
            <div className="p-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Open</span>
                <span>ESC Close</span>
              </div>
              <span className="text-slate-500 font-sans font-medium">NexAgent Power Search</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
