import { createInvitation } from "@/db/foosball";
import { getMemberSession } from "../_session";

export async function POST() {
  const member = await getMemberSession();
  if (!member) return Response.json({ error: "Invitation required." }, { status: 403 });
  const invitation = await createInvitation(member.user.username);
  return Response.json(invitation, { status: 201 });
}
