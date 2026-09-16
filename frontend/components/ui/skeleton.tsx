import { cn } from "@/lib/utils";
import React from "react";

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("rounded-xl bg-secondary/60 shimmer", className)} style={style} />
  );
}

export function CardSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-border/20">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${60 + (i % 3) * 15}%`, flex: 1 }} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="w-full bg-secondary/30 rounded-xl shimmer" style={{ height }} />
  );
}
