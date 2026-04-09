import * as React from "react";

type State = { hasError: boolean; message: string };

export class ErrorBoundary extends React.Component<
  { children?: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Something went wrong." };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="app-shell">
          <p className="err">{this.state.message}</p>
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Try a hard refresh (Ctrl+Shift+R). If this persists, open the browser console (F12) and
            share any red errors.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
