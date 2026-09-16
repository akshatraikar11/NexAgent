import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "NexAgent — CCEP Incident Triage Platform",
  description: "Autonomous incident triage platform with calibrated CCEP human-in-the-loop escalation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-[#f8fafc] text-[#0f172a]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
