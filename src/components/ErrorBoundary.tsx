import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module/.test(error.message) ||
    /Loading chunk \d+ failed/.test(error.message) ||
    /dynamically imported module/.test(error.message)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);

    // Stale SW served a cached chunk that no longer exists. Reload to pick up
    // the new bundle — the SW will fetch fresh assets after the reload.
    if (isChunkLoadError(error)) {
      setTimeout(() => window.location.reload(), 100);
    }
  }

  render() {
    if (this.state.hasError) {
      // While waiting for the chunk-error reload, render nothing to avoid flash.
      if (this.state.error && isChunkLoadError(this.state.error)) {
        return null;
      }

      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-4xl">⚠️</span>
          <h2 className="mt-3 text-base font-semibold text-[var(--color-text)]">
            Algo correu mal
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {this.state.error?.message ?? 'Erro inesperado'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-text-inverse)] hover:bg-[var(--color-accent-hover)]"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
