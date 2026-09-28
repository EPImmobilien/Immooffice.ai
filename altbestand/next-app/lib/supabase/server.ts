import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseUmgebung } from "./umgebung";

/**
 * Supabase-Client fuer Server Components, Server Actions und Route Handler.
 *
 * Die Sitzung liegt in HttpOnly-Cookies. In Server Components sind Cookies
 * schreibgeschuetzt; das Auffrischen uebernimmt die Middleware. Der Fehler
 * beim Schreiben wird deshalb bewusst verschluckt.
 */
export async function serverClient() {
  const { url, anonKey } = supabaseUmgebung();
  const cookieSpeicher = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieSpeicher.getAll();
      },
      setAll(zuSetzen) {
        try {
          for (const { name, value, options } of zuSetzen) {
            cookieSpeicher.set(name, value, options);
          }
        } catch {
          // Server Component: erwartetes Verhalten, siehe oben.
        }
      },
    },
  });
}
