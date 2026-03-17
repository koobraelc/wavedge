interface LoadingProps {
  className?: string;
  lines?: number;
}

export function Loading({ className = "", lines = 3 }: LoadingProps) {
  return (
    <div className={`space-y-3 animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-sm)]"
          style={{
            background: "var(--bg-tertiary)",
            height: i === 0 ? "1.5rem" : "1rem",
            width: i === 0 ? "60%" : i === lines - 1 ? "40%" : "80%",
          }}
        />
      ))}
    </div>
  );
}

export function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className="w-6 h-6 border-2 rounded-full animate-spin"
        style={{
          borderColor: "var(--border)",
          borderTopColor: "var(--accent)",
        }}
      />
    </div>
  );
}
