import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught render error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "2rem",
          maxWidth: "800px",
          margin: "2rem auto",
          fontFamily: "system-ui, sans-serif",
        }}>
          <h1 style={{ color: "#dc2626", fontSize: "1.5rem", marginBottom: "1rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#374151", marginBottom: "1rem" }}>
            The app crashed. Check the browser console for details.
          </p>
          <pre style={{
            background: "#f3f4f6",
            padding: "1rem",
            borderRadius: "0.5rem",
            overflow: "auto",
            fontSize: "0.875rem",
            color: "#dc2626",
            marginBottom: "1rem",
          }}>
            {this.state.error?.message}
            {this.state.error?.stack && `\n\n${this.state.error.stack}`}
          </pre>
          {this.state.errorInfo?.componentStack && (
            <details style={{ marginBottom: "1rem" }}>
              <summary style={{ cursor: "pointer", color: "#6b7280" }}>
                Component Stack
              </summary>
              <pre style={{
                background: "#f3f4f6",
                padding: "1rem",
                borderRadius: "0.5rem",
                overflow: "auto",
                fontSize: "0.75rem",
                color: "#374151",
                marginTop: "0.5rem",
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
