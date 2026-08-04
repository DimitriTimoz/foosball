import type { Metadata } from "next";
import { headers } from "next/headers";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import { BuroBallApp } from "./buroball-app";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "https://buroball.openai.site";
  return {
    title: "BuroBall — Le classement babyfoot du bureau",
    description: "Scores, classement Elo et équipes équilibrées pour le babyfoot entre collègues.",
    openGraph: {
      title: "BuroBall",
      description: "Le babyfoot du bureau, enfin classé.",
      images: [new URL("/og.png", origin).toString()],
    },
    twitter: { card: "summary_large_image", images: [new URL("/og.png", origin).toString()] },
  };
}

export default async function Home() {
  const user = await getChatGPTUser();
  const isLocalPreview = process.env.NODE_ENV !== "production";

  if (!user && !isLocalPreview) {
    return (
      <main className="signin-shell">
        <section className="signin-card">
          <div className="brand brand-large"><span className="brand-ball">●</span> BuroBall</div>
          <div className="signin-score" aria-label="score 10 à 7">
            <span className="score-blue">10</span><span className="score-dash">—</span><span className="score-red">7</span>
          </div>
          <p className="eyebrow">BABYFOOT · BUREAU · ELO</p>
          <h1>Chaque pause mérite<br />son classement.</h1>
          <p className="signin-copy">Connectez-vous pour enregistrer les matchs, suivre votre Elo et composer des équipes équilibrées.</p>
          <a className="primary-button signin-button" href={chatGPTSignInPath("/")}>Se connecter en toute sécurité <span>→</span></a>
          <p className="signin-note">Votre connexion et votre mot de passe sont protégés par la plateforme.</p>
        </section>
        <aside className="signin-aside" aria-hidden="true">
          <div className="table-line table-line-one" />
          <div className="table-line table-line-two" />
          <div className="foos-player blue-player">●</div>
          <div className="foos-player red-player">●</div>
          <p>PRÊT·E À JOUER ?</p>
        </aside>
      </main>
    );
  }

  return <BuroBallApp />;
}
