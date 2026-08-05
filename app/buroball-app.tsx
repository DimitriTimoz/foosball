"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  averageTeamRating,
  assignPositions,
  balanceGroup,
  calculateEloDelta,
  matchFormat,
  playerProfile,
  positionalElo,
  preferredSide,
  winRate,
} from "@/lib/foosball-algorithms";

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
type SessionUser = { displayName: string; username: string; playerId: string; isDemo: boolean };
type LeagueStats = {
  total_matches: number;
  total_goals: number;
  avg_goals: number;
  avg_margin: number;
  red_wins: number;
  blue_wins: number;
  close_matches: number;
};
type PlayerSideStats = { id: string; name: string; red_games: number; red_wins: number; blue_games: number; blue_wins: number };
type Dashboard = { players: Player[]; matches: Match[]; leagueStats: LeagueStats; sideStats: PlayerSideStats[]; user: SessionUser; registeredAccounts: number };
type DraftMember = { id: string; position: "attaquant" | "defenseur" };
type Draw = { red: DraftMember[]; blue: DraftMember[]; gap: number };
type TournamentSummary = {
  id: string; name: string; status: "active" | "completed"; current_round: number; created_at: number;
  player_count: number; completed_matches: number; match_count: number;
};
type TournamentStanding = Player & { joined_round: number; left_round: number | null; played: number; wins: number; losses: number; points: number; goal_diff: number };
type TournamentGame = {
  id: string; round_number: number; status: "pending" | "recording" | "completed";
  red_score: number | null; blue_score: number | null; red: Member[]; blue: Member[];
};
type TournamentDetail = {
  tournament: TournamentSummary;
  players: Array<Player & { joined_round: number; left_round: number | null }>;
  standings: TournamentStanding[];
  matches: TournamentGame[];
};
type View = "accueil" | "classement" | "historique" | "stats" | "equipes" | "tournois";

const emptyDraft = { red: [] as DraftMember[], blue: [] as DraftMember[], redScore: 10, blueScore: 7 };
const draftStorageKey = "office-foos-match-draft";

export function OfficeFoosApp() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [view, setView] = useState<View>("accueil");
  const [matchOpen, setMatchOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFormat, setHistoryFormat] = useState<"tous" | "1v1" | "2v1" | "2v2">("tous");
  const [draft, setDraft] = useState(emptyDraft);
  const [drawIds, setDrawIds] = useState<string[]>([]);
  const [draw, setDraw] = useState<Draw | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const draftHydrated = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    const payload = (await response.json()) as Dashboard & { error?: string };
    if (response.status === 401) { window.location.replace("/"); return; }
    if (!response.ok) throw new Error(payload.error ?? "Unable to load Office Foos.");
    setData(payload);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load().catch((error) => setToast(error.message)); }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setMatchOpen(false); setPlayerOpen(false); setInviteOpen(false); setPasswordOpen(false); setSelectedPlayer(null); setMobileMenuOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!matchOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [matchOpen]);
  useEffect(() => {
    if (!data || draftHydrated.current) return;
    const timeout = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(draftStorageKey) ?? "null") as typeof emptyDraft | null;
        if (!stored || !Array.isArray(stored.red) || !Array.isArray(stored.blue)) { draftHydrated.current = true; return; }
        const playerIds = new Set(data.players.map((player) => player.id));
        const validMember = (member: DraftMember) => playerIds.has(member.id) && (member.position === "attaquant" || member.position === "defenseur");
        if (stored.red.length > 2 || stored.blue.length > 2 || !stored.red.every(validMember) || !stored.blue.every(validMember)) { draftHydrated.current = true; return; }
        const uniqueIds = new Set([...stored.red, ...stored.blue].map((member) => member.id));
        if (uniqueIds.size !== stored.red.length + stored.blue.length) { draftHydrated.current = true; return; }
        draftHydrated.current = true;
        setDraft({ ...stored, redScore: Math.max(0, Math.min(99, Number(stored.redScore) || 0)), blueScore: Math.max(0, Math.min(99, Number(stored.blueScore) || 0)) });
        if (stored.red.length || stored.blue.length) setToast("Your unfinished match is ready to resume");
      } catch { draftHydrated.current = true; window.localStorage.removeItem(draftStorageKey); }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [data]);
  useEffect(() => {
    if (!draftHydrated.current) return;
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  }, [draft]);

  const currentPlayer = data?.players.find((player) => player.id === data.user.playerId);
  const firstName = (data?.user.displayName ?? "").split(" ")[0];
  const registeredAccounts = data?.registeredAccounts ?? 0;
  const hasDraft = draft.red.length > 0 || draft.blue.length > 0;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/");
  }

  function navigate(nextView: View) {
    setView(nextView);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitMatch(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.red.length || !draft.blue.length) return setToast("Add at least one player to each side.");
    setBusy(true);
    try {
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json() as { error?: string; match?: { delta: number } };
      if (!response.ok) throw new Error(payload.error ?? "The match could not be saved.");
      setMatchOpen(false);
      setDraft(emptyDraft);
      window.localStorage.removeItem(draftStorageKey);
      setToast(`Match saved · ${payload.match?.delta ?? 0} Elo points at stake`);
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Something went wrong.");
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
      if (!response.ok) throw new Error(payload.error ?? "Unable to add this player.");
      setPlayerOpen(false);
      setToast("Player added to the league");
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirmPassword") ?? "")) return setToast("New passwords do not match.");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to change the password.");
      setPasswordOpen(false);
      setToast("Password changed · other sessions signed out");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function createInvite() {
    setBusy(true);
    try {
      const response = await fetch("/api/invitations", { method: "POST" });
      const payload = await response.json() as { token?: string; error?: string };
      if (!response.ok || !payload.token) throw new Error(payload.error ?? "Unable to create the invitation.");
      setInviteLink(`${window.location.origin}/?invite=${payload.token}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setToast("Invitation link copied");
  }

  function toggleMember(side: "red" | "blue", player: Player) {
    const other = side === "red" ? "blue" : "red";
    setDraft((current) => {
      const selected = current[side].some((member) => member.id === player.id);
      const targetPlayers = selected
        ? current[side].filter((member) => member.id !== player.id).map((member) => data!.players.find((item) => item.id === member.id)!)
        : [...current[side].map((member) => data!.players.find((item) => item.id === member.id)!), player];
      if (!selected && targetPlayers.length > 2) { setToast("Each side can have at most two players."); return current; }
      const otherPlayers = current[other]
        .filter((member) => member.id !== player.id)
        .map((member) => data!.players.find((item) => item.id === member.id)!);
      return {
        ...current,
        [side]: targetPlayers.length ? assignPositions(targetPlayers) : [],
        [other]: otherPlayers.length ? assignPositions(otherPlayers) : [],
      };
    });
  }

  function generateTeams() {
    if (!data || drawIds.length < 2 || drawIds.length > 4) return setToast("Select between 2 and 4 players.");
    const selected = drawIds.map((id) => data.players.find((player) => player.id === id)!);
    setDraw(balanceGroup(selected));
  }

  function useDraw() {
    if (!draw) return;
    setDraft({ ...emptyDraft, red: draw.red, blue: draw.blue });
    setMatchOpen(true);
  }

  function replayMatch(match: Match) {
    setDraft(draftFromMatch(match));
    setMatchOpen(true);
  }

  async function shareMatch(match: Match) {
    const text = `Office Foos · ${names(match.red)} ${match.red_score}–${match.blue_score} ${names(match.blue)} · ±${match.elo_delta} Elo`;
    try {
      if (navigator.share) await navigator.share({ title: "Office Foos result", text });
      else { await navigator.clipboard.writeText(text); setToast("Result copied"); }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setToast("Unable to share this result");
    }
  }

  if (!data) {
    return <main className="loading-screen"><div className="loading-brand"><span>●</span> Office Foos</div><div className="loading-bar"><i /></div><p>Setting up the table…</p></main>;
  }

  const navItems = [
    ["accueil", "⌂", "Home"],
    ["classement", "↗", "Leaderboard"],
    ["historique", "◷", "History"],
    ["stats", "▥", "Stats"],
    ["tournois", "◆", "Tournaments"],
    ["equipes", "⚖", "Teams"],
  ] as const;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("accueil")}><span className="brand-ball">●</span> Office Foos</button>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navItems.map(([id, , label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
        </nav>
        <div className="top-actions">
          <button className="invite-button" onClick={() => setInviteOpen(true)}><span>↗</span> Invite</button>
          <button className="icon-button" aria-label="Add a player" title="Add a player" onClick={() => setPlayerOpen(true)}>＋</button>
          <button className="icon-button security-button" aria-label="Change password" title="Change password" onClick={() => setPasswordOpen(true)}>⌁</button>
          <button className="primary-button compact" onClick={() => setMatchOpen(true)}>＋ <span>New match</span></button>
          <button className="avatar" title={`Sign out @${data.user.username}`} aria-label="Sign out" onClick={() => void signOut()}>{initials(data.user.displayName)}</button>
          <button className="mobile-menu-trigger" aria-label="Open menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}><span>•••</span></button>
        </div>
      </header>

      <main className="main-content">
        {view === "accueil" && (
          <>
            <section className="hero-grid">
              <div className="welcome-card">
                <p className="eyebrow">DASHBOARD</p>
                <h1>Hey {firstName},<br /><span>your turn to play.</span></h1>
                <p>One score, a few seconds, and the leaderboard is up to date.</p>
                <button className="primary-button hero-button" onClick={() => setMatchOpen(true)}>{hasDraft ? "Resume match" : "Record a match"} <span>→</span></button>
                <div className="ball-decoration" aria-hidden="true">●</div>
              </div>
              <div className="stat-card dark-card">
                <div className="stat-top"><span>MY ELO · {currentPlayer ? playerProfile(currentPlayer).toUpperCase() : "ALL-ROUNDER"}</span><span className="live-dot">● LIVE</span></div>
                <strong>{currentPlayer?.elo ?? 1000}</strong>
                <div className="elo-scale"><i style={{ width: `${Math.min(100, Math.max(12, ((currentPlayer?.elo ?? 1000) - 800) / 6))}%` }} /></div>
                <div className="role-elos"><span><i>A</i><b>{currentPlayer?.attack_elo ?? 1000}</b></span><span><i>D</i><b>{currentPlayer?.defense_elo ?? 1000}</b></span></div>
                <div className="stat-bottom"><span>{currentPlayer?.wins ?? 0} wins</span><span>{currentPlayer?.games ?? 0} matches</span></div>
              </div>
              <div className="rank-card">
                <p>MY RANK</p>
                <strong>#{Math.max(1, data.players.findIndex((p) => p.id === currentPlayer?.id) + 1)}</strong>
                <span>out of {data.players.length} players</span>
                <button onClick={() => setView("classement")}>View leaderboard →</button>
              </div>
            </section>

            <section className="quick-launch panel" aria-label="Quick actions">
              <div className="quick-launch-title"><p className="eyebrow">QUICK PLAY</p><h2>Ready in one tap.</h2></div>
              <div className="quick-launch-actions">
                <button className="quick-launch-primary" onClick={() => setMatchOpen(true)}><span>{hasDraft ? "↗" : "＋"}</span><div><b>{hasDraft ? "Resume draft" : "New match"}</b><small>{hasDraft ? `${draft.red.length + draft.blue.length} players already selected` : "Enter a score"}</small></div><i>→</i></button>
                <button disabled={!data.matches[0]} onClick={() => data.matches[0] && replayMatch(data.matches[0])}><span>↻</span><div><b>Rematch</b><small>{data.matches[0] ? `${names(data.matches[0].red)} vs ${names(data.matches[0].blue)}` : "After your first match"}</small></div><i>→</i></button>
                <button onClick={() => navigate("equipes")}><span>⚖</span><div><b>Balanced teams</b><small>Shuffle 2 to 4 players</small></div><i>→</i></button>
                <button onClick={() => setInviteOpen(true)}><span>↗</span><div><b>Invite</b><small>Add a coworker</small></div><i>→</i></button>
              </div>
            </section>

            {registeredAccounts === 1 && <section className="first-invite-banner">
              <div className="first-invite-number">01</div>
              <div><p className="eyebrow">FIRST SIGN-UP</p><h2>Invite your first coworker.</h2><p>Generate their personal sign-up link so they can create an account and join your league.</p></div>
              <button className="primary-button" disabled={busy} onClick={() => { setInviteOpen(true); if (!inviteLink) void createInvite(); }}>{busy ? "Generating…" : "Generate the first link →"}</button>
            </section>}

            <section className="content-grid">
              <div className="panel recent-panel">
                <div className="section-heading"><div><p className="eyebrow">ACTIVITY</p><h2>Latest matches</h2></div><button onClick={() => setMatchOpen(true)}>Add ＋</button></div>
                <div className="match-list">
                  {data.matches.length ? data.matches.slice(0, 6).map((match) => <MatchRow key={match.id} match={match} onReplay={replayMatch} onShare={shareMatch} />) : <EmptyState text="No matches yet." action="Record the first one" onClick={() => setMatchOpen(true)} />}
                </div>
              </div>
              <div className="panel podium-panel">
                <div className="section-heading"><div><p className="eyebrow">TOP PLAYERS</p><h2>The podium</h2></div><button onClick={() => setView("classement")}>View all</button></div>
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
                <button className="secondary-button full" onClick={() => setView("equipes")}>⚖ Build balanced teams</button>
              </div>
            </section>
          </>
        )}

        {view === "classement" && (
          <section className="page-section">
            <div className="page-title"><div><p className="eyebrow">THE LEAGUE</p><h1>Elo leaderboard</h1><p>One overall rating plus a rating for every position actually played.</p></div><button className="secondary-button" onClick={() => setPlayerOpen(true)}>＋ Add a player</button></div>
            <div className="leaderboard panel">
              <div className="table-head"><span>RANK</span><span>PLAYER</span><span>POSITION ELO</span><span>W / L</span><span>OVERALL</span></div>
              {data.players.map((player, index) => (
                <button className="leader-row" key={player.id} onClick={() => setSelectedPlayer(player)}>
                  <span className="leader-rank">{String(index + 1).padStart(2, "0")}</span>
                  <div className="leader-player"><div className="player-avatar">{initials(player.name)}</div><div><strong>{player.name}</strong><small>{player.id === data.user.playerId ? "You · " : ""}{playerProfile(player)}</small></div></div>
                  <span className="position-ratings"><b className="attack-rating">A {player.attack_elo}</b><b className="defense-rating">D {player.defense_elo}</b></span>
                  <span className="record"><b>{player.wins}</b> / {player.losses}</span>
                  <strong className="elo-number">{player.elo}</strong>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "historique" && <HistoryView matches={data.matches} query={historyQuery} format={historyFormat} setQuery={setHistoryQuery} setFormat={setHistoryFormat} onReplay={replayMatch} onShare={shareMatch} onNew={() => setMatchOpen(true)} />}

        {view === "stats" && <StatsView players={data.players} matches={data.matches} stats={data.leagueStats} sideStats={data.sideStats} onPlayer={setSelectedPlayer} />}

        {view === "tournois" && <TournamentView players={data.players} onLeagueRefresh={load} onToast={setToast} />}

        {view === "equipes" && (
          <section className="page-section team-builder-page">
            <div className="page-title"><div><p className="eyebrow">BALANCED DRAW</p><h1>Who’s playing?</h1><p>Choose 2 to 4 coworkers. Office Foos uses position Elo to balance the teams.</p></div></div>
            <div className="builder-layout">
              <div className="panel selection-panel">
                <div className="selection-title"><h2>Selection</h2><span>{drawIds.length}/4</span></div>
                <div className="player-select-grid">
                  {data.players.map((player) => {
                    const selected = drawIds.includes(player.id);
                    return <button key={player.id} className={`select-player ${selected ? "selected" : ""}`} onClick={() => setDrawIds((ids) => selected ? ids.filter((id) => id !== player.id) : ids.length < 4 ? [...ids, player.id] : ids)}>
                      <span className="check-box">{selected ? "✓" : ""}</span><span className="player-avatar">{initials(player.name)}</span><span><strong>{player.name}</strong><small>{playerProfile(player)}</small></span><b>{player.elo}</b>
                    </button>;
                  })}
                </div>
                <button className="primary-button full generate-button" disabled={drawIds.length < 2} onClick={generateTeams}>Shuffle and balance <span>↻</span></button>
              </div>
              <div className={`draw-area ${draw ? "has-draw" : ""}`}>
                {draw ? <DrawResult draw={draw} players={data.players} onAgain={generateTeams} onUse={useDraw} /> : <div className="draw-placeholder"><div>⚖</div><h2>Your teams will appear here</h2><p>We consider Elo and position strengths, with just enough randomness.</p></div>}
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={view === "accueil" ? "active" : ""} onClick={() => navigate("accueil")}><span>⌂</span>Home</button>
        <button className={view === "classement" ? "active" : ""} onClick={() => navigate("classement")}><span>↗</span>Rank</button>
        <button className="mobile-add" onClick={() => setMatchOpen(true)}><span>＋</span><b>Match</b></button>
        <button className={view === "stats" ? "active" : ""} onClick={() => navigate("stats")}><span>▥</span>Stats</button>
        <button className={mobileMenuOpen || (["historique", "tournois", "equipes"] as View[]).includes(view) ? "active" : ""} onClick={() => setMobileMenuOpen(true)}><span>•••</span>More</button>
      </nav>

      {mobileMenuOpen && <div className="mobile-more-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileMenuOpen(false); }}>
        <section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="More navigation">
          <div className="sheet-handle" aria-hidden="true" />
          <div className="mobile-more-head"><div><p className="eyebrow">OFFICE FOOS</p><h2>More</h2></div><button aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}>×</button></div>
          <div className="mobile-view-grid">
            <button className={view === "historique" ? "active" : ""} onClick={() => navigate("historique")}><span>◷</span><b>History</b><small>All matches</small></button>
            <button className={view === "tournois" ? "active" : ""} onClick={() => navigate("tournois")}><span>◆</span><b>Tournaments</b><small>Play together</small></button>
            <button className={view === "equipes" ? "active" : ""} onClick={() => navigate("equipes")}><span>⚖</span><b>Teams</b><small>Balanced draw</small></button>
          </div>
          <div className="mobile-account-actions">
            <button onClick={() => { setMobileMenuOpen(false); setInviteOpen(true); }}><span>↗</span><b>Invite a coworker</b><i>›</i></button>
            <button onClick={() => { setMobileMenuOpen(false); setPlayerOpen(true); }}><span>＋</span><b>Add a player</b><i>›</i></button>
            <button onClick={() => { setMobileMenuOpen(false); setPasswordOpen(true); }}><span>⌁</span><b>Change password</b><i>›</i></button>
            <button onClick={() => void signOut()}><span>{initials(data.user.displayName)}</span><b>Sign out @{data.user.username}</b><i>›</i></button>
          </div>
        </section>
      </div>}

      {matchOpen && <MatchModal players={data.players} lastMatch={data.matches[0]} draft={draft} setDraft={setDraft} toggleMember={toggleMember} onClose={() => setMatchOpen(false)} onSubmit={submitMatch} busy={busy} />}
      {playerOpen && <PlayerModal onClose={() => setPlayerOpen(false)} onSubmit={submitPlayer} busy={busy} />}
      {inviteOpen && <InviteModal link={inviteLink} busy={busy} onCreate={createInvite} onCopy={copyInvite} onClose={() => setInviteOpen(false)} />}
      {passwordOpen && <PasswordModal busy={busy} onSubmit={submitPassword} onClose={() => setPasswordOpen(false)} />}
      {selectedPlayer && <PlayerProfileModal player={selectedPlayer} rank={data.players.findIndex((item) => item.id === selectedPlayer.id) + 1} matches={data.matches} onReplay={replayMatch} onClose={() => setSelectedPlayer(null)} />}
      {toast && <div className="toast" role="status"><span>●</span>{toast}</div>}
    </div>
  );
}

function TournamentView({ players, onLeagueRefresh, onToast }: { players: Player[]; onLeagueRefresh: () => Promise<void>; onToast: (message: string) => void }) {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Office Tournament");
  const [selectedIds, setSelectedIds] = useState<string[]>(players.map((player) => player.id));
  const [newPlayerId, setNewPlayerId] = useState("");
  const [leavingPlayerId, setLeavingPlayerId] = useState("");
  const [finishArmed, setFinishArmed] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/tournaments?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const payload = await response.json() as { tournament?: TournamentDetail; error?: string };
    if (!response.ok || !payload.tournament) throw new Error(payload.error ?? "Unable to load this tournament.");
    setDetail(payload.tournament);
  }, []);

  const loadTournaments = useCallback(async () => {
    const response = await fetch("/api/tournaments", { cache: "no-store" });
    const payload = await response.json() as { tournaments?: TournamentSummary[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to load tournaments.");
    const list = payload.tournaments ?? [];
    setTournaments(list);
    if (list.length) await loadDetail(list.find((item) => item.status === "active")?.id ?? list[0].id);
    else setDetail(null);
  }, [loadDetail]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTournaments().catch((error) => onToast(error instanceof Error ? error.message : "Unable to load tournaments.")).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadTournaments, onToast]);

  async function post(body: Record<string, unknown>, success: string, refreshLeague = false) {
    setBusy(true);
    try {
      const response = await fetch("/api/tournaments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { tournament?: TournamentDetail; error?: string };
      if (!response.ok || !payload.tournament) throw new Error(payload.error ?? "Unable to update the tournament.");
      setDetail(payload.tournament);
      setCreating(false);
      setFinishArmed(false);
      if (refreshLeague) await onLeagueRefresh();
      const listResponse = await fetch("/api/tournaments", { cache: "no-store" });
      const listPayload = await listResponse.json() as { tournaments?: TournamentSummary[] };
      setTournaments(listPayload.tournaments ?? []);
      onToast(success);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    await post({ action: "create", name, playerIds: selectedIds }, "Tournament started · everyone plays in round one");
  }

  const currentRound = detail?.tournament.current_round ?? 1;
  const availablePlayers = players.filter((player) => !detail?.players.some((participant) => participant.id === player.id && (participant.left_round === null || participant.left_round > currentRound)));
  const leaveablePlayers = detail?.players.filter((participant) => participant.left_round === null) ?? [];
  const activePlayerCount = detail?.players.filter((participant) => participant.joined_round <= currentRound + 1 && (participant.left_round === null || participant.left_round > currentRound + 1)).length ?? 0;
  const currentMatches = detail?.matches.filter((match) => match.round_number === currentRound) ?? [];
  const roundComplete = currentMatches.length > 0 && currentMatches.every((match) => match.status === "completed");
  const rounds = detail ? [...new Set(detail.matches.map((match) => match.round_number))].sort((first, second) => second - first) : [];

  if (loading) return <section className="page-section"><div className="tournament-loading panel">Preparing tournaments…</div></section>;

  return <section className="page-section tournament-page">
    <div className="page-title"><div><p className="eyebrow">MIXER MODE</p><h1>Tournaments</h1><p>Everyone plays every round in balanced teams that keep changing.</p></div><button className="primary-button" disabled={!!tournaments.find((item) => item.status === "active")} onClick={() => setCreating(true)}>＋ New tournament</button></div>

    {creating && <form className="panel tournament-create" onSubmit={create}>
      <div className="tournament-create-head"><div><p className="eyebrow">NEW TOURNAMENT</p><h2>Who’s entering the arena?</h2><p>Everyone is selected by default. You can still add a coworker later.</p></div><button type="button" onClick={() => setCreating(false)} aria-label="Close">×</button></div>
      <label className="field"><span>Tournament name</span><input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={50} /></label>
      <div className="tournament-player-grid">{players.map((player) => {
        const selected = selectedIds.includes(player.id);
        return <button type="button" key={player.id} className={selected ? "selected" : ""} onClick={() => setSelectedIds((ids) => selected ? ids.filter((id) => id !== player.id) : [...ids, player.id])}><span>{selected ? "✓" : ""}</span><div className="player-avatar">{initials(player.name)}</div><div><strong>{player.name}</strong><small>{playerProfile(player)} · {player.elo} Elo</small></div></button>;
      })}</div>
      <div className="tournament-create-footer"><span>{selectedIds.length} participant{selectedIds.length !== 1 ? "s" : ""}</span><button className="primary-button" disabled={busy || selectedIds.length < 2}>{busy ? "Creating…" : "Start round one →"}</button></div>
    </form>}

    {!creating && !detail && <div className="tournament-empty panel"><span>◆</span><h2>Start the first tournament</h2><p>Office Foos arranges the tables so every coworker plays in every round.</p><button className="primary-button" onClick={() => setCreating(true)}>Create a tournament →</button></div>}

    {!creating && detail && <div className="tournament-layout">
      <aside className="panel tournament-sidebar">
        <div className="tournament-sidebar-title"><strong>Tournaments</strong><span>{tournaments.length}</span></div>
        {tournaments.map((item) => <button key={item.id} className={detail.tournament.id === item.id ? "active" : ""} onClick={() => loadDetail(item.id).catch((error) => onToast(error.message))}><span className={item.status}>{item.status === "active" ? "IN PROGRESS" : "COMPLETED"}</span><strong>{item.name}</strong><small>{item.player_count} players · {item.completed_matches}/{item.match_count} matches</small></button>)}
      </aside>

      <div className="tournament-main">
        <div className="tournament-hero">
          <div><span className={`tournament-status ${detail.tournament.status}`}>{detail.tournament.status === "active" ? "● IN PROGRESS" : "✓ COMPLETED"}</span><h2>{detail.tournament.name}</h2><p>Round {currentRound} · {activePlayerCount} active participants</p></div>
          <div className="tournament-actions">
            {detail.tournament.status === "active" && availablePlayers.length > 0 && <label><span>Add next round</span><select value={newPlayerId} onChange={(event) => setNewPlayerId(event.target.value)}><option value="">Choose a coworker…</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select><button disabled={!newPlayerId || busy} onClick={() => post({ action: "add_player", tournamentId: detail.tournament.id, playerId: newPlayerId }, "Participant added · they’ll play next round").then(() => setNewPlayerId(""))}>Add ＋</button></label>}
            {detail.tournament.status === "active" && leaveablePlayers.length > 0 && <label className="leave-player"><span>Remove after this round</span><select value={leavingPlayerId} onChange={(event) => setLeavingPlayerId(event.target.value)}><option value="">Choose a participant…</option>{leaveablePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select><button disabled={!leavingPlayerId || busy} onClick={() => post({ action: "remove_player", tournamentId: detail.tournament.id, playerId: leavingPlayerId }, "Departure saved · the current round stays unchanged").then(() => setLeavingPlayerId(""))}>Remove −</button></label>}
          </div>
        </div>

        <div className="tournament-kpis"><div><span>CURRENT ROUND</span><strong>{currentRound}</strong></div><div><span>ACTIVE NEXT ROUND</span><strong>{activePlayerCount}</strong></div><div><span>MATCHES PLAYED</span><strong>{detail.matches.filter((match) => match.status === "completed").length}</strong></div></div>

        <div className="panel tournament-standing">
          <div className="tournament-section-head"><div><p className="eyebrow">TOURNAMENT STANDINGS</p><h3>The points race</h3></div><span>Win = 3 points</span></div>
          <div className="tournament-table-head"><span>#</span><span>PLAYER</span><span>P</span><span>W</span><span>DIFF.</span><span>PTS</span></div>
          {detail.standings.map((player, index) => <div className="tournament-standing-row" key={player.id}><b>{index + 1}</b><div><span className="player-avatar">{initials(player.name)}</span><span><strong>{player.name}</strong><small>{player.left_round && player.left_round > currentRound ? `Leaves after round ${currentRound}` : player.left_round && player.left_round <= currentRound ? "Left the tournament" : player.joined_round > currentRound ? `Joins in round ${player.joined_round}` : playerProfile(player)}</small></span></div><span>{player.played}</span><span>{player.wins}</span><span className={player.goal_diff > 0 ? "positive" : ""}>{player.goal_diff > 0 ? "+" : ""}{player.goal_diff}</span><strong>{player.points}</strong></div>)}
        </div>

        <div className="tournament-rounds">{rounds.map((round) => <div key={round} className="tournament-round">
          <div className="tournament-section-head"><div><p className="eyebrow">{round === currentRound ? "CURRENT ROUND" : "ARCHIVE"}</p><h3>Round {round}</h3></div><span>{detail.matches.filter((match) => match.round_number === round && match.status === "completed").length}/{detail.matches.filter((match) => match.round_number === round).length} completed</span></div>
          <div className="tournament-match-grid">{detail.matches.filter((match) => match.round_number === round).map((match) => <TournamentMatchCard key={match.id} match={match} disabled={busy || detail.tournament.status !== "active" || match.status === "recording"} onRecord={(redScore, blueScore) => post({ action: "record_match", tournamentId: detail.tournament.id, tournamentMatchId: match.id, redScore, blueScore }, "Score saved · standings and Elo updated", true)} />)}</div>
        </div>)}</div>

        {detail.tournament.status === "active" && <div className="tournament-bottom-actions">
          <button className="secondary-button danger-button" disabled={!roundComplete || busy} onClick={() => finishArmed ? post({ action: "finish", tournamentId: detail.tournament.id }, "Tournament completed · congrats to the podium") : setFinishArmed(true)}>{finishArmed ? "Confirm completion" : "End tournament"}</button>
          <button className="primary-button" disabled={!roundComplete || busy} onClick={() => post({ action: "next_round", tournamentId: detail.tournament.id }, `Round ${currentRound + 1} started · new teams`)}>Start round {currentRound + 1} →</button>
          {!roundComplete && <p>Record every score in this round to continue.</p>}
        </div>}
      </div>
    </div>}
  </section>;
}

function TournamentMatchCard({ match, disabled, onRecord }: { match: TournamentGame; disabled: boolean; onRecord: (redScore: number, blueScore: number) => Promise<void> }) {
  const [redScore, setRedScore] = useState(match.red_score ?? 10);
  const [blueScore, setBlueScore] = useState(match.blue_score ?? 7);
  const completed = match.status === "completed";
  return <article className={`tournament-match-card panel ${completed ? "completed" : ""}`}>
    <div className="tournament-match-top"><span>{match.red.length}v{match.blue.length}</span><b>{completed ? "✓ COMPLETED" : match.status === "recording" ? "SAVING…" : "TO PLAY"}</b></div>
    <div className="tournament-team red"><div><span>RED</span><strong>{names(match.red)}</strong><small>{match.red.map((member) => `${member.name.split(" ")[0]} · ${positionLabel(member.position)}`).join(" · ")}</small></div>{completed && <b>{match.red_score}</b>}</div>
    <div className="tournament-versus">VS</div>
    <div className="tournament-team blue"><div><span>BLUE</span><strong>{names(match.blue)}</strong><small>{match.blue.map((member) => `${member.name.split(" ")[0]} · ${positionLabel(member.position)}`).join(" · ")}</small></div>{completed && <b>{match.blue_score}</b>}</div>
    {!completed && <div className="tournament-score-entry"><label><span>Red</span><input type="number" min="0" max="99" value={redScore} onChange={(event) => setRedScore(Number(event.target.value))} /></label><i>—</i><label><span>Blue</span><input type="number" min="0" max="99" value={blueScore} onChange={(event) => setBlueScore(Number(event.target.value))} /></label><button disabled={disabled || redScore === blueScore} onClick={() => onRecord(redScore, blueScore)}>Confirm</button></div>}
  </article>;
}

function StatsView({ players, matches, stats, sideStats, onPlayer }: { players: Player[]; matches: Match[]; stats: LeagueStats; sideStats: PlayerSideStats[]; onPlayer: (player: Player) => void }) {
  const [firstId, setFirstId] = useState(players[0]?.id ?? "");
  const [secondId, setSecondId] = useState(players[1]?.id ?? players[0]?.id ?? "");
  const recentLabel = matches.length >= 50 ? "Last 50 matches" : `${matches.length} loaded match${matches.length !== 1 ? "es" : ""}`;
  const redRate = stats.total_matches ? Math.round(stats.red_wins / stats.total_matches * 100) : 50;
  const blueRate = stats.total_matches ? 100 - redRate : 50;
  const sideLeader = stats.red_wins === stats.blue_wins ? "Both sides are tied" : stats.red_wins > stats.blue_wins ? `Red wins more · +${stats.red_wins - stats.blue_wins}` : `Blue wins more · +${stats.blue_wins - stats.red_wins}`;
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
    { icon: "◷", label: "Most active", player: active, value: active ? `${active.games} matches` : "—" },
    { icon: "%", label: "Best win rate", player: efficient, value: efficient?.games ? `${Math.round(efficient.wins / efficient.games * 100)}% wins` : "—" },
    { icon: "A", label: "Best attack", player: attacker, value: attacker ? `${attacker.attack_elo} Elo` : "—" },
    { icon: "D", label: "Best defense", player: defender, value: defender ? `${defender.defense_elo} Elo` : "—" },
  ];

  return <section className="page-section stats-page">
    <div className="page-title"><div><p className="eyebrow">THE LEAGUE IN NUMBERS</p><h1>Statistics</h1><p>The trends that tell the real story of your office matches.</p></div></div>
    <div className="stats-kpis">
      <div><span>MATCHES PLAYED</span><strong>{stats.total_matches}</strong><small>all time</small></div>
      <div><span>GOALS SCORED</span><strong>{stats.total_goals}</strong><small>all teams</small></div>
      <div><span>GOALS / MATCH</span><strong>{stats.avg_goals}</strong><small>on average</small></div>
      <div><span>CLOSE MATCHES</span><strong>{stats.close_matches}</strong><small>margin of 2 or less</small></div>
    </div>

    <div className="stats-grid">
      <article className="panel stats-panel side-panel">
        <div className="stats-panel-header"><div><p className="eyebrow">RED OR BLUE?</p><h2>Side advantage</h2></div><span>{stats.total_matches} matches</span></div>
        <div className="side-score"><strong className="red-text">{redRate}%</strong><span>of wins</span><strong className="blue-text">{blueRate}%</strong></div>
        <div className="balance-track" aria-label={`${redRate}% red wins and ${blueRate}% blue wins`}><i className="red-balance" style={{ width: `${redRate}%` }} /><i className="blue-balance" style={{ width: `${blueRate}%` }} /></div>
        <div className="side-legend"><span><i className="red-dot" />Red <b>{stats.red_wins}</b></span><span><i className="blue-dot" />Blue <b>{stats.blue_wins}</b></span></div>
        <p className="stats-note"><b>{sideLeader}</b><span>Average score margin · {stats.avg_margin} goals</span></p>
      </article>

      <article className="panel stats-panel">
        <div className="stats-panel-header"><div><p className="eyebrow">FORMATS</p><h2>How you play</h2></div><span>{recentLabel}</span></div>
        <div className="format-bars">{formats.map((item) => <div className="format-row" key={item.format}><span>{item.format}</span><div><i style={{ width: `${item.count / maxFormat * 100}%` }} /></div><b>{item.count}</b></div>)}</div>
        <p className="stats-note">Distribution based on the recently loaded history.</p>
      </article>
    </div>

    <article className="panel player-side-panel">
      <div className="stats-panel-header"><div><p className="eyebrow">BY PLAYER</p><h2>Who wins on which side?</h2></div><span>all-time history</span></div>
      <div className="player-side-head"><span>PLAYER</span><span>RED SIDE</span><span>BLUE SIDE</span><span>BEST SIDE</span></div>
      {sideStats.map((item) => {
        const redPlayerRate = winRate(item.red_wins, item.red_games);
        const bluePlayerRate = winRate(item.blue_wins, item.blue_games);
        const bestSide = preferredSide(item.red_games, item.red_wins, item.blue_games, item.blue_wins);
        const player = players.find((candidate) => candidate.id === item.id);
        return <button className="player-side-row" key={item.id} onClick={() => player && onPlayer(player)}>
          <div><span className="player-avatar">{initials(item.name)}</span><strong>{item.name}</strong></div>
          <span className={bestSide === "Red" ? "best" : ""}><b>{item.red_games ? `${redPlayerRate}%` : "—"}</b><small>{item.red_wins}/{item.red_games} wins</small></span>
          <span className={bestSide === "Blue" ? "best" : ""}><b>{item.blue_games ? `${bluePlayerRate}%` : "—"}</b><small>{item.blue_wins}/{item.blue_games} wins</small></span>
          <strong className={`side-verdict ${bestSide.toLocaleLowerCase("en")}`}>{bestSide}</strong>
        </button>;
      })}
    </article>

    <div className="records-heading"><div><p className="eyebrow">RECORDS</p><h2>Who leads the pack?</h2></div><span>Minimum 3 matches for win rate</span></div>
    <div className="record-grid">{records.map((record) => <button key={record.label} className="record-card" disabled={!record.player} onClick={() => record.player && onPlayer(record.player)}><span className="record-icon">{record.icon}</span><small>{record.label}</small><strong>{record.player?.name ?? "Not yet"}</strong><b>{record.value}</b><i>View profile →</i></button>)}</div>

    <article className="panel stats-panel h2h-panel">
      <div className="stats-panel-header"><div><p className="eyebrow">HEAD-TO-HEAD</p><h2>The office showdown</h2></div><span>loaded history</span></div>
      <div className="h2h-selectors">
        <label><span>Player 1</span><select value={firstId} onChange={(event) => setFirstId(event.target.value)}>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <b>VS</b>
        <label><span>Player 2</span><select value={secondId} onChange={(event) => setSecondId(event.target.value)}>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      </div>
      {first?.id === second?.id ? <div className="h2h-empty">Choose two different players.</div> : duels.length ? <div className="h2h-result">
        <button onClick={() => first && onPlayer(first)}><span className="player-avatar">{initials(first?.name ?? "")}</span><strong>{first?.name}</strong><b>{firstWins}</b><small>wins</small></button>
        <div><strong>{duels.length}</strong><span>meeting{duels.length !== 1 ? "s" : ""}</span><i>{firstWins === secondWins ? "Perfect tie" : firstWins > secondWins ? `${first?.name} leads` : `${second?.name} leads`}</i></div>
        <button onClick={() => second && onPlayer(second)}><span className="player-avatar">{initials(second?.name ?? "")}</span><strong>{second?.name}</strong><b>{secondWins}</b><small>wins</small></button>
      </div> : <div className="h2h-empty">These players haven’t faced each other in the recent history yet.</div>}
    </article>
  </section>;
}

function HistoryView({ matches, query, format, setQuery, setFormat, onReplay, onShare, onNew }: {
  matches: Match[];
  query: string;
  format: "tous" | "1v1" | "2v1" | "2v2";
  setQuery: (value: string) => void;
  setFormat: (value: "tous" | "1v1" | "2v1" | "2v2") => void;
  onReplay: (match: Match) => void;
  onShare: (match: Match) => void;
  onNew: () => void;
}) {
  const normalized = query.trim().toLocaleLowerCase("en");
  const filtered = matches.filter((match) => {
    const matchFormat = formatOf(match);
    const namesInMatch = [...match.red, ...match.blue].map((member) => member.name).join(" ").toLocaleLowerCase("en");
    return (format === "tous" || matchFormat === format) && (!normalized || namesInMatch.includes(normalized));
  });
  const totalGoals = matches.reduce((sum, match) => sum + match.red_score + match.blue_score, 0);
  const closest = matches.filter((match) => Math.abs(match.red_score - match.blue_score) <= 2).length;
  return <section className="page-section history-page">
    <div className="page-title"><div><p className="eyebrow">ALL MATCHES</p><h1>History</h1><p>Find any match and launch a rematch in one click.</p></div><button className="primary-button" onClick={onNew}>＋ New match</button></div>
    <div className="history-stats">
      <div><span>MATCHES</span><strong>{matches.length}</strong></div>
      <div><span>GOALS SCORED</span><strong>{totalGoals}</strong></div>
      <div><span>CLOSE MATCHES</span><strong>{closest}</strong></div>
    </div>
    <div className="history-toolbar panel">
      <label className="history-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for a player…" aria-label="Search match history" /></label>
      <div className="format-filters">{(["tous", "1v1", "2v1", "2v2"] as const).map((item) => <button key={item} className={format === item ? "active" : ""} onClick={() => setFormat(item)}>{item === "tous" ? "All" : item}</button>)}</div>
    </div>
    <div className="panel history-list">
      {filtered.length ? filtered.map((match) => <MatchRow key={match.id} match={match} onReplay={onReplay} onShare={onShare} showFormat />) : <EmptyState text="No match matches this search." action="Clear filters" onClick={() => { setQuery(""); setFormat("tous"); }} />}
    </div>
  </section>;
}

function PlayerProfileModal({ player, rank, matches, onReplay, onClose }: { player: Player; rank: number; matches: Match[]; onReplay: (match: Match) => void; onClose: () => void }) {
  const playerMatches = matches.filter((match) => [...match.red, ...match.blue].some((member) => member.id === player.id));
  const winRate = player.games ? Math.round(player.wins / player.games * 100) : 0;
  const maxRoleElo = Math.max(player.attack_elo, player.defense_elo, 1100);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className="modal-header"><div><p className="eyebrow">PLAYER PROFILE · #{rank}</p><h2 id="profile-title">{player.name}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="profile-hero">
        <div className="profile-avatar">{initials(player.name)}</div>
        <div><span className="profile-badge">{playerProfile(player)}</span><strong>{player.elo}</strong><small>Overall Elo</small></div>
        <div className="win-ring" style={{ "--win-rate": `${winRate * 3.6}deg` } as React.CSSProperties}><span>{winRate}%</span><small>wins</small></div>
      </div>
      <div className="role-comparison">
        <div><span><i className="attack-dot" />Attack <b>{player.attack_elo}</b></span><div><i className="attack-bar" style={{ width: `${Math.max(12, player.attack_elo / maxRoleElo * 100)}%` }} /></div></div>
        <div><span><i className="defense-dot" />Defense <b>{player.defense_elo}</b></span><div><i className="defense-bar" style={{ width: `${Math.max(12, player.defense_elo / maxRoleElo * 100)}%` }} /></div></div>
      </div>
      <div className="profile-numbers"><span><b>{player.games}</b><small>matches</small></span><span><b>{player.wins}</b><small>wins</small></span><span><b>{player.losses}</b><small>losses</small></span></div>
      <div className="profile-recent"><div className="profile-section-title"><strong>Recent matches</strong><span>{playerMatches.length} shown</span></div>{playerMatches.slice(0, 4).map((match) => <MatchRow key={match.id} match={match} onReplay={(item) => { onClose(); onReplay(item); }} />)}</div>
    </section>
  </div>;
}

function InviteModal({ link, busy, onCreate, onCopy, onClose }: { link: string; busy: boolean; onCreate: () => void; onCopy: () => void; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="modal-header"><div><p className="eyebrow">PRIVATE LEAGUE</p><h2 id="invite-title">Sign-up link</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="invite-illustration"><span>●</span><i>→</i><span>●</span></div>
      <p className="invite-copy">Generate a personal link to create an account in this league. It remains valid for 7 days and can only be used once.</p>
      {link ? <>
        <label className="field"><span>Invitation link</span><input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>
        <button className="primary-button full" onClick={onCopy}>Copy link</button>
        <button className="text-button" onClick={onCreate} disabled={busy}>Create another link</button>
      </> : <button className="primary-button full" onClick={onCreate} disabled={busy}>{busy ? "Generating…" : "Generate sign-up link →"}</button>}
      <div className="invite-safety"><b>One-time use</b><span>Once accepted, the link automatically becomes invalid.</span></div>
    </section>
  </div>;
}

function MatchRow({ match, onReplay, onShare, showFormat = false }: { match: Match; onReplay?: (match: Match) => void; onShare?: (match: Match) => void; showFormat?: boolean }) {
  const redWon = match.red_score > match.blue_score;
  return <article className="match-row">
    <div className={`result-badge ${redWon ? "red-win" : "blue-win"}`}>{redWon ? "R" : "B"}</div>
    <div className="match-teams"><strong>{names(match.red)}</strong><span>vs</span><strong>{names(match.blue)}</strong><small>{relativeDate(match.created_at)}{showFormat ? ` · ${formatOf(match)}` : ""}</small></div>
    <div className="match-score"><span className="red-text">{match.red_score}</span><i>—</i><span className="blue-text">{match.blue_score}</span></div>
    <div className="elo-change">±{match.elo_delta}</div>
    {(onReplay || onShare) && <div className="match-row-actions">
      {onShare && <button className="share-button" onClick={() => onShare(match)} title="Share this result" aria-label="Share this result">↗</button>}
      {onReplay && <button className="replay-button" onClick={() => onReplay(match)} title="Replay this match" aria-label="Replay this match">↻</button>}
    </div>}
  </article>;
}

function MatchModal({ players, lastMatch, draft, setDraft, toggleMember, onClose, onSubmit, busy }: {
  players: Player[];
  lastMatch?: Match;
  draft: typeof emptyDraft;
  setDraft: React.Dispatch<React.SetStateAction<typeof emptyDraft>>;
  toggleMember: (side: "red" | "blue", player: Player) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const visiblePlayers = players.filter((player) => player.name.toLocaleLowerCase("en").includes(search.trim().toLocaleLowerCase("en")));
  const preview = eloPreview(players, draft);
  const format = draft.red.length && draft.blue.length ? `${draft.red.length}v${draft.blue.length}` : "Incomplete";
  const selectedSide = (playerId: string) => draft.red.some((member) => member.id === playerId) ? "red" : draft.blue.some((member) => member.id === playerId) ? "blue" : null;
  const setPosition = (side: "red" | "blue", playerId: string, position: DraftMember["position"]) => setDraft((current) => ({
    ...current,
    [side]: current[side].map((member) => member.id === playerId
      ? { ...member, position }
      : current[side].length === 2 ? { ...member, position: position === "attaquant" ? "defenseur" : "attaquant" } : member),
  }));
  const setWinner = (winner: "red" | "blue") => setDraft((current) => {
    const loser = winner === "red" ? "blue" : "red";
    return { ...current, [`${winner}Score`]: 10, [`${loser}Score`]: current[`${loser}Score`] >= 10 ? 7 : current[`${loser}Score`] };
  });
  return <div className="modal-backdrop match-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal match-modal" onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="match-title">
      <div className="modal-header"><div><p className="eyebrow">NEW MATCH · {format}</p><h2 id="match-title">Who won?</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="winner-shortcuts" aria-label="Choose the winning side">
        <button type="button" className={draft.redScore > draft.blueScore ? "active" : ""} onClick={() => setWinner("red")}><span>●</span> Red won</button>
        <button type="button" className={draft.blueScore > draft.redScore ? "active" : ""} onClick={() => setWinner("blue")}><span>●</span> Blue won</button>
      </div>
      <div className="score-entry">
        <ScoreControl side="red" value={draft.redScore} onChange={(value) => setDraft((d) => ({ ...d, redScore: value }))} />
        <span className="score-separator">—</span>
        <ScoreControl side="blue" value={draft.blueScore} onChange={(value) => setDraft((d) => ({ ...d, blueScore: value }))} />
      </div>
      <div className="match-tools"><label><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for a player…" aria-label="Search for a player" /></label><div className="match-tool-actions">{lastMatch && <button type="button" onClick={() => setDraft(draftFromMatch(lastMatch))}>↻ Last lineup</button>}<button type="button" onClick={() => setDraft(emptyDraft)} disabled={!draft.red.length && !draft.blue.length}>Clear</button><button type="button" onClick={() => setDraft((d) => ({ red: d.blue, blue: d.red, redScore: d.blueScore, blueScore: d.redScore }))}>⇄ Swap</button></div></div>
      <div className="quick-roster">
        <div className="quick-roster-head"><strong>Tap a side to add a player</strong><span>Positions are optimized automatically</span></div>
        <div className="quick-roster-list">{visiblePlayers.map((player) => {
          const side = selectedSide(player.id);
          return <div className={`quick-player ${side ?? ""}`} key={player.id}>
            <div className="player-avatar">{initials(player.name)}</div>
            <div><strong>{player.name}</strong><small>{playerProfile(player)} · A {player.attack_elo} · D {player.defense_elo}</small></div>
            <button type="button" className={side === "red" ? "active" : ""} onClick={() => toggleMember("red", player)} aria-label={`${side === "red" ? "Remove" : "Add"} ${player.name} ${side === "red" ? "from" : "to"} red team`}>R</button>
            <button type="button" className={side === "blue" ? "active" : ""} onClick={() => toggleMember("blue", player)} aria-label={`${side === "blue" ? "Remove" : "Add"} ${player.name} ${side === "blue" ? "from" : "to"} blue team`}>B</button>
          </div>;
        })}</div>
      </div>
      <div className="team-lineups">
        {(["red", "blue"] as const).map((side) => <section key={side} className={`team-lineup ${side}`}>
          <div className="lineup-title"><strong>{side === "red" ? "Red" : "Blue"} positions</strong><span>{draft[side].length ? `${draft[side].length} player${draft[side].length > 1 ? "s" : ""}` : "Empty"}</span></div>
          {draft[side].length ? <div className="lineup-players">{draft[side].map((member) => {
            const player = players.find((item) => item.id === member.id)!;
            return <div className="lineup-player" key={member.id}>
              <div><strong>{player.name}</strong><small>{member.position === "attaquant" ? player.attack_elo : player.defense_elo} position Elo</small></div>
              <div className="position-toggle" aria-label={`${player.name} position`}>
                <button type="button" className={member.position === "defenseur" ? "active" : ""} onClick={() => setPosition(side, member.id, "defenseur")} title="Defender">D</button>
                <button type="button" className={member.position === "attaquant" ? "active" : ""} onClick={() => setPosition(side, member.id, "attaquant")} title="Attacker">A</button>
              </div>
            </div>;
          })}</div> : <p className="lineup-empty">Choose a player above</p>}
        </section>)}
      </div>
      <div className="modal-footer"><p>{preview ? <><b>Estimated impact: ±{preview.delta} Elo</b><span>{preview.message}</span></> : <>Select both teams to preview the Elo impact.</>}</p><button className="primary-button" disabled={busy || !draft.red.length || !draft.blue.length || draft.redScore === draft.blueScore}>{busy ? "Saving…" : "Confirm match →"}</button></div>
    </form>
  </div>;
}

function ScoreControl({ side, value, onChange }: { side: "red" | "blue"; value: number; onChange: (value: number) => void }) {
  const label = side === "red" ? "RED" : "BLUE";
  return <div className={`score-side ${side}-side`}><span>{label}</span><div><button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Remove one point from the ${label.toLowerCase()} team`}>−</button><input aria-label={`${label.toLowerCase()} score`} type="number" min="0" max="99" value={value} onChange={(event) => onChange(Math.max(0, Math.min(99, Number(event.target.value))))} /><button type="button" onClick={() => onChange(Math.min(99, value + 1))} aria-label={`Add one point to the ${label.toLowerCase()} team`}>＋</button></div></div>;
}

function PlayerModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal player-modal" onSubmit={onSubmit}>
      <div className="modal-header"><div><p className="eyebrow">THE LEAGUE</p><h2>Add a coworker</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <label className="field"><span>First or full name</span><input name="name" autoFocus required minLength={2} maxLength={40} placeholder="e.g. Taylor" /></label>
      <div className="auto-profile-note"><span>↔</span><div><b>Everyone plays both positions</b><p>The Attacker, Defender, or All-rounder profile is assigned automatically based on performance.</p></div></div>
      <button className="primary-button full" disabled={busy}>{busy ? "Adding…" : "Add to the league →"}</button>
    </form>
  </div>;
}

function PasswordModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal player-modal" method="post" action="/api/auth/password" onSubmit={onSubmit}>
      <div className="modal-header"><div><p className="eyebrow">ACCOUNT SECURITY</p><h2>Change password</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="password-fields">
        <label className="field"><span>Current password</span><input name="currentPassword" type="password" autoComplete="current-password" required minLength={10} maxLength={128} /></label>
        <label className="field"><span>New password</span><input name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
        <label className="field"><span>Confirm new password</span><input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
      </div>
      <p className="security-note">Changing your password signs out every other active session.</p>
      <button className="primary-button full" disabled={busy}>{busy ? "Changing…" : "Change password →"}</button>
    </form>
  </div>;
}

function DrawResult({ draw, players, onAgain, onUse }: { draw: Draw; players: Player[]; onAgain: () => void; onUse: () => void }) {
  const team = (side: "red" | "blue") => <div className={`draw-team ${side}`}><div className="draw-team-title"><span>{side === "red" ? "RED" : "BLUE"} TEAM</span><b>{Math.round(draw[side].reduce((sum, m) => { const p = players.find((player) => player.id === m.id)!; return sum + positionalElo(p, m.position); }, 0) / draw[side].length)} position Elo</b></div>{draw[side].map((member) => { const p = players.find((player) => player.id === member.id)!; return <div className="draw-player" key={member.id}><div className="player-avatar">{initials(p.name)}</div><div><strong>{p.name}</strong><small>{positionLabel(member.position)}</small></div><b>{positionalElo(p, member.position)}</b></div>; })}</div>;
  return <div className="draw-result"><div className="balance-badge">{draw.gap} ELO GAP · BALANCED</div>{team("red")}<div className="versus">VS</div>{team("blue")}<div className="draw-actions"><button className="secondary-button" onClick={onAgain}>↻ Redraw</button><button className="primary-button" onClick={onUse}>Use this draw →</button></div></div>;
}

function EmptyState({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span>●</span><p>{text}</p><button onClick={onClick}>{action} →</button></div>;
}

function eloPreview(players: Player[], draft: typeof emptyDraft) {
  if (!draft.red.length || !draft.blue.length || draft.redScore === draft.blueScore) return null;
  const redRating = averageTeamRating(players, draft.red);
  const blueRating = averageTeamRating(players, draft.blue);
  const redWon = draft.redScore > draft.blueScore;
  const delta = calculateEloDelta(redRating, blueRating, redWon);
  const favorite = Math.abs(redRating - blueRating) < 25 ? "Very balanced match" : redRating > blueRating ? "Red starts as favorite" : "Blue starts as favorite";
  return { delta, message: `${favorite} · ${redRating} vs ${blueRating} position Elo` };
}
function formatOf(match: Match) {
  return matchFormat(match.red.length, match.blue.length);
}
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function names(members: Member[]) { return members.map((member) => member.name.split(" ")[0]).join(" & "); }
function draftFromMatch(match: Match): typeof emptyDraft {
  return {
    red: match.red.map((member) => ({ id: member.id, position: member.position })),
    blue: match.blue.map((member) => ({ id: member.id, position: member.position })),
    redScore: 10,
    blueScore: 7,
  };
}
function positionLabel(position: string) { return position === "defenseur" ? "Defender" : position === "attaquant" ? "Attacker" : "All-rounder"; }
function relativeDate(timestamp: number) {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
