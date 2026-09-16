"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      if (msg.includes("503") || msg.includes("SERVICE_UNAVAILABLE")) {
        setError("Database is offline. Start PostgreSQL to enable login.");
      } else if (msg.includes("401") || msg.includes("INVALID_CREDENTIALS")) {
        setError("Invalid email or password.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Extra decorative orbs for login page */}
      <div className="fixed top-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-gradient-to-br from-violet-400/20 to-primary/10 blur-[80px] pointer-events-none animate-float" aria-hidden="true" />
      <div className="fixed bottom-1/4 right-1/4 w-[250px] h-[250px] rounded-full bg-gradient-to-br from-sky-400/15 to-fuchsia-400/10 blur-[80px] pointer-events-none animate-float" style={{ animationDelay: "-5s" }} aria-hidden="true" />

      {/* Card */}
      <div className="glass-card-elevated rounded-3xl p-8 w-full max-w-sm space-y-6 relative z-10 animate-scale-in">
        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center mx-auto logo-glow">
            <span className="text-white font-bold text-2xl font-display">N</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground font-display">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to NexAgent CCEP Platform</p>
          </div>
        </div>

        {/* Default credentials hint */}
        <div className="flex items-start gap-2 bg-primary/6 border border-primary/15 rounded-xl px-3 py-2.5">
          <Sparkles size={13} className="text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-primary/80">
            Default: <span className="font-mono font-semibold">admin@nexagent.dev</span> / <span className="font-mono font-semibold">NexAgent_Dev_2026!</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 animate-fade-in">{error}</div>
          )}

          <Button type="submit" className="w-full h-10 text-sm group" loading={loading}>
            {!loading && (
              <>
                Sign In
                <ArrowRight size={14} className="ml-1.5 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
              </>
            )}
            {loading && "Signing in…"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="text-primary font-medium hover:underline transition-colors">Create one</Link>
        </p>
      </div>
    </div>
  );
}
