import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

export const LoadErrorState = ({ title, message, onRetry, testId }) => (
  <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-950" data-testid={testId}>
    <AlertCircle className="h-4 w-4" />
    <AlertTitle data-testid={`${testId}-title`}>{title}</AlertTitle>
    <AlertDescription className="mt-2 flex flex-wrap items-center justify-between gap-3" data-testid={`${testId}-message`}>
      <span>{message}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid={`${testId}-retry-button`}>
        <RefreshCw className="h-3.5 w-3.5" />Retry
      </Button>
    </AlertDescription>
  </Alert>
);