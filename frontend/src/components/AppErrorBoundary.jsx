import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

export class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Application rendering error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6" data-testid="application-error-boundary">
      <section className="w-full border border-rose-200 bg-rose-50 p-6 text-rose-950">
        <AlertCircle className="mb-3 h-6 w-6" />
        <h1 className="text-xl font-semibold" data-testid="application-error-boundary-title">Unable to load this page</h1>
        <p className="mt-2 text-sm" data-testid="application-error-boundary-message">Please refresh the page and try again. If the problem continues, contact your administrator.</p>
        <Button type="button" className="mt-5" onClick={() => window.location.reload()} data-testid="application-error-boundary-retry-button"><RefreshCw className="h-4 w-4" />Refresh page</Button>
      </section>
    </main>;
  }
}