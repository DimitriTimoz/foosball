import { addMatch, initializeDatabase, type MatchMember } from "@/db/foosball";
import { getSession } from "../_session";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const body = (await request.json()) as {
      red: MatchMember[];
      blue: MatchMember[];
      redScore: number;
      blueScore: number;
    };
    await initializeDatabase();
    const match = await addMatch({ ...body, createdBy: user.email });
    return Response.json({ match }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Impossible d’enregistrer le match." },
      { status: 400 },
    );
  }
}
