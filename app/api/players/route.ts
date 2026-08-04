import { addPlayer, initializeDatabase } from "@/db/foosball";
import { getSession } from "../_session";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const body = (await request.json()) as { name?: string; preferredPosition?: string };
  const name = body.name?.trim().replace(/\s+/g, " ");
  if (!name || name.length < 2 || name.length > 40) {
    return Response.json({ error: "Saisissez un nom de 2 à 40 caractères." }, { status: 400 });
  }
  const position = ["attaquant", "defenseur", "polyvalent"].includes(body.preferredPosition ?? "")
    ? body.preferredPosition!
    : "polyvalent";
  await initializeDatabase();
  const player = await addPlayer(name, position);
  return Response.json({ player }, { status: 201 });
}
