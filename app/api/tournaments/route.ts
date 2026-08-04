import {
  addTournamentPlayer,
  createNextTournamentRound,
  createTournament,
  finishTournament,
  getTournament,
  getTournaments,
  recordTournamentMatch,
  removeTournamentPlayer,
} from "@/db/foosball";
import { getMemberSession } from "../_session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member = await getMemberSession();
  if (!member) return Response.json({ error: "Invitation requise." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) return Response.json({ tournament: await getTournament(id) });
    return Response.json({ tournaments: await getTournaments() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Impossible de charger les tournois." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const member = await getMemberSession();
  if (!member) return Response.json({ error: "Invitation requise." }, { status: 403 });
  const body = await request.json() as {
    action?: "create" | "add_player" | "remove_player" | "record_match" | "next_round" | "finish";
    tournamentId?: string;
    tournamentMatchId?: string;
    name?: string;
    playerIds?: string[];
    playerId?: string;
    redScore?: number;
    blueScore?: number;
  };
  try {
    let tournament;
    if (body.action === "create") tournament = await createTournament(body.name ?? "", body.playerIds ?? [], member.user.email);
    else if (body.action === "add_player") tournament = await addTournamentPlayer(body.tournamentId ?? "", body.playerId ?? "");
    else if (body.action === "remove_player") tournament = await removeTournamentPlayer(body.tournamentId ?? "", body.playerId ?? "");
    else if (body.action === "record_match") tournament = await recordTournamentMatch(body.tournamentId ?? "", body.tournamentMatchId ?? "", body.redScore ?? -1, body.blueScore ?? -1, member.user.email);
    else if (body.action === "next_round") tournament = await createNextTournamentRound(body.tournamentId ?? "");
    else if (body.action === "finish") tournament = await finishTournament(body.tournamentId ?? "");
    else throw new Error("Cette action de tournoi est inconnue.");
    return Response.json({ tournament });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Impossible de mettre à jour le tournoi." }, { status: 400 });
  }
}
