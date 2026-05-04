import * as React from "react";
import { setSessionUser } from "./userSession";

type Mode = "signin" | "signup";
type SignupStep = "username" | "password";

export function AuthScreen({ onAuth }: { onAuth: (username: string) => void }) {
  const [mode, setMode] = React.useState<Mode>("signin");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [signupStep, setSignupStep] = React.useState<SignupStep>("username");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setUsername("");
    setPassword("");
    setConfirm("");
    setSignupStep("username");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter a username and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Something went wrong."); return; }
      setSessionUser(body.username);
      onAuth(body.username);
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError("Please enter a username."); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/check-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Something went wrong."); return; }
      if (body.taken) { setError("That username is already taken."); return; }
      setSignupStep("password");
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) { setError("Please enter a password."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Something went wrong."); return; }
      setSessionUser(body.username);
      onAuth(body.username);
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">Meal planner</h1>
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${mode === "signin" ? " auth-tab--active" : ""}`}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab${mode === "signup" ? " auth-tab--active" : ""}`}
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        {mode === "signin" && (
          <form className="auth-form" onSubmit={handleSignIn}>
            <label className="auth-label">
              Username
              <input
                className="auth-input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </label>
            <label className="auth-label">
              Password
              <input
                className="auth-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "…" : "Sign in"}
            </button>
          </form>
        )}

        {mode === "signup" && signupStep === "username" && (
          <form className="auth-form" onSubmit={handleUsernameNext}>
            <label className="auth-label">
              Choose a username
              <input
                className="auth-input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Checking…" : "Next"}
            </button>
          </form>
        )}

        {mode === "signup" && signupStep === "password" && (
          <form className="auth-form" onSubmit={handleSignUp}>
            <p className="auth-username-confirm">Creating account for <strong>{username}</strong></p>
            <label className="auth-label">
              Password
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </label>
            <label className="auth-label">
              Confirm password
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={loading}
              />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create account"}
            </button>
            <button
              type="button"
              className="auth-back"
              onClick={() => { setSignupStep("username"); setError(null); setPassword(""); setConfirm(""); }}
              disabled={loading}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
