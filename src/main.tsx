import "./index.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuthScreen } from "./AuthScreen";
import { clearSessionUser, getSessionUser, setSessionUser } from "./userSession";

// Disable browser scroll restoration before React mounts; otherwise mobile
// Safari/Chrome may restore a non-zero scroll position from history before
// our snap-to-top effects can run.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function Root() {
  const [user, setUser] = React.useState<string | null>(() => getSessionUser());

  const handleAuth = (username: string) => {
    // Dismiss the iOS keyboard before swapping to App. If we don't, the
    // keyboard hide animation can leave the page slightly scrolled below
    // the sticky header on the first frame the user sees the new screen.
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
    }
    // Snap to top synchronously now, before React unmounts AuthScreen and
    // shows the App's brief "Loading…" state. Without this, the user sees
    // the loading screen at whatever scroll-Y the keyboard left us at.
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      if (typeof document !== "undefined") {
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
    }
    setSessionUser(username);
    setUser(username);
  };

  const handleSignOut = () => {
    clearSessionUser();
    setUser(null);
  };

  if (!user) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return <App currentUser={user} onSignOut={handleSignOut} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
);
