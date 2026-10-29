import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled page exception:', error, errorInfo);
  }

  private handleGoBack = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.hash = 'overview';
    }
  };

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[500px] flex items-center justify-center p-8">
          <div className="glass-card max-w-xl w-full p-8 border border-rose-200/80 dark:border-rose-900/60 shadow-diffuse rounded-3xl text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 shadow-sm">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                {this.props.fallbackTitle || 'Component Rendering Safeguard Triggered'}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
                An isolated client-side rendering exception was caught to protect sovereign session state. You can safely return to the Clinical Workstation.
              </p>
              {this.state.error?.message && (
                <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl text-[11px] font-mono text-rose-600 dark:text-rose-400 overflow-x-auto text-left">
                  {this.state.error.message}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleGoBack}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-clinical-blue text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Clinical Overview</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
