import React from "react";
import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-7xl mx-auto auto-rows-[16rem]",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  children,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "row-span-1 rounded-2xl group/bento hover:shadow-2xl transition duration-300 shadow-input dark:shadow-none p-5 bg-white border border-slate-200/90 justify-between flex flex-col space-y-4 relative overflow-hidden",
        className
      )}
    >
      {header && <div className="w-full flex-1 min-h-[5rem] overflow-hidden">{header}</div>}
      {children && <div className="w-full">{children}</div>}
      {(title || description || icon) && (
        <div className="group-hover/bento:translate-x-1 transition duration-200 z-10">
          <div className="flex items-center gap-2 mb-1">
            {icon && <div className="text-slate-700">{icon}</div>}
            {title && (
              <div className="font-display font-semibold text-slate-900 text-sm tracking-tight">
                {title}
              </div>
            )}
          </div>
          {description && (
            <div className="font-sans text-xs text-slate-500 leading-relaxed">
              {description}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
