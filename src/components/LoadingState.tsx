interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'A carregar…' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-bg-tertiary)] border-t-[var(--color-accent)]" />
      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{message}</p>
    </div>
  );
}
