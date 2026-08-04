import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAccountCount, initializeDatabase } from "@/db/foosball";
import { getSession } from "./api/_session";
import { AuthScreen } from "./auth-screen";
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
  const params = await searchParams;
  const rawInvite = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  const invite = rawInvite && /^[A-Za-z0-9_-]{20,80}$/.test(rawInvite) ? rawInvite : null;
  await initializeDatabase();
  const user = await getSession();
  if (!user) return <AuthScreen invitationToken={invite} firstAccount={(await getAccountCount()) === 0} />;

  return <OfficeFoosApp />;
}
