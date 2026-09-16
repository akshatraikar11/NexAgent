"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; message: string; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-8">
        <div className="glass-card rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
            <AlertTriangle size={22} className="text-amber-600" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">{this.state.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, message: "" }); window.location.reload(); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium shadow-[0_4px_14px_rgba(91,78,250,0.35)] hover:bg-primary/90 transition-all"
          >
            <RefreshCw size={14} />Reload page
          </button>
        </div>
      </div>
    );
  }
}
