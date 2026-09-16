"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ErrorBoundary } from "./ErrorBoundary";
import { Menu } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white border border-slate-200/80 shadow-card">
          <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-base font-display">NX</span>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-slate-900 font-display">NexAgent Platform</p>
            <p className="text-xs text-slate-500 font-mono">Initializing CCEP Sentinel…</p>
          </div>
          <div className="flex gap-1.5 mt-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 relative">
      <div className="flex min-h-screen relative z-10">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Mobile sidebar drawer */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden transition-opacity duration-200"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 left-0 z-50 md:hidden animate-slide-in-left">
              <Sidebar onClose={() => setMobileOpen(false)} />
            </div>
          </>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <Header
            mobileMenuButton={
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors mr-1"
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>
            }
          />
          <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto overflow-auto">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
