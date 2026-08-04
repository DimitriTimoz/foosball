import { addMatch, type MatchMember } from "@/db/foosball";
import { getMemberSession } from "../_session";

export async function POST(request: Request) {
  const member = await getMemberSession();
  if (!member) return Response.json({ error: "Invitation requise." }, { status: 403 });
  try {
    const body = (await request.json()) as {
      red: MatchMember[];
      blue: MatchMember[];
      redScore: number;
      blueScore: number;
    };
    const match = await addMatch({ ...body, createdBy: member.user.email });
    return Response.json({ match }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Impossible d’enregistrer le match." },
      { status: 400 },
    );
  }
}
