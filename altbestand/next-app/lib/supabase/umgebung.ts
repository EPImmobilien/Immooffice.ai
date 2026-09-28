/**
 * Zugriff auf die Supabase-Umgebungsvariablen mit klarer Fehlermeldung.
 *
 * Ohne diese Pruefung scheitert die Anwendung erst tief im Supabase-Client mit
 * einer schwer zuzuordnenden Meldung. Fehlt eine Variable, soll sofort
 * erkennbar sein, welche.
 */
function pflicht(name: string, wert: string | undefined): string {
  if (!wert || wert.trim() === "") {
    throw new Error(
      `Umgebungsvariable ${name} fehlt. Siehe .env.example und DEPLOYMENT_NETLIFY.md.`,
    );
  }
  return wert;
}

export function supabaseUmgebung() {
  // Punktnotation ist hier zwingend: Next ersetzt NEXT_PUBLIC_-Variablen zur
  // Bauzeit nur bei `process.env.NAME`, nicht bei `process.env["NAME"]`. Mit
  // Klammerzugriff bleibt der Wert in der Edge-Laufzeit leer — die Middleware
  // scheitert dann bei jeder Anfrage mit HTTP 500.
  return {
    url: pflicht(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    anonKey: pflicht(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}
