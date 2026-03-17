import { type HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ glass, className = "", style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-[var(--radius)] p-[var(--card-padding)] ${className}`}
        style={{
          background: glass ? "var(--glass-bg)" : "var(--bg-secondary)",
          border: glass ? "var(--glass-border)" : "1px solid var(--border)",
          backdropFilter: glass ? "var(--glass-blur)" : undefined,
          WebkitBackdropFilter: glass ? "var(--glass-blur)" : undefined,
          ...style,
        }}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";
