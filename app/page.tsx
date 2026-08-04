import type { Metadata } from "next";
import { headers } from "next/headers";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import { OfficeFoosApp } from "./buroball-app";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "https://buroball.openai.site";
  return {
    title: "Office Foos — The office foosball leaderboard",
    description: "Scores, Elo rankings, balanced teams, stats, and tournaments for office foosball.",
    openGraph: {
      title: "Office Foos",
      description: "Office foosball, finally ranked.",
      images: [new URL("/og.png", origin).toString()],
    },
    twitter: { card: "summary_large_image", images: [new URL("/og.png", origin).toString()] },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const user = await getChatGPTUser();
  const isLocalPreview = process.env.NODE_ENV !== "production" || process.env.BUROBALL_DEMO_MODE === "true";
  const params = await searchParams;
  const rawInvite = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  const invite = rawInvite && /^[A-Za-z0-9_-]{20,80}$/.test(rawInvite) ? rawInvite : null;
  const returnTo = invite ? `/?invite=${encodeURIComponent(invite)}` : "/";

  if (!user && !isLocalPreview) {
    return (
      <main className="signin-shell">
        <section className="signin-card">
          <div className="brand brand-large"><span className="brand-ball">●</span> Office Foos</div>
          <div className="signin-score" aria-label="score 10 to 7">
            <span className="score-blue">10</span><span className="score-dash">—</span><span className="score-red">7</span>
          </div>
          <p className="eyebrow">FOOSBALL · OFFICE · ELO</p>
          <h1>Every break deserves<br />a leaderboard.</h1>
          <p className="signin-copy">Sign in to record matches, track your Elo, and build balanced teams.</p>
          <a className="primary-button signin-button" href={chatGPTSignInPath(returnTo)}>{invite ? "Accept invitation" : "Sign in securely"} <span>→</span></a>
          <p className="signin-note">Your sign-in and password are protected by the platform.</p>
        </section>
        <aside className="signin-aside" aria-hidden="true">
          <div className="table-line table-line-one" />
          <div className="table-line table-line-two" />
          <div className="foos-player blue-player">●</div>
          <div className="foos-player red-player">●</div>
          <p>READY TO PLAY?</p>
        </aside>
      </main>
    );
  }

  return <OfficeFoosApp />;
}
