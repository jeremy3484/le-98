import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Préfixes nécessitant une session. */
const PROTECTED_PREFIXES = ["/lobby", "/game", "/join", "/profile"];
/** Pages d'auth dont on éloigne les utilisateurs déjà connectés. */
const AUTH_PAGES = ["/login", "/signup"];

/**
 * Rafraîchit la session Supabase à chaque requête, propage les cookies,
 * et applique la protection des routes (redirige vers /login si nécessaire).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT : ne pas exécuter de code entre createServerClient et getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isAuthPage = AUTH_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Non connecté sur une route protégée → /login?redirect=...
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return redirectWithCookies(url, supabaseResponse);
  }

  // Déjà connecté sur une page d'auth → /lobby
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/lobby";
    url.search = "";
    return redirectWithCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}

/** Crée une redirection en conservant les cookies de session rafraîchis. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}
