import "./index.css";
import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuthScreen } from "./AuthScreen";
import { getSessionUser, setSessionUser } from "./userSession";

function Root() {
  const [user, setUser] = React.useState<string | null>(() => getSessionUser());

  const handleAuth = (username: string) => {
    setSessionUser(username);
    setUser(username);
  };

  if (!user) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return <App currentUser={user} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
);
