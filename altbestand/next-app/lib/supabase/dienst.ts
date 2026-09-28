import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseUmgebung } from "./umgebung";

/**
 * Client mit Dienstrolle — UMGEHT SAEMTLICHE ROW-LEVEL-SECURITY.
 *
 * Nur an drei Stellen zulaessig (ARCHITECTURE.md, Abschnitt 5):
 * Benutzereinladung, Stripe-Webhooks, Job-Worker.
 *
 * Der Import von `server-only` laesst den Build fehlschlagen, sobald diese
 * Datei aus einer Client-Komponente eingebunden wird. Das ist Absicht: Ein
 * versehentlicher Import wuerde den Dienstschluessel an den Browser ausliefern.
 */
export function dienstClient() {
  const { url } = supabaseUmgebung();
  const schluessel = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!schluessel) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY fehlt. Nur serverseitig setzen, niemals im Client.",
    );
  }

  return createClient(url, schluessel, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
