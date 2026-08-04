import { addMatch, type MatchMember } from "@/db/foosball";
import { getMemberSession } from "../_session";

export async function POST(request: Request) {
  const member = await getMemberSession();
  if (!member) return Response.json({ error: "Invitation required." }, { status: 403 });
  try {
    const body = (await request.json()) as {
      red: MatchMember[];
      blue: MatchMember[];
      redScore: number;
      blueScore: number;
    };
    const match = await addMatch({ ...body, createdBy: member.user.username });
    return Response.json({ match }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save the match." },
      { status: 400 },
    );
  }
}
