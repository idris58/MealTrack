import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { captureError } from "@/lib/error-tracking";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
  description?: string;
  compact?: boolean;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    this.setState({ errorInfo });
    captureError(error, {
      componentStack: errorInfo.componentStack ?? undefined,
      boundary: this.props.title ?? "ErrorBoundary",
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { compact, title, description } = this.props;
      const { error, errorInfo, showDetails } = this.state;

      if (compact) {
        return (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-destructive font-medium text-sm mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span>{title || "Something went wrong in this section"}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {description || error?.message || "An unexpected error occurred while rendering this component."}
            </p>
            <Button size="sm" variant="outline" onClick={this.handleReset} className="gap-1.5 h-8 text-xs">
              <RefreshCw className="h-3 w-3" />
              Try Again
            </Button>
          </div>
        );
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-destructive/20 shadow-lg">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-bold font-heading">
                {title || "Something went wrong"}
              </CardTitle>
              <CardDescription className="text-sm">
                {description || "An unexpected error occurred. Don't worry, your data is safe."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 pt-2">
              {error && (
                <div className="rounded-md border bg-muted/50 p-3 text-xs">
                  <div className="flex items-center justify-between font-mono font-medium text-foreground">
                    <span className="truncate max-w-[280px]">{error.name}: {error.message}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={this.toggleDetails}
                      className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
                    >
                      {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </div>

                  {showDetails && errorInfo && (
                    <div className="mt-2 pt-2 border-t font-mono text-[11px] text-muted-foreground max-h-40 overflow-auto whitespace-pre-wrap">
                      {error.stack}
                      {"\n\nComponent Stack:"}
                      {errorInfo.componentStack}
                    </div>
                  )}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="default"
                onClick={this.handleReset}
                className="w-full sm:flex-1 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={this.handleReload}
                className="w-full sm:flex-1 gap-2"
              >
                Reload Page
              </Button>
              <Button
                variant="ghost"
                onClick={this.handleGoHome}
                size="icon"
                title="Go to Home"
                className="shrink-0 hidden sm:flex"
              >
                <Home className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
