import { addPlayer } from "@/db/foosball";
import { getMemberSession } from "../_session";

export async function POST(request: Request) {
  const member = await getMemberSession();
  if (!member) return Response.json({ error: "Invitation requise." }, { status: 403 });
  const body = (await request.json()) as { name?: string; preferredPosition?: string };
  const name = body.name?.trim().replace(/\s+/g, " ");
  if (!name || name.length < 2 || name.length > 40) {
    return Response.json({ error: "Saisissez un nom de 2 à 40 caractères." }, { status: 400 });
  }
  const position = ["attaquant", "defenseur", "polyvalent"].includes(body.preferredPosition ?? "")
    ? body.preferredPosition!
    : "polyvalent";
  const player = await addPlayer(name, position);
  return Response.json({ player }, { status: 201 });
}
