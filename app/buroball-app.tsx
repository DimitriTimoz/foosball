"use client";

import { useCallback, useEffect, useState } from "react";

type Player = {
  id: string;
  email: string | null;
  name: string;
  elo: number;
  attack_elo: number;
  defense_elo: number;
  wins: number;
  losses: number;
  games: number;
};

type Member = { id: string; name: string; position: "attaquant" | "defenseur" };
type Match = {
  id: string;
  red_score: number;
  blue_score: number;
  elo_delta: number;
  created_at: number;
  red: Member[];
  blue: Member[];
};
type SessionUser = { displayName: string; email: string; isDemo: boolean };
type LeagueStats = {
  total_matches: number;
  total_goals: number;
  avg_goals: number;
  avg_margin: number;
  red_wins: number;
  blue_wins: number;
  close_matches: number;
};
type Dashboard = { players: Player[]; matches: Match[]; leagueStats: LeagueStats; user: SessionUser };
type DraftMember = { id: string; position: "attaquant" | "defenseur" };
type Draw = { red: DraftMember[]; blue: DraftMember[]; gap: number };

const emptyDraft = { red: [] as DraftMember[], blue: [] as DraftMember[], redScore: 10, blueScore: 7 };

export function BuroBallApp() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [access, setAccess] = useState<"loading" | "joining" | "required" | "allowed">("loading");
  const [inviteError, setInviteError] = useState("");
  const [view, setView] = useState<"accueil" | "classement" | "historique" | "stats" | "equipes">("accueil");
  const [matchOpen, setMatchOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFormat, setHistoryFormat] = useState<"tous" | "1v1" | "2v1" | "2v2">("tous");
  const [draft, setDraft] = useState(emptyDraft);
  const [drawIds, setDrawIds] = useState<string[]>([]);
  const [draw, setDraw] = useState<Draw | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    let response = await fetch("/api/bootstrap", { cache: "no-store" });
    let payload = (await response.json()) as Dashboard & { error?: string; code?: string };
    if (response.status === 403 && payload.code === "invite_required") {
      const token = new URLSearchParams(window.location.search).get("invite");
      if (!token) {
        setAccess("required");
        return;
      }
      setAccess("joining");
      const redeemResponse = await fetch("/api/invitations/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const redeemPayload = await redeemResponse.json() as { error?: string };
      if (!redeemResponse.ok) {
        setInviteError(redeemPayload.error ?? "Cette invitation ne peut pas être utilisée.");
        setAccess("required");
        return;
      }
      window.history.replaceState({}, "", "/");
      response = await fetch("/api/bootstrap", { cache: "no-store" });
      payload = (await response.json()) as Dashboard & { error?: string; code?: string };
    }
    if (!response.ok) throw new Error(payload.error ?? "Impossible de charger BuroBall.");
    setData(payload);
    setAccess("allowed");
  }, []);

  useEffect(() => { load().catch((error) => { setToast(error.message); setAccess("required"); }); }, [load]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setMatchOpen(false); setPlayerOpen(false); setInviteOpen(false); setSelectedPlayer(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const currentPlayer = data?.players.find((player) => player.email === data.user.email);
  const firstName = (data?.user.displayName ?? "").split(" ")[0];

  async function submitMatch(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.red.length || !draft.blue.length) return setToast("Ajoutez au moins un joueur de chaque côté.");
    setBusy(true);
    try {
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json() as { error?: string; match?: { delta: number } };
      if (!response.ok) throw new Error(payload.error ?? "Le match n’a pas été enregistré.");
      setMatchOpen(false);
      setDraft(emptyDraft);
      setToast(`Match enregistré · ${payload.match?.delta ?? 0} points Elo en jeu`);
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally { setBusy(false); }
  }

  async function submitPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), preferredPosition: "polyvalent" }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Impossible d’ajouter ce joueur.");
      setPlayerOpen(false);
      setToast("Joueur ajouté à la ligue");
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally { setBusy(false); }
  }

  async function createInvite() {
    setBusy(true);
    try {
      const response = await fetch("/api/invitations", { method: "POST" });
      const payload = await response.json() as { token?: string; error?: string };
      if (!response.ok || !payload.token) throw new Error(payload.error ?? "Impossible de créer l’invitation.");
      setInviteLink(`${window.location.origin}/?invite=${payload.token}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally { setBusy(false); }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setToast("Lien d’invitation copié");
  }

  function toggleMember(side: "red" | "blue", player: Player) {
    const other = side === "red" ? "blue" : "red";
    if (draft[other].some((member) => member.id === player.id)) return setToast("Ce joueur est déjà dans l’autre équipe.");
    setDraft((current) => {
      const selected = current[side].some((member) => member.id === player.id);
      if (!selected && current[side].length >= 2) { setToast("Deux joueurs maximum par côté."); return current; }
      const next = selected
        ? current[side].filter((member) => member.id !== player.id)
        : [...current[side], { id: player.id, position: player.defense_elo > player.attack_elo ? "defenseur" as const : "attaquant" as const }];
      return { ...current, [side]: next };
    });
  }

  function assignPositions(ids: string[]): DraftMember[] {
    const members = ids.map((id) => data!.players.find((player) => player.id === id)!);
    if (members.length === 1) {
      return [{ id: members[0].id, position: members[0].defense_elo > members[0].attack_elo ? "defenseur" : "attaquant" }];
    }
    const [first, second] = members;
    const firstDefends = first.defense_elo + second.attack_elo >= first.attack_elo + second.defense_elo;
    return [
      { id: first.id, position: firstDefends ? "defenseur" : "attaquant" },
      { id: second.id, position: firstDefends ? "attaquant" : "defenseur" },
    ];
  }

  function generateTeams() {
    if (!data || drawIds.length < 2 || drawIds.length > 4) return setToast("Sélectionnez entre 2 et 4 joueurs.");
    const uniquePartitions: Array<[string[], string[]]> = [];
    if (drawIds.length === 2) uniquePartitions.push([[drawIds[0]], [drawIds[1]]]);
    if (drawIds.length === 3) {
      drawIds.forEach((solo) => uniquePartitions.push([drawIds.filter((id) => id !== solo), [solo]]));
    }
    if (drawIds.length === 4) {
      for (let i = 1; i < drawIds.length; i++) {
        uniquePartitions.push([[drawIds[0], drawIds[i]], drawIds.filter((id) => id !== drawIds[0] && id !== drawIds[i])]);
      }
    }
    const rated = uniquePartitions.map(([redIds, blueIds]) => {
      const red = assignPositions(redIds);
      const blue = assignPositions(blueIds);
      const teamRating = (members: DraftMember[]) => members.reduce((sum, member) => {
        const player = data.players.find((item) => item.id === member.id)!;
        return sum + positionalElo(player, member.position);
      }, 0) / members.length;
      const gap = Math.round(Math.abs(teamRating(red) - teamRating(blue)));
      return { red, blue, gap, randomScore: gap + Math.random() * 38 };
    }).sort((a, b) => a.randomScore - b.randomScore);
    const choice = rated[Math.floor(Math.random() * Math.min(2, rated.length))];
    if (Math.random() > .5) setDraw({ red: choice.blue, blue: choice.red, gap: choice.gap });
    else setDraw({ red: choice.red, blue: choice.blue, gap: choice.gap });
  }

  function useDraw() {
    if (!draw) return;
    setDraft({ ...emptyDraft, red: draw.red, blue: draw.blue });
    setMatchOpen(true);
  }

  function replayMatch(match: Match) {
    setDraft({
      red: match.red.map((member) => ({ id: member.id, position: member.position })),
      blue: match.blue.map((member) => ({ id: member.id, position: member.position })),
      redScore: 10,
      blueScore: 7,
    });
    setMatchOpen(true);
  }

  if (!data && access === "required") {
    return <InvitationRequired error={inviteError} />;
  }

  if (!data) {
    return <main className="loading-screen"><div className="loading-brand"><span>●</span> BuroBall</div><div className="loading-bar"><i /></div><p>{access === "joining" ? "Invitation acceptée, bienvenue dans la ligue…" : "On prépare la table…"}</p></main>;
  }

  const navItems = [
    ["accueil", "⌂", "Accueil"],
    ["classement", "↗", "Classement"],
    ["historique", "◷", "Historique"],
    ["stats", "▥", "Stats"],
    ["equipes", "⚖", "Équipes"],
  ] as const;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("accueil")}><span className="brand-ball">●</span> BuroBall</button>
        <nav className="desktop-nav" aria-label="Navigation principale">
          {navItems.map(([id, , label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
        </nav>
        <div className="top-actions">
          <button className="invite-button" onClick={() => setInviteOpen(true)}><span>↗</span> Inviter</button>
          <button className="icon-button" aria-label="Ajouter un joueur" title="Ajouter un joueur" onClick={() => setPlayerOpen(true)}>＋</button>
          <button className="primary-button compact" onClick={() => setMatchOpen(true)}>＋ <span>Nouveau match</span></button>
          <div className="avatar" title={data.user.displayName}>{initials(data.user.displayName)}</div>
        </div>
      </header>

      <main className="main-content">
        {view === "accueil" && (
          <>
            <section className="hero-grid">
              <div className="welcome-card">
                <p className="eyebrow">TABLEAU DE BORD</p>
                <h1>Salut {firstName},<br /><span>à toi de jouer.</span></h1>
                <p>Un score, quelques secondes, et le classement est à jour.</p>
                <button className="primary-button hero-button" onClick={() => setMatchOpen(true)}>Enregistrer un match <span>→</span></button>
                <div className="ball-decoration" aria-hidden="true">●</div>
              </div>
              <div className="stat-card dark-card">
                <div className="stat-top"><span>MON ELO · {currentPlayer ? playerProfile(currentPlayer).toUpperCase() : "POLYVALENT"}</span><span className="live-dot">● LIVE</span></div>
                <strong>{currentPlayer?.elo ?? 1000}</strong>
                <div className="elo-scale"><i style={{ width: `${Math.min(100, Math.max(12, ((currentPlayer?.elo ?? 1000) - 800) / 6))}%` }} /></div>
                <div className="role-elos"><span><i>A</i><b>{currentPlayer?.attack_elo ?? 1000}</b></span><span><i>D</i><b>{currentPlayer?.defense_elo ?? 1000}</b></span></div>
                <div className="stat-bottom"><span>{currentPlayer?.wins ?? 0} victoires</span><span>{currentPlayer?.games ?? 0} matchs</span></div>
              </div>
              <div className="rank-card">
                <p>MON CLASSEMENT</p>
                <strong>#{Math.max(1, data.players.findIndex((p) => p.id === currentPlayer?.id) + 1)}</strong>
                <span>sur {data.players.length} joueurs</span>
                <button onClick={() => setView("classement")}>Voir le classement →</button>
              </div>
            </section>

            <section className="content-grid">
              <div className="panel recent-panel">
                <div className="section-heading"><div><p className="eyebrow">ACTIVITÉ</p><h2>Derniers matchs</h2></div><button onClick={() => setMatchOpen(true)}>Ajouter ＋</button></div>
                <div className="match-list">
                  {data.matches.length ? data.matches.slice(0, 6).map((match) => <MatchRow key={match.id} match={match} onReplay={replayMatch} />) : <EmptyState text="Aucun match pour le moment." action="Enregistrer le premier" onClick={() => setMatchOpen(true)} />}
                </div>
              </div>
              <div className="panel podium-panel">
                <div className="section-heading"><div><p className="eyebrow">TOP JOUEURS</p><h2>Le podium</h2></div><button onClick={() => setView("classement")}>Tout voir</button></div>
                <div className="podium-list">
                  {data.players.slice(0, 3).map((player, index) => (
                    <button className="podium-row" key={player.id} onClick={() => setSelectedPlayer(player)}>
                      <span className={`rank-number rank-${index + 1}`}>{index + 1}</span>
                      <div className="player-avatar">{initials(player.name)}</div>
                      <div><strong>{player.name}</strong><small>{playerProfile(player)} · A {player.attack_elo} · D {player.defense_elo}</small></div>
                      <b>{player.elo}</b>
                    </button>
                  ))}
                </div>
                <button className="secondary-button full" onClick={() => setView("equipes")}>⚖ Composer des équipes équilibrées</button>
              </div>
            </section>
          </>
        )}

        {view === "classement" && (
          <section className="page-section">
            <div className="page-title"><div><p className="eyebrow">LA LIGUE</p><h1>Classement Elo</h1><p>Un niveau général, plus un indice pour chaque poste réellement joué.</p></div><button className="secondary-button" onClick={() => setPlayerOpen(true)}>＋ Ajouter un joueur</button></div>
            <div className="leaderboard panel">
              <div className="table-head"><span>RANG</span><span>JOUEUR</span><span>ELO PAR POSTE</span><span>V / D</span><span>GÉNÉRAL</span></div>
              {data.players.map((player, index) => (
                <button className="leader-row" key={player.id} onClick={() => setSelectedPlayer(player)}>
                  <span className="leader-rank">{String(index + 1).padStart(2, "0")}</span>
                  <div className="leader-player"><div className="player-avatar">{initials(player.name)}</div><div><strong>{player.name}</strong><small>{player.email === data.user.email ? "Vous · " : ""}{playerProfile(player)}</small></div></div>
                  <span className="position-ratings"><b className="attack-rating">A {player.attack_elo}</b><b className="defense-rating">D {player.defense_elo}</b></span>
                  <span className="record"><b>{player.wins}</b> / {player.losses}</span>
                  <strong className="elo-number">{player.elo}</strong>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "historique" && <HistoryView matches={data.matches} query={historyQuery} format={historyFormat} setQuery={setHistoryQuery} setFormat={setHistoryFormat} onReplay={replayMatch} onNew={() => setMatchOpen(true)} />}

        {view === "stats" && <StatsView players={data.players} matches={data.matches} stats={data.leagueStats} onPlayer={setSelectedPlayer} />}

        {view === "equipes" && (
          <section className="page-section team-builder-page">
            <div className="page-title"><div><p className="eyebrow">TIRAGE ÉQUILIBRÉ</p><h1>Qui joue ?</h1><p>Choisissez 2 à 4 collègues. BuroBall utilise l’Elo de chaque poste pour équilibrer.</p></div></div>
            <div className="builder-layout">
              <div className="panel selection-panel">
                <div className="selection-title"><h2>Sélection</h2><span>{drawIds.length}/4</span></div>
                <div className="player-select-grid">
                  {data.players.map((player) => {
                    const selected = drawIds.includes(player.id);
                    return <button key={player.id} className={`select-player ${selected ? "selected" : ""}`} onClick={() => setDrawIds((ids) => selected ? ids.filter((id) => id !== player.id) : ids.length < 4 ? [...ids, player.id] : ids)}>
                      <span className="check-box">{selected ? "✓" : ""}</span><span className="player-avatar">{initials(player.name)}</span><span><strong>{player.name}</strong><small>{playerProfile(player)}</small></span><b>{player.elo}</b>
                    </button>;
                  })}
                </div>
                <button className="primary-button full generate-button" disabled={drawIds.length < 2} onClick={generateTeams}>Mélanger et équilibrer <span>↻</span></button>
              </div>
              <div className={`draw-area ${draw ? "has-draw" : ""}`}>
                {draw ? <DrawResult draw={draw} players={data.players} onAgain={generateTeams} onUse={useDraw} /> : <div className="draw-placeholder"><div>⚖</div><h2>Les équipes apparaîtront ici</h2><p>On tient compte de l’Elo et des préférences de poste, avec juste assez de hasard.</p></div>}
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        {navItems.map(([id, icon, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><span>{icon}</span>{label}</button>)}
        <button className="mobile-add" onClick={() => setMatchOpen(true)}><span>＋</span>Match</button>
      </nav>

      {matchOpen && <MatchModal players={data.players} draft={draft} setDraft={setDraft} toggleMember={toggleMember} onClose={() => setMatchOpen(false)} onSubmit={submitMatch} busy={busy} />}
      {playerOpen && <PlayerModal onClose={() => setPlayerOpen(false)} onSubmit={submitPlayer} busy={busy} />}
      {inviteOpen && <InviteModal link={inviteLink} busy={busy} onCreate={createInvite} onCopy={copyInvite} onClose={() => setInviteOpen(false)} />}
      {selectedPlayer && <PlayerProfileModal player={selectedPlayer} rank={data.players.findIndex((item) => item.id === selectedPlayer.id) + 1} matches={data.matches} onReplay={replayMatch} onClose={() => setSelectedPlayer(null)} />}
      {toast && <div className="toast" role="status"><span>●</span>{toast}</div>}
    </div>
  );
}

function StatsView({ players, matches, stats, onPlayer }: { players: Player[]; matches: Match[]; stats: LeagueStats; onPlayer: (player: Player) => void }) {
  const [firstId, setFirstId] = useState(players[0]?.id ?? "");
  const [secondId, setSecondId] = useState(players[1]?.id ?? players[0]?.id ?? "");
  const recentLabel = matches.length >= 50 ? "50 derniers matchs" : `${matches.length} match${matches.length > 1 ? "s" : ""} chargé${matches.length > 1 ? "s" : ""}`;
  const redRate = stats.total_matches ? Math.round(stats.red_wins / stats.total_matches * 100) : 50;
  const blueRate = stats.total_matches ? 100 - redRate : 50;
  const formats = (["1v1", "2v1", "2v2"] as const).map((format) => ({ format, count: matches.filter((match) => formatOf(match) === format).length }));
  const maxFormat = Math.max(1, ...formats.map((item) => item.count));
  const active = [...players].sort((a, b) => b.games - a.games)[0];
  const qualified = players.filter((player) => player.games >= 3);
  const efficient = [...qualified].sort((a, b) => (b.wins / b.games) - (a.wins / a.games))[0] ?? active;
  const attacker = [...players].sort((a, b) => b.attack_elo - a.attack_elo)[0];
  const defender = [...players].sort((a, b) => b.defense_elo - a.defense_elo)[0];
  const first = players.find((player) => player.id === firstId);
  const second = players.find((player) => player.id === secondId);
  const duels = first && second && first.id !== second.id ? matches.filter((match) => {
    const firstSide = match.red.some((member) => member.id === first.id) ? "red" : match.blue.some((member) => member.id === first.id) ? "blue" : null;
    const secondSide = match.red.some((member) => member.id === second.id) ? "red" : match.blue.some((member) => member.id === second.id) ? "blue" : null;
    return firstSide && secondSide && firstSide !== secondSide;
  }) : [];
  const winsFor = (player: Player | undefined) => player ? duels.filter((match) => {
    const side = match.red.some((member) => member.id === player.id) ? "red" : "blue";
    return side === "red" ? match.red_score > match.blue_score : match.blue_score > match.red_score;
  }).length : 0;
  const firstWins = winsFor(first);
  const secondWins = winsFor(second);
  const records = [
    { icon: "◷", label: "Le plus actif", player: active, value: active ? `${active.games} matchs` : "—" },
    { icon: "%", label: "Meilleur taux", player: efficient, value: efficient?.games ? `${Math.round(efficient.wins / efficient.games * 100)}% victoires` : "—" },
    { icon: "A", label: "Meilleure attaque", player: attacker, value: attacker ? `${attacker.attack_elo} Elo` : "—" },
    { icon: "D", label: "Meilleure défense", player: defender, value: defender ? `${defender.defense_elo} Elo` : "—" },
  ];

  return <section className="page-section stats-page">
    <div className="page-title"><div><p className="eyebrow">LA LIGUE EN CHIFFRES</p><h1>Statistiques</h1><p>Les tendances qui racontent vraiment les matchs du bureau.</p></div></div>
    <div className="stats-kpis">
      <div><span>MATCHS JOUÉS</span><strong>{stats.total_matches}</strong><small>depuis le début</small></div>
      <div><span>BUTS MARQUÉS</span><strong>{stats.total_goals}</strong><small>toutes équipes</small></div>
      <div><span>BUTS / MATCH</span><strong>{stats.avg_goals}</strong><small>en moyenne</small></div>
      <div><span>MATCHS SERRÉS</span><strong>{stats.close_matches}</strong><small>écart de 2 ou moins</small></div>
    </div>

    <div className="stats-grid">
      <article className="panel stats-panel side-panel">
        <div className="stats-panel-header"><div><p className="eyebrow">ROUGE OU BLEU ?</p><h2>Avantage du côté</h2></div><span>{stats.total_matches} matchs</span></div>
        <div className="side-score"><strong className="red-text">{redRate}%</strong><span>des victoires</span><strong className="blue-text">{blueRate}%</strong></div>
        <div className="balance-track" aria-label={`${redRate}% de victoires rouges et ${blueRate}% de victoires bleues`}><i className="red-balance" style={{ width: `${redRate}%` }} /><i className="blue-balance" style={{ width: `${blueRate}%` }} /></div>
        <div className="side-legend"><span><i className="red-dot" />Rouge <b>{stats.red_wins}</b></span><span><i className="blue-dot" />Bleu <b>{stats.blue_wins}</b></span></div>
        <p className="stats-note">Écart moyen au score · <b>{stats.avg_margin} buts</b></p>
      </article>

      <article className="panel stats-panel">
        <div className="stats-panel-header"><div><p className="eyebrow">FORMATS</p><h2>Comment on joue</h2></div><span>{recentLabel}</span></div>
        <div className="format-bars">{formats.map((item) => <div className="format-row" key={item.format}><span>{item.format}</span><div><i style={{ width: `${item.count / maxFormat * 100}%` }} /></div><b>{item.count}</b></div>)}</div>
        <p className="stats-note">Répartition calculée sur l’historique récent chargé.</p>
      </article>
    </div>

    <div className="records-heading"><div><p className="eyebrow">LES RECORDS</p><h2>Qui mène la danse ?</h2></div><span>Minimum 3 matchs pour le taux de victoire</span></div>
    <div className="record-grid">{records.map((record) => <button key={record.label} className="record-card" disabled={!record.player} onClick={() => record.player && onPlayer(record.player)}><span className="record-icon">{record.icon}</span><small>{record.label}</small><strong>{record.player?.name ?? "Pas encore"}</strong><b>{record.value}</b><i>Voir le profil →</i></button>)}</div>

    <article className="panel stats-panel h2h-panel">
      <div className="stats-panel-header"><div><p className="eyebrow">FACE-À-FACE</p><h2>Le duel du bureau</h2></div><span>sur l’historique chargé</span></div>
      <div className="h2h-selectors">
        <label><span>Joueur 1</span><select value={firstId} onChange={(event) => setFirstId(event.target.value)}>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <b>VS</b>
        <label><span>Joueur 2</span><select value={secondId} onChange={(event) => setSecondId(event.target.value)}>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      </div>
      {first?.id === second?.id ? <div className="h2h-empty">Choisissez deux joueurs différents.</div> : duels.length ? <div className="h2h-result">
        <button onClick={() => first && onPlayer(first)}><span className="player-avatar">{initials(first?.name ?? "")}</span><strong>{first?.name}</strong><b>{firstWins}</b><small>victoires</small></button>
        <div><strong>{duels.length}</strong><span>confrontation{duels.length > 1 ? "s" : ""}</span><i>{firstWins === secondWins ? "Égalité parfaite" : firstWins > secondWins ? `${first?.name} mène` : `${second?.name} mène`}</i></div>
        <button onClick={() => second && onPlayer(second)}><span className="player-avatar">{initials(second?.name ?? "")}</span><strong>{second?.name}</strong><b>{secondWins}</b><small>victoires</small></button>
      </div> : <div className="h2h-empty">Ces deux joueurs ne se sont pas encore affrontés dans l’historique récent.</div>}
    </article>
  </section>;
}

function HistoryView({ matches, query, format, setQuery, setFormat, onReplay, onNew }: {
  matches: Match[];
  query: string;
  format: "tous" | "1v1" | "2v1" | "2v2";
  setQuery: (value: string) => void;
  setFormat: (value: "tous" | "1v1" | "2v1" | "2v2") => void;
  onReplay: (match: Match) => void;
  onNew: () => void;
}) {
  const normalized = query.trim().toLocaleLowerCase("fr");
  const filtered = matches.filter((match) => {
    const matchFormat = formatOf(match);
    const namesInMatch = [...match.red, ...match.blue].map((member) => member.name).join(" ").toLocaleLowerCase("fr");
    return (format === "tous" || matchFormat === format) && (!normalized || namesInMatch.includes(normalized));
  });
  const totalGoals = matches.reduce((sum, match) => sum + match.red_score + match.blue_score, 0);
  const closest = matches.filter((match) => Math.abs(match.red_score - match.blue_score) <= 2).length;
  return <section className="page-section history-page">
    <div className="page-title"><div><p className="eyebrow">TOUS LES MATCHS</p><h1>Historique</h1><p>Retrouvez une rencontre et relancez la revanche en un clic.</p></div><button className="primary-button" onClick={onNew}>＋ Nouveau match</button></div>
    <div className="history-stats">
      <div><span>MATCHS</span><strong>{matches.length}</strong></div>
      <div><span>BUTS MARQUÉS</span><strong>{totalGoals}</strong></div>
      <div><span>MATCHS SERRÉS</span><strong>{closest}</strong></div>
    </div>
    <div className="history-toolbar panel">
      <label className="history-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un joueur…" aria-label="Rechercher dans l’historique" /></label>
      <div className="format-filters">{(["tous", "1v1", "2v1", "2v2"] as const).map((item) => <button key={item} className={format === item ? "active" : ""} onClick={() => setFormat(item)}>{item === "tous" ? "Tous" : item}</button>)}</div>
    </div>
    <div className="panel history-list">
      {filtered.length ? filtered.map((match) => <MatchRow key={match.id} match={match} onReplay={onReplay} showFormat />) : <EmptyState text="Aucun match ne correspond à cette recherche." action="Effacer les filtres" onClick={() => { setQuery(""); setFormat("tous"); }} />}
    </div>
  </section>;
}

function PlayerProfileModal({ player, rank, matches, onReplay, onClose }: { player: Player; rank: number; matches: Match[]; onReplay: (match: Match) => void; onClose: () => void }) {
  const playerMatches = matches.filter((match) => [...match.red, ...match.blue].some((member) => member.id === player.id));
  const winRate = player.games ? Math.round(player.wins / player.games * 100) : 0;
  const maxRoleElo = Math.max(player.attack_elo, player.defense_elo, 1100);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className="modal-header"><div><p className="eyebrow">PROFIL JOUEUR · #{rank}</p><h2 id="profile-title">{player.name}</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></div>
      <div className="profile-hero">
        <div className="profile-avatar">{initials(player.name)}</div>
        <div><span className="profile-badge">{playerProfile(player)}</span><strong>{player.elo}</strong><small>Elo général</small></div>
        <div className="win-ring" style={{ "--win-rate": `${winRate * 3.6}deg` } as React.CSSProperties}><span>{winRate}%</span><small>victoires</small></div>
      </div>
      <div className="role-comparison">
        <div><span><i className="attack-dot" />Attaque <b>{player.attack_elo}</b></span><div><i className="attack-bar" style={{ width: `${Math.max(12, player.attack_elo / maxRoleElo * 100)}%` }} /></div></div>
        <div><span><i className="defense-dot" />Défense <b>{player.defense_elo}</b></span><div><i className="defense-bar" style={{ width: `${Math.max(12, player.defense_elo / maxRoleElo * 100)}%` }} /></div></div>
      </div>
      <div className="profile-numbers"><span><b>{player.games}</b><small>matchs</small></span><span><b>{player.wins}</b><small>victoires</small></span><span><b>{player.losses}</b><small>défaites</small></span></div>
      <div className="profile-recent"><div className="profile-section-title"><strong>Matchs récents</strong><span>{playerMatches.length} affichés</span></div>{playerMatches.slice(0, 4).map((match) => <MatchRow key={match.id} match={match} onReplay={(item) => { onClose(); onReplay(item); }} />)}</div>
    </section>
  </div>;
}

function InvitationRequired({ error }: { error: string }) {
  return <main className="invite-gate">
    <section className="invite-gate-card">
      <div className="brand brand-large"><span className="brand-ball">●</span> BuroBall</div>
      <div className="gate-lock">↗</div>
      <p className="eyebrow">LIGUE PRIVÉE</p>
      <h1>Il vous faut<br />une invitation.</h1>
      <p>{error || "Cette ligue est réservée aux collègues invités. Demandez un nouveau lien à un membre de BuroBall."}</p>
      <a className="secondary-button" href="/signout-with-chatgpt?return_to=/">Changer de compte</a>
    </section>
    <aside className="invite-gate-aside" aria-hidden="true"><span>10</span><i>—</i><span>7</span><p>ACCÈS SUR INVITATION</p></aside>
  </main>;
}

function InviteModal({ link, busy, onCreate, onCopy, onClose }: { link: string; busy: boolean; onCreate: () => void; onCopy: () => void; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="modal-header"><div><p className="eyebrow">LIGUE PRIVÉE</p><h2 id="invite-title">Inviter un collègue</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></div>
      <div className="invite-illustration"><span>●</span><i>→</i><span>●</span></div>
      <p className="invite-copy">Créez un lien personnel. Il est valable pendant 7 jours et ne peut être utilisé qu’une seule fois.</p>
      {link ? <>
        <label className="field"><span>Lien d’invitation</span><input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>
        <button className="primary-button full" onClick={onCopy}>Copier le lien</button>
        <button className="text-button" onClick={onCreate} disabled={busy}>Créer un autre lien</button>
      </> : <button className="primary-button full" onClick={onCreate} disabled={busy}>{busy ? "Création…" : "Créer un lien d’invitation →"}</button>}
      <div className="invite-safety"><b>Usage unique</b><span>Une fois accepté, le lien devient automatiquement invalide.</span></div>
    </section>
  </div>;
}

function MatchRow({ match, onReplay, showFormat = false }: { match: Match; onReplay?: (match: Match) => void; showFormat?: boolean }) {
  const redWon = match.red_score > match.blue_score;
  return <article className="match-row">
    <div className={`result-badge ${redWon ? "red-win" : "blue-win"}`}>{redWon ? "R" : "B"}</div>
    <div className="match-teams"><strong>{names(match.red)}</strong><span>vs</span><strong>{names(match.blue)}</strong><small>{relativeDate(match.created_at)}{showFormat ? ` · ${formatOf(match)}` : ""}</small></div>
    <div className="match-score"><span className="red-text">{match.red_score}</span><i>—</i><span className="blue-text">{match.blue_score}</span></div>
    <div className="elo-change">±{match.elo_delta}</div>
    {onReplay && <button className="replay-button" onClick={() => onReplay(match)} title="Rejouer ce match" aria-label="Rejouer ce match">↻</button>}
  </article>;
}

function MatchModal({ players, draft, setDraft, toggleMember, onClose, onSubmit, busy }: {
  players: Player[];
  draft: typeof emptyDraft;
  setDraft: React.Dispatch<React.SetStateAction<typeof emptyDraft>>;
  toggleMember: (side: "red" | "blue", player: Player) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const visiblePlayers = players.filter((player) => player.name.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));
  const preview = eloPreview(players, draft);
  const format = draft.red.length && draft.blue.length ? `${draft.red.length}v${draft.blue.length}` : "À compléter";
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal match-modal" onSubmit={onSubmit}>
      <div className="modal-header"><div><p className="eyebrow">NOUVEAU MATCH · {format}</p><h2>Qui a gagné ?</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></div>
      <div className="score-entry">
        <ScoreControl side="red" value={draft.redScore} onChange={(value) => setDraft((d) => ({ ...d, redScore: value }))} />
        <span className="score-separator">—</span>
        <ScoreControl side="blue" value={draft.blueScore} onChange={(value) => setDraft((d) => ({ ...d, blueScore: value }))} />
      </div>
      <div className="match-tools"><label><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un joueur…" aria-label="Rechercher un joueur" /></label><button type="button" onClick={() => setDraft((d) => ({ red: d.blue, blue: d.red, redScore: d.blueScore, blueScore: d.redScore }))}>⇄ Inverser les côtés</button></div>
      <div className="team-pickers">
        {(["red", "blue"] as const).map((side) => <div key={side} className={`team-picker ${side}`}>
          <div className="picker-title"><strong>Équipe {side === "red" ? "rouge" : "bleue"}</strong><span>{draft[side].length}/2</span></div>
          <div className="picker-players">{visiblePlayers.map((player) => <button type="button" key={player.id} className={draft[side].some((m) => m.id === player.id) ? "picked" : ""} onClick={() => toggleMember(side, player)}><span>{initials(player.name)}</span>{player.name}<i>{draft[side].some((m) => m.id === player.id) ? "✓" : "+"}</i></button>)}</div>
          {draft[side].map((member) => <label className="position-select" key={member.id}><span>{players.find((p) => p.id === member.id)?.name}</span><select value={member.position} onChange={(e) => setDraft((d) => ({ ...d, [side]: d[side].map((m) => m.id === member.id ? { ...m, position: e.target.value as DraftMember["position"] } : m) }))}><option value="attaquant">Attaquant</option><option value="defenseur">Défenseur</option></select></label>)}
        </div>)}
      </div>
      <div className="modal-footer"><p>{preview ? <><b>Impact estimé : ±{preview.delta} Elo</b><span>{preview.message}</span></> : <>Sélectionnez les deux équipes pour prévisualiser l’impact Elo.</>}</p><button className="primary-button" disabled={busy || !draft.red.length || !draft.blue.length || draft.redScore === draft.blueScore}>{busy ? "Enregistrement…" : "Valider le match →"}</button></div>
    </form>
  </div>;
}

function ScoreControl({ side, value, onChange }: { side: "red" | "blue"; value: number; onChange: (value: number) => void }) {
  const label = side === "red" ? "ROUGE" : "BLEU";
  return <div className={`score-side ${side}-side`}><span>{label}</span><div><button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Retirer un point à l’équipe ${label.toLowerCase()}`}>−</button><input aria-label={`Score ${label.toLowerCase()}`} type="number" min="0" max="99" value={value} onChange={(event) => onChange(Math.max(0, Math.min(99, Number(event.target.value))))} /><button type="button" onClick={() => onChange(Math.min(99, value + 1))} aria-label={`Ajouter un point à l’équipe ${label.toLowerCase()}`}>＋</button></div></div>;
}

function PlayerModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal player-modal" onSubmit={onSubmit}>
      <div className="modal-header"><div><p className="eyebrow">LA LIGUE</p><h2>Ajouter un collègue</h2></div><button type="button" onClick={onClose} aria-label="Fermer">×</button></div>
      <label className="field"><span>Prénom ou nom</span><input name="name" autoFocus required minLength={2} maxLength={40} placeholder="Ex. Manon" /></label>
      <div className="auto-profile-note"><span>↔</span><div><b>Tout le monde joue aux deux postes</b><p>Le profil Attaquant, Défenseur ou Polyvalent sera attribué automatiquement selon les performances.</p></div></div>
      <button className="primary-button full" disabled={busy}>{busy ? "Ajout…" : "Ajouter à la ligue →"}</button>
    </form>
  </div>;
}

function DrawResult({ draw, players, onAgain, onUse }: { draw: Draw; players: Player[]; onAgain: () => void; onUse: () => void }) {
  const team = (side: "red" | "blue") => <div className={`draw-team ${side}`}><div className="draw-team-title"><span>ÉQUIPE {side === "red" ? "ROUGE" : "BLEUE"}</span><b>{Math.round(draw[side].reduce((sum, m) => { const p = players.find((player) => player.id === m.id)!; return sum + positionalElo(p, m.position); }, 0) / draw[side].length)} Elo poste</b></div>{draw[side].map((member) => { const p = players.find((player) => player.id === member.id)!; return <div className="draw-player" key={member.id}><div className="player-avatar">{initials(p.name)}</div><div><strong>{p.name}</strong><small>{positionLabel(member.position)}</small></div><b>{positionalElo(p, member.position)}</b></div>; })}</div>;
  return <div className="draw-result"><div className="balance-badge">ÉCART DE {draw.gap} ELO · ÉQUILIBRÉ</div>{team("red")}<div className="versus">VS</div>{team("blue")}<div className="draw-actions"><button className="secondary-button" onClick={onAgain}>↻ Retirer</button><button className="primary-button" onClick={onUse}>Utiliser ce tirage →</button></div></div>;
}

function EmptyState({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span>●</span><p>{text}</p><button onClick={onClick}>{action} →</button></div>;
}

function positionalElo(player: Player, position: "attaquant" | "defenseur") {
  return position === "attaquant" ? player.attack_elo : player.defense_elo;
}
function eloPreview(players: Player[], draft: typeof emptyDraft) {
  if (!draft.red.length || !draft.blue.length || draft.redScore === draft.blueScore) return null;
  const teamRating = (members: DraftMember[]) => Math.round(members.reduce((sum, member) => {
    const player = players.find((item) => item.id === member.id);
    return sum + (player ? positionalElo(player, member.position) : 1000);
  }, 0) / members.length);
  const redRating = teamRating(draft.red);
  const blueRating = teamRating(draft.blue);
  const redWon = draft.redScore > draft.blueScore;
  const expectedRed = 1 / (1 + 10 ** ((blueRating - redRating) / 400));
  const delta = Math.max(1, Math.abs(Math.round(32 * ((redWon ? 1 : 0) - expectedRed))));
  const favorite = Math.abs(redRating - blueRating) < 25 ? "Match très équilibré" : redRating > blueRating ? "Rouge part favori" : "Bleu part favori";
  return { delta, message: `${favorite} · ${redRating} vs ${blueRating} Elo poste` };
}
function formatOf(match: Match) {
  const sizes = [match.red.length, match.blue.length].sort((a, b) => b - a);
  return `${sizes[0]}v${sizes[1]}` as "1v1" | "2v1" | "2v2";
}
function playerProfile(player: Player) {
  const gap = player.attack_elo - player.defense_elo;
  if (gap >= 80) return "Attaquant";
  if (gap <= -80) return "Défenseur";
  return "Polyvalent";
}
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function names(members: Member[]) { return members.map((member) => member.name.split(" ")[0]).join(" & "); }
function positionLabel(position: string) { return position === "defenseur" ? "Défenseur" : position === "attaquant" ? "Attaquant" : "Polyvalent"; }
function relativeDate(timestamp: number) {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 60) return `Il y a ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `Il y a ${days} j`;
}
