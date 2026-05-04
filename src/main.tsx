import "./index.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuthScreen } from "./AuthScreen";
import { clearSessionUser, getSessionUser, setSessionUser } from "./userSession";

function Root() {
  const [user, setUser] = React.useState<string | null>(() => getSessionUser());

  const handleAuth = (username: string) => {
    // Dismiss the iOS keyboard before swapping to App. If we don't, the
    // keyboard hide animation runs after AppLayout's initial scroll-to-top
    // fires, and iOS leaves the page slightly scrolled below the sticky
    // header on the first frame the user sees the new screen.
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
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
