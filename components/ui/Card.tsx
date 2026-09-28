import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`card min-w-0 border border-slate-800 bg-surface/80 p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
