import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function getSession() {
  const user = await getChatGPTUser();
  if (user) return { ...user, isDemo: false };
  if (process.env.NODE_ENV !== "production") {
    return {
      displayName: "Alex",
      fullName: "Alex Martin",
      email: "alex@buroball.local",
      isDemo: true,
    };
  }
  return null;
}
