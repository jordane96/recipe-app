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
    // Persist immediately so a refresh during the brief delay below doesn't lose state.
    setSessionUser(username);

    // iOS keyboard dismiss is async (~250-350ms). If we swap React trees while
    // the keyboard is still hiding, the new screen mounts with the visual
    // viewport partially shifted (vvOff > 0) — content appears cut off until
    // the user manually scrolls. Blur the input, wait for the keyboard to
    // fully hide (visualViewport.height returns to its pre-keyboard size),
    // then commit the user-state change.
    const commit = () => setUser(username);

    if (typeof document === "undefined" || typeof window === "undefined") {
      commit();
      return;
    }

    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }

    const vv = window.visualViewport;
    if (!vv) {
      // No visualViewport API → desktop or older browser, no keyboard concern.
      commit();
      return;
    }

    const startH = vv.height;
    const layoutH = window.innerHeight;
    // If the visual viewport is already at full layout height, no keyboard is up.
    if (Math.abs(startH - layoutH) < 4) {
      commit();
      return;
    }

    let committed = false;
    const fireOnce = () => {
      if (committed) return;
      committed = true;
      vv.removeEventListener("resize", onResize);
      window.clearTimeout(fallback);
      // One frame after viewport settles, swap trees + reset scroll.
      window.requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        commit();
      });
    };
    const onResize = () => {
      if (Math.abs(vv.height - layoutH) < 4) {
        fireOnce();
      }
    };
    vv.addEventListener("resize", onResize);
    // Fallback: if resize never fires (no actual keyboard), commit anyway.
    const fallback = window.setTimeout(fireOnce, 500);
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
