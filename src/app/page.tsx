import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const cookieStore = await cookies();
  const sessionCookie =
    cookieStore.get('appwrite-session') ??
    cookieStore.getAll().find((cookie) => cookie.name.startsWith('a_session_'));

  redirect(sessionCookie ? '/dashboard' : '/login');
}