export function ScreenSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-7 w-40 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)]" />
      <div className="h-4 w-64 rounded bg-[var(--color-bg-tertiary)]" />
      <div className="mt-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-[var(--radius-lg)] bg-[var(--color-bg-tertiary)]"
          />
        ))}
      </div>
    </div>
  );
}
