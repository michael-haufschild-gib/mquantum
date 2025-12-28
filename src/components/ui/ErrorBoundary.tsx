import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 *
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-app)] p-4 text-[var(--text-primary)]">
          <div className="w-full max-w-md rounded-lg border border-danger-border bg-danger-bg p-6 backdrop-blur-md">
            <h2 className="mb-4 text-xl font-bold text-danger">Something went wrong</h2>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              An error occurred while rendering the application.
            </p>
            {this.state.error && (
              <pre className="mb-4 max-h-40 overflow-auto rounded bg-[var(--bg-overlay)] p-2 text-xs text-danger">
                {this.state.error.message}
              </pre>
            )}
            <button
              className="rounded bg-danger-solid px-4 py-2 text-sm font-semibold text-text-inverse hover:brightness-110 transition-colors"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
