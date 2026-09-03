/**
 * Geplante Netlify-Funktion: weckt minuetlich den Worker-Endpunkt der
 * Anwendung (ARCHITECTURE.md Abschnitt 3, „pg_cron ruft periodisch den
 * Worker" — hier uebernimmt Netlify den Takt, damit kein Datenbankzugriff
 * auf die Anwendungsadresse noetig ist).
 *
 * Braucht auf Netlify die Umgebungsvariable JOB_GEHEIMNIS (dieselbe wie die
 * Anwendung). `URL` setzt Netlify selbst.
 */
const jobsWorker = async () => {
  const basis = Netlify.env.get("URL") ?? Netlify.env.get("NEXT_PUBLIC_APP_URL");
  const geheimnis = Netlify.env.get("JOB_GEHEIMNIS");
  if (!basis || !geheimnis) {
    console.warn("jobs-worker: URL oder JOB_GEHEIMNIS fehlt — nichts zu tun.");
    return;
  }

  const antwort = await fetch(`${basis.replace(/\/+$/, "")}/api/jobs/ausfuehren`, {
    method: "POST",
    headers: { Authorization: `Bearer ${geheimnis}` },
  });
  const text = await antwort.text();
  console.log(`jobs-worker: HTTP ${antwort.status} ${text.slice(0, 500)}`);
};

export default jobsWorker;

export const config = {
  schedule: "* * * * *",
};
