import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { ERA_LOGO_SRC } from '../lib/utils';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('EraApp ErrorBoundary caught:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let displayMsg = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed?.error) {
          displayMsg = parsed.error;
        }
      } catch {
        // plain string message
      }

      return (
        <div className="h-[100dvh] w-full bg-black text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <img
            src={ERA_LOGO_SRC}
            alt="ERA"
            className="h-14 w-auto object-contain mb-6"
          />
          <h1 className="text-lg font-semibold tracking-tight mb-2">
            Something interrupted EraApp
          </h1>
          <p className="text-sm text-zinc-400 max-w-sm mb-6 leading-relaxed">
            {displayMsg}
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-2.5 rounded-xl bg-[#A4133C] hover:bg-[#8E1033] text-white text-sm font-medium transition-colors cursor-pointer"
          >
            Reload EraApp
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
