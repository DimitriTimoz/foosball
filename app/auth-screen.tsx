"use client";

import { useEffect, useState } from "react";

export function AuthScreen({ invitationToken, firstAccount }: { invitationToken: string | null; firstAccount: boolean }) {
  const canRegister = Boolean(invitationToken) || firstAccount;
  const [mode, setMode] = useState<"login" | "register">(canRegister ? "register" : "login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const sensitiveKeys = ["password", "confirmPassword", "username", "name"];
    if (!sensitiveKeys.some((key) => url.searchParams.has(key))) return;
    sensitiveKeys.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (mode === "register" && password !== String(form.get("confirmPassword") ?? "")) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password,
          name: form.get("name"),
          invitationToken,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to sign in.");
      window.location.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return <main className="signin-shell">
    <section className="signin-card auth-card">
      <div className="brand brand-large"><span className="brand-ball">●</span> Office Foos</div>
      <div className="signin-score" aria-label="score 10 to 7"><span className="score-blue">10</span><span className="score-dash">—</span><span className="score-red">7</span></div>
      <p className="eyebrow">PRIVATE OFFICE LEAGUE</p>
      <h1>{mode === "register" ? firstAccount ? <>Create the<br />first account.</> : <>Join the<br />league.</> : <>Welcome<br />back.</>}</h1>
      <p className="signin-copy">{mode === "register" ? firstAccount ? "Set up the league owner account. You will then be able to invite your coworkers." : "Choose your username and password to accept this invitation." : "Sign in with your Office Foos username and password."}</p>
      <form className="auth-form" method="post" action={`/api/auth/${mode}`} onSubmit={submit}>
        {invitationToken && <input type="hidden" name="invitationToken" value={invitationToken} />}
        {mode === "register" && <label><span>Display name</span><input name="name" autoComplete="name" minLength={2} maxLength={40} required placeholder="Alex Martin" /></label>}
        <label><span>Username</span><input name="username" autoComplete="username" minLength={3} maxLength={30} required placeholder="alex.martin" autoCapitalize="none" spellCheck={false} /></label>
        <label><span>Password</span><input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={10} maxLength={128} required placeholder="At least 10 characters" /></label>
        {mode === "register" && <label><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required placeholder="Repeat your password" /></label>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button signin-button" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account →" : "Sign in →"}</button>
      </form>
      {canRegister && <button className="auth-switch" type="button" onClick={() => { setMode((current) => current === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Use the invitation to create an account" : "Already have an account? Sign in"}</button>}
      {!canRegister && <p className="signin-note">New accounts require a one-time invitation link.</p>}
    </section>
    <aside className="signin-aside" aria-hidden="true">
      <div className="table-line table-line-one" /><div className="table-line table-line-two" />
      <div className="foos-player blue-player">●</div><div className="foos-player red-player">●</div><p>READY TO PLAY?</p>
    </aside>
  </main>;
}
