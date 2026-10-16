import { redirect } from "next/navigation";
import { getWorkspaceSession } from "../lib/auth/session";

export default async function Home() {
  redirect(await getWorkspaceSession() ? "/research" : "/sign-in");
}
