// ============================================================================
// Edge Function: bewerbertest-abrufen  (v4)
// Oeffentlich (Token-Auth): liefert den Fragenkatalog OHNE Loesungen und setzt
// die Einladung auf 'gestartet'.
// v4: Teil 6 deutlich ausgebaut (m1-m12, 25 Min): zusaetzlich Akquise/Ablehnung,
//     Integritaets-Dilemma, Teamkonflikt, Selbstorganisation, Fuenf-Jahres-Bild.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Firmenname des Mandanten (Phase 2.4) ---------------------------------
// Die Neutralisierung hat den Namen der Referenz ueberall durch den des
// Demo-Mandanten ersetzt. Fuer das Neutralitaets-Gate war das richtig; fuer
// ein mandantenfaehiges Produkt ist ein verdrahteter Firmenname bei jedem
// Mandanten ausser einem falsch — und er stand in Grussformeln, Briefkoepfen
// und im OpenImmo-Feld <firma>, das jedes Portal anzeigt.
//
// Ohne Eintrag liefert diese Funktion einen LEEREN Text, keinen Beispielnamen.
// Die aufrufende Stelle laesst die Zeile dann weg. Eine fehlende Grussformel
// faellt auf; eine falsche nicht.
async function immoFirmenName(db: any, mandant: unknown): Promise<string> {
  if (typeof mandant !== "string" || !mandant) return "";
  const { data } = await db.from("firma_stammdaten")
    .select("firma_name, marken_name")
    .eq("mandant_id", mandant).eq("aktiv", true)
    .order("sortierung", { ascending: true }).limit(1).maybeSingle();
  return String(data?.marken_name || data?.firma_name || "").trim();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonErr(status: number, msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EXPOSE_TEXT = `**Charmante 3-Zimmer-Wohnung in Musterstadt**\n\nSehr geehrter Frau Sommer,\n\ngern stellen wir Ihnen diese lichtdurchflutete Wohnung im Ortsteil Musterdorf vor. Auf 142 m² Wohnfläche erwarten Sie vier großzügige Zimmer, eine sonnige Terasse sowie ein modernes Tageslichtbad. Das Objekt wurde 1997 errichtet und 2021 umfassend saniert.\n\n**Eckdaten:** Kaufpreis 397.000 €, Wohnfläche 124 m², 3 Zimmer, Baujahr 1997, Hausgeld 285 €/Monat.\n\nIm Text oben nennen wir einen Kaufpreis von 379.000 € – sichern Sie sich jetzt Ihren Besichtigungstermin am 30. Februar.`;

const KATALOG = {
  version: 5,
  teile: [
    {
      key: "teil1", titel: "Teil 1 · Sorgfalt: Fehlersuche", minuten: 10, typ: "fehlersuche",
      intro: "Lesen Sie den folgenden Exposé-Entwurf sorgfältig. Listen Sie alle Fehler und Widersprüche auf, die Sie finden (Inhalt, Zahlen, Rechtschreibung). Es sind mehr als drei.",
      text: EXPOSE_TEXT,
      felder: [{ id: "teil1_antwort", typ: "textarea", label: "Gefundene Fehler (einen pro Zeile)" }],
    },
    {
      key: "teil2a", titel: "Teil 2a · Fachwissen", minuten: 8, typ: "mc",
      intro: "Wählen Sie jeweils die beste Antwort. Wenn Sie etwas nicht wissen, ist das kein Ausschlusskriterium – raten Sie nicht wild, sondern wählen Sie die plausibelste Antwort.",
      fragen: [
        { id: "f1", frage: "Ein Ehepaar (Verbraucher) kauft ein Einfamilienhaus. Was gilt seit Ende 2020 für die Maklerprovision?", optionen: { a: "Der Käufer trägt immer die volle Provision", b: "Der Käufer darf höchstens so viel zahlen wie der Verkäufer (Provisionsteilung)", c: "Das Bestellerprinzip: Nur wer beauftragt, zahlt", d: "Die Provision ist gesetzlich auf 3 % gedeckelt" } },
        { id: "f2", frage: "Ein Maklervertrag kommt per E-Mail-Verkehr zustande (Fernabsatz). Was muss der Makler beachten?", optionen: { a: "Nichts, E-Mail-Verträge sind formfrei", b: "Der Kunde hat ein 14-tägiges Widerrufsrecht und muss darüber belehrt werden", c: "Der Vertrag muss notariell beurkundet werden", d: "Es gilt eine 30-tägige Rücktrittsfrist" } },
        { id: "f3", frage: "Immobilienmakler sind Verpflichtete nach dem Geldwäschegesetz. Wann müssen Kaufinteressenten identifiziert werden (Ausweis)?", optionen: { a: "Erst beim Notartermin", b: "Nie, das macht der Notar", c: "Bei ernsthaftem Kaufinteresse, spätestens vor Vertragsabschluss", d: "Nur bei Barzahlung" } },
        { id: "f4", frage: "Wozu dient der Objektnachweis?", optionen: { a: "Er ersetzt den Kaufvertrag", b: "Er dokumentiert die Maklerleistung und sichert den Provisionsanspruch", c: "Er ist eine behördliche Pflichtmeldung", d: "Er dient nur der Statistik" } },
        { id: "f5", frage: "In Abteilung III des Grundbuchs stehen:", optionen: { a: "Eigentümer", b: "Wegerechte und Wohnrechte", c: "Grundschulden und Hypotheken", d: "Flurstücksgrenzen" } },
      ],
    },
    {
      key: "teil2b", titel: "Teil 2b · Textverständnis", minuten: 10, typ: "mc",
      intro: "Hier ist kein Vorwissen nötig – jeder Auszug enthält alles, was Sie zur Beantwortung brauchen. Lesen Sie genau, es kommt auf jedes Wort an.",
      fragen: [
        { id: "t1", auszug: "Lässt sich der Makler sowohl vom Verkäufer als auch vom Käufer eines Einfamilienhauses eine Provision versprechen, ist das nur wirksam, wenn beide Parteien sich in gleicher Höhe verpflichten.", frage: "Der Verkäufer zahlt 2,5 % Provision. Was darf der Makler vom Käufer verlangen?", optionen: { a: "Beliebig viel", b: "Höchstens 3,57 %", c: "Genau 2,5 %", d: "Gar nichts" } },
        { id: "t2", auszug: "Das Widerrufsrecht erlischt vor Fristablauf nur, wenn drei Voraussetzungen zusammen erfüllt sind: Der Makler hat seine Leistung vollständig erbracht, der Kunde hat dem sofortigen Beginn zuvor ausdrücklich zugestimmt UND der Kunde hat bestätigt, dass ihm der damit verbundene Verlust des Widerrufsrechts bekannt ist.", frage: "Der Makler hat mit ausdrücklicher Zustimmung des Kunden sofort begonnen und bereits einen passenden Käufer nachgewiesen. Die Bestätigung über den Verlust des Widerrufsrechts wurde jedoch nie eingeholt. Kann der Kunde noch widerrufen?", optionen: { a: "Nein – die Leistung ist vollständig erbracht", b: "Ja – eine der drei Voraussetzungen fehlt, das Widerrufsrecht besteht fort", c: "Nur innerhalb von 48 Stunden nach dem Nachweis", d: "Nein – die Zustimmung zum sofortigen Beginn genügt" } },
        { id: "t3", auszug: "In Immobilienanzeigen für Verkaufsobjekte sind anzugeben: die Art des Energieausweises (Bedarf oder Verbrauch), der Energiekennwert, der wesentliche Energieträger der Heizung, das Baujahr und die Effizienzklasse.", frage: "Welche Anzeige ist vollständig?", optionen: { a: "Effizienzklasse C, Gasheizung", b: "Verbrauchsausweis, 98 kWh/(m²·a), Gas, Baujahr 1997, Klasse C", c: "Energieausweis liegt vor, Details bei Besichtigung", d: "98 kWh/(m²·a), Klasse C" } },
        { id: "t4", auszug: "Bei der Vermittlung von Wohnraum-Mietverträgen gilt: Die Provision schuldet ausschließlich derjenige, der den Makler beauftragt hat (Bestellerprinzip).", frage: "Frau Peters beauftragt ein Maklerbüro, einen Nachmieter für ihre Wohnung zu finden. Herr Klein mietet die Wohnung. Wer zahlt die Provision?", optionen: { a: "Herr Klein", b: "Frau Peters", c: "Beide je zur Hälfte", d: "Niemand" } },
        { id: "t5", auszug: "Der Makler hat die Vertragsparteien bereits bei ernsthaftem Interesse an der Durchführung des Kaufgeschäfts anhand eines gültigen Ausweisdokuments zu identifizieren.", frage: "Ein Interessent möchte nach der zweiten Besichtigung ein Kaufangebot abgeben, hat aber den Ausweis gerade nicht dabei. Was ist richtig?", optionen: { a: "Angebot trotzdem weiterleiten, Ausweis reicht beim Notar", b: "Identifizierung nachholen, bevor es Richtung Vertrag geht – freundlich, aber verbindlich einfordern", c: "Interessent ablehnen", d: "Der Verkäufer muss identifizieren" } },
      ],
    },
    {
      key: "teil3", titel: "Teil 3 · Rechnen", minuten: 12, typ: "rechnen",
      intro: "Taschenrechner erlaubt. Alle nötigen Prozentsätze stehen in der Aufgabe. Runden Sie auf zwei Nachkommastellen, sofern nichts anderes angegeben ist.",
      aufgaben: [
        { id: "r1", text: "Kaufpreis 385.000 €, Käuferprovision 3,57 % inkl. 19 % MwSt.", felder: [ { id: "r1_brutto", typ: "zahl", label: "Provision brutto (€)" }, { id: "r1_netto", typ: "zahl", label: "Provision netto, ohne MwSt. (€)" } ] },
        { id: "r2", text: "Ein Eigentümer möchte nach Abzug der Innenprovision von 2,38 % (inkl. MwSt.) genau 350.000 € ausgezahlt bekommen. Welchen Kaufpreis müssen Sie mindestens ansetzen? Runden Sie auf volle Euro auf. Achtung: einfach 2,38 % auf 350.000 € aufzuschlagen ist falsch.", felder: [ { id: "r2_gesamt", typ: "zahl", label: "Mindest-Kaufpreis (€)" } ] },
        { id: "r3", text: "Eine vermietete Wohnung kostet 240.000 €, Kaltmiete 850 €/Monat. Bruttomietrendite = Jahreskaltmiete ÷ Kaufpreis.", felder: [ { id: "r3_rendite", typ: "zahl", label: "Bruttomietrendite (%)" }, { id: "r3_einordnung", typ: "text", label: "Ein Satz: Wie würden Sie das einem Kapitalanleger einordnen?" } ] },
      ],
    },
    {
      key: "teil4", titel: "Teil 4 · Situationen aus dem Alltag", minuten: 15, typ: "freitext",
      intro: "Beschreiben Sie in wenigen Sätzen, wie Sie konkret vorgehen würden. Es gibt kein auswendig gelerntes Richtig – uns interessiert Ihre Haltung.",
      fragen: [
        { id: "s1", text: "Ein Interessent möchte morgen unbedingt besichtigen. Der Objektnachweis mit Widerrufsbelehrung ist ihm zugegangen, aber noch nicht unterschrieben. Er sagt: \"Das mache ich später, lassen Sie uns erst mal schauen.\" Wie reagieren Sie?" },
        { id: "s2", text: "Nach dem Versand eines Dokuments an Käufer und Verkäufer entdecken Sie, dass der Vorname der Verkäuferin falsch geschrieben ist. Der Käufer hat bereits unterschrieben. Was tun Sie?" },
        { id: "s3", text: "Eine Eigentümerin nennt Ihnen ihre Preisvorstellung: 80.000 € über Ihrer fundierten Markteinschätzung. Sie merken, dass ein Wettbewerber ihr diesen Preis versprochen hat. Wie gehen Sie vor?" },
      ],
    },
    {
      key: "teil5", titel: "Teil 5 · Kommunikation", minuten: 10, typ: "freitext",
      intro: "Schreiben Sie die E-Mail so, wie Sie sie tatsächlich versenden würden – inklusive Anrede und Gruß.",
      fragen: [
        { id: "k1", text: "Herr Brandt hatte für heute 17 Uhr eine Besichtigung. Der Termin musste wegen Erkrankung des Eigentümers zwei Stunden vorher abgesagt werden. Herr Brandt schreibt verärgert, er habe extra Urlaub genommen und überlege, \"woanders zu kaufen und eine entsprechende Bewertung zu hinterlassen\". Ihre Antwort-E-Mail:" },
      ],
    },
    {
      key: "teil6", titel: "Teil 6 · Motivation, Haltung & Ambition", minuten: 25, typ: "freitext",
      intro: "Hier gibt es kein Richtig oder Falsch und keine Punkte – aber dieser Teil fließt maßgeblich in unsere Entscheidung ein, wen wir zum Gespräch einladen. Oberflächliche Antworten und Bewerbungsfloskeln erkennen wir. Nehmen Sie sich Zeit, antworten Sie ehrlich und konkret – lieber drei ehrliche Sätze als zehn glatte.",
      fragen: [
        { id: "m1", text: "Viele stellen sich den Maklerberuf so vor: Tür aufschließen, Provision kassieren. Was gehört aus Ihrer Sicht wirklich dazu? Nennen Sie die drei mühsamsten Aufgaben, die Sie in diesem Beruf erwarten – und warum Sie ihn trotzdem wollen." },
        { id: "m2", text: "Drei Monate ohne einen einzigen Abschluss, Ihre Fixkosten laufen weiter. Was tun Sie konkret in Woche 1 – und was machen Sie in Woche 12 anders als in Woche 1?" },
        { id: "m3", text: "Bei der Objektaufnahme eines Einfamilienhauses beginnt die Eigentümerin zu weinen – der Verkauf kommt durch eine Trennung. Ihr Mann drängt im selben Termin auf einen schnellen Abschluss. Wie verhalten Sie sich in dieser Situation konkret – was sagen Sie, was sagen Sie bewusst nicht?" },
        { id: "m4", text: "Ihre fundierte Bewertung ergibt: Das Elternhaus eines Eigentümers ist deutlich weniger wert, als er für seine Altersvorsorge fest eingeplant hat. Wie führen Sie dieses Gespräch – vom Einstieg bis zum Abschluss?" },
        { id: "m5", text: "Sie rufen einen privaten Verkäufer an, dessen Inserat Sie entdeckt haben. Er blafft: 'Makler? Sie sind heute der Zehnte. Legen Sie auf.' Was sagen Sie in den nächsten 20 Sekunden – möglichst wörtlich? Und: Wie viele solcher Anrufe halten Sie pro Woche durch?" },
        { id: "m6", text: "Kurz vor dem Notartermin erwähnt der Verkäufer beiläufig einen früheren Feuchtigkeitsschaden im Keller – 'sieht man ja jetzt nicht mehr'. Der Käufer weiß nichts davon. Der Abschluss würde Ihnen eine hohe Provision bringen. Was tun Sie – und was riskieren Sie mit Ihrer Entscheidung, egal wie sie ausfällt?" },
        { id: "m7", text: "Ein Kollege übernimmt 'aus Versehen' einen Interessenten, den Sie seit Wochen betreuen – und macht den Abschluss samt Provision. Wie gehen Sie mit dem Kollegen um, wie mit der Standortleitung – und was, wenn es wieder passiert?" },
        { id: "m8", text: "Als Makler kontrolliert niemand, ob Sie um 9 Uhr am Schreibtisch sitzen – Ihre Zahlen sprechen am Monatsende. Beschreiben Sie Ihre ideale Arbeitswoche von Montag bis Samstag: Wann akquirieren Sie, wann pflegen Sie Daten, wann besichtigen Sie – und woran scheitert so ein Plan bei Ihnen erfahrungsgemäß?" },
        { id: "m9", text: "Beschreiben Sie die letzte wirklich kritische Rückmeldung, die Sie bekommen haben: Worum ging es, wie haben Sie im ersten Moment reagiert – und was haben Sie danach tatsächlich geändert?" },
        { id: "m10", text: "Könnten Sie sich vorstellen, in einigen Jahren eigenständig ein Team oder einen ganzen Standort zu führen? Was bringen Sie dafür heute schon mit – und was fehlt Ihnen ehrlicherweise noch?" },
        { id: "m11", text: "Wo stehen Sie in fünf Jahren, wenn alles gut läuft – und woran merken wir schon nach zwölf Monaten konkret, dass Sie auf dem Weg dorthin sind?" },
        { id: "m12", text: "Abend- und Samstagstermine gehören dazu, das Einkommen schwankt mit der Provision. Wie passt beides zu Ihrer aktuellen Lebensplanung – und wo sehen Sie Ihre persönliche Grenze?" },
      ],
    },
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const token = (body.token || "").trim();
    if (!token) return jsonErr(400, "token fehlt");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: einladung, error } = await admin
      .from("bewerber_einladungen").select("*").eq("token", token).maybeSingle();
    if (error || !einladung) return jsonErr(404, "Dieser Link ist ungültig.");

    if (einladung.status === "widerrufen") return jsonErr(410, "Dieser Link wurde zurückgezogen. Bitte wenden Sie sich an Ihren Ansprechpartner.");
    if (einladung.status === "abgeschlossen") return jsonErr(410, "Der Test wurde bereits abgeschlossen. Vielen Dank!");
    if (einladung.gueltig_bis && new Date(einladung.gueltig_bis) < new Date()) {
      return jsonErr(410, "Dieser Link ist abgelaufen. Bitte wenden Sie sich an Ihren Ansprechpartner.");
    }

    if (einladung.status === "offen") {
      await admin.from("bewerber_einladungen")
        .update({ status: "gestartet", gestartet_am: new Date().toISOString() })
        .eq("id", einladung.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      kandidat: { vorname: einladung.vorname, nachname: einladung.nachname },
      firma: { name: await immoFirmenName(admin, einladung.mandant_id) },
      quereinsteiger: einladung.quereinsteiger,
      katalog: KATALOG,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("bewerbertest-abrufen Fehler:", e);
    return jsonErr(500, e instanceof Error ? e.message : String(e));
  }
});
