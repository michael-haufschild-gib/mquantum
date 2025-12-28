/**
 * Canvas Error Boundary
 *
 * Catches rendering errors in the Three.js/WebGL canvas and displays
 * a user-friendly error message with recovery options.
 *
 * This prevents the entire application from crashing when a WebGL
 * context is lost or a shader compilation fails.
 */

import { useMsgBoxStore } from '@/stores/msgBoxStore';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface CanvasErrorBoundaryProps {
  children: ReactNode;
}

interface CanvasErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for catching and handling Canvas/WebGL errors.
 * Displays a user-friendly error message with recovery options when a
 * rendering error occurs in the Three.js/WebGL canvas.
 */
export class CanvasErrorBoundary extends Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  constructor(props: CanvasErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error for debugging
    console.error('Canvas rendering error:', error);
    console.error('Component stack:', errorInfo.componentStack);

    // Show error dialog using the message box store
    useMsgBoxStore.getState().showMsgBox(
      'Rendering Error',
      `A rendering error occurred: ${error.message}\n\nThis may be caused by WebGL context loss or shader compilation failure.`,
      'error',
      [
        {
          label: 'Reload Page',
          onClick: () => window.location.reload(),
          variant: 'danger',
        },
        {
          label: 'Try Again',
          onClick: () => {
            this.setState({ hasError: false, error: null });
            useMsgBoxStore.getState().closeMsgBox();
          },
          variant: 'secondary',
        },
      ]
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render fallback UI while error dialog is shown
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-panel-bg/80 backdrop-blur-sm">
          <div className="text-center p-6">
            <div className="text-4xl mb-4">
              <svg
                className="w-16 h-16 mx-auto text-danger"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Rendering Error
            </h2>
            <p className="text-text-secondary text-sm max-w-md">
              The 3D canvas encountered an error. This may be due to WebGL
              context loss or a shader compilation failure.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
