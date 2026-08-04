import { addPlayer } from "@/db/foosball";
import { getMemberSession } from "../_session";

export async function POST(request: Request) {
  const member = await getMemberSession();
  if (!member) return Response.json({ error: "Invitation required." }, { status: 403 });
  const body = (await request.json()) as { name?: string; preferredPosition?: string };
  const name = body.name?.trim().replace(/\s+/g, " ");
  if (!name || name.length < 2 || name.length > 40) {
    return Response.json({ error: "Enter a name between 2 and 40 characters." }, { status: 400 });
  }
  const position = ["attaquant", "defenseur", "polyvalent"].includes(body.preferredPosition ?? "")
    ? body.preferredPosition!
    : "polyvalent";
  const player = await addPlayer(name, position);
  return Response.json({ player }, { status: 201 });
}
