import "./index.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuthScreen } from "./AuthScreen";
import { Onboarding, hasSeenOnboarding } from "./Onboarding";
import { clearSessionUser, getSessionUser, setSessionUser } from "./userSession";

// Disable browser scroll restoration before React mounts; otherwise mobile
// Safari/Chrome may restore a non-zero scroll position from history before
// our snap-to-top effects can run.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function Root() {
  const [user, setUser] = React.useState<string | null>(() => getSessionUser());
  // First-run product tour shows BEFORE sign-in. Finishing/skipping marks it seen.
  const [showOnboarding, setShowOnboarding] = React.useState(() => !hasSeenOnboarding());

  const handleAuth = (username: string) => {
    // Persist the session, then full-reload. The in-page React tree swap was
    // leaving iOS Safari in a half-applied keyboard/viewport state where the
    // top of the new page rendered visually cut off. A reload starts iOS from
    // a clean state — slight flash, fully reliable.
    setSessionUser(username);
    if (typeof window !== "undefined") {
      window.location.reload();
    } else {
      setUser(username);
    }
  };

  const handleSignOut = () => {
    clearSessionUser();
    setUser(null);
  };

  if (showOnboarding) {
    return <Onboarding onClose={() => setShowOnboarding(false)} />;
  }

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
