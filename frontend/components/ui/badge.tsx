import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide transition-all duration-200",
  {
    variants: {
      variant: {
        default:
          "badge-clean-slate",
        secondary:
          "bg-slate-100 text-slate-700 border border-slate-200",
        destructive:
          "badge-clean-rose",
        outline:
          "border border-slate-200 text-slate-700 bg-white",
        success:
          "badge-clean-emerald",
        warning:
          "badge-clean-amber",
        info:
          "badge-clean-blue",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
