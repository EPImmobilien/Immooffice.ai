// ============================================================================
// mietvertrag-pdf — Renderer-Kern (läuft identisch in Deno-Edge-Function
// und im lokalen Node-Test). Layout an die Word-Vorlage angeglichen:
//   - Titel + §-Überschriften zentriert, fett, VERSALIEN (wie berschrift1)
//   - §-Nummern werden fortlaufend erzeugt; die optionale Neubau-Klausel
//     steht davor OHNE Nummer und verschiebt nichts (wie Heading1NotNumbered)
//   - Fließtext 10pt Blocksatz, nummerierte Absätze mit "1. "-Präfix
//   - Logo oben rechts + Seitenzahl "n/m" unten mittig auf jeder Seite
// ============================================================================

const SCHWARZ_RGB = [0.05, 0.05, 0.05];

function sanitizeGlyphs(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/•/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, "\"")
    .replace(/[\u2013\u2014]/g, "-");
}
function asciiFallback(s) {
  return s.replace(/[^\x20-\x7EäöüÄÖÜß€§]/g, "");
}
function formatMoneyDE(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[.\s€]/g, "").replace(",", "."));
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// Anrede/Namens-Block wie in fillMietvertrag (Word-Export)
function parteiZeilen(typ, name, strasse, plz, ort, land, erben) {
  const zeilen = [];
  if (typ === "erben" && Array.isArray(erben) && erben.length > 0) {
    zeilen.push("Erbengemeinschaft");
    erben.forEach((e, i) => {
      zeilen.push("");
      zeilen.push(`Erbe ${i + 1}: ${e.name || ""}`);
      if (e.strasse) zeilen.push(e.strasse);
      const po = `${e.plz || ""} ${e.ort || ""}`.trim();
      if (po) zeilen.push(po);
    });
    const l = (erben[0] && erben[0].land) || land || "Deutschland";
    if (l) zeilen.push(l);
    return zeilen;
  }
  const prefix = typ === "eheleute" ? "Eheleute" : typ === "herr" ? "Herr" : typ === "frau" ? "Frau" : "";
  if (prefix) zeilen.push(prefix);
  if (name) zeilen.push(name);
  if (strasse) zeilen.push(strasse);
  const po = `${plz || ""} ${ort || ""}`.trim();
  if (po) zeilen.push(po);
  if (land) zeilen.push(land);
  return zeilen;
}

// Absatz-Optionen: heading = §-Überschrift (zentriert, fett, Versalien),
// center/right = Ausrichtung, noJustify = linksbündig statt Blocksatz.
function buildMietvertragAbsaetze(v) {
  const a = [];
  let par = 0;
  const H = (titel) => {
    par += 1;
    a.push({ text: `§ ${par} ${titel.toUpperCase()}`, heading: true, spaceBefore: 14, spaceAfter: 8 });
  };

  // ---- Titel + Parteien ----
  a.push({ text: "WOHNRAUMMIETVERTRAG - WOHNUNG IM MEHRFAMILIENHAUS", heading: true, size: 12, spaceAfter: 18 });

  parteiZeilen(v.vermieter_typ, v.vermieter_name, v.vermieter_strasse, v.vermieter_plz, v.vermieter_ort, v.vermieter_land || "Deutschland", v.vermieter_erben)
    .forEach((z) => a.push({ text: z, noJustify: true, spaceAfter: 0 }));
  a.push({ text: "– im Folgenden Vermieter –", right: true, spaceBefore: 4, spaceAfter: 10 });

  parteiZeilen(v.mieter_typ, v.mieter_name, v.mieter_strasse, v.mieter_plz, v.mieter_ort, v.mieter_land || "Deutschland", v.mieter_erben)
    .forEach((z) => a.push({ text: z, noJustify: true, spaceAfter: 0 }));
  a.push({ text: "– im Folgenden Mieter –", right: true, spaceBefore: 4, spaceAfter: 10 });

  // ---- Optionale Neubau-Klausel (unnummeriert, VOR § 1) ----
  if (v.neubau_klausel) {
    a.push({ text: "VORBEHALT MIETBEGINN (NEUBAUVORHABEN)", heading: true, spaceBefore: 14, spaceAfter: 8 });
    a.push({ text: "Neubau-Vorbehalt: Da es sich bei dem Mietobjekt um ein Neubauvorhaben handelt, dessen Fertigstellungstermin von bau- und genehmigungsrechtlichen Umständen abhängt, die der Vermieter nicht vollständig beeinflussen kann, gelten folgende Sonderregelungen:", boldPrefix: "Neubau-Vorbehalt:" });
    a.push({ text: "1. Der Vermieter ist berechtigt, den in § 2 genannten geplanten Mietbeginn zu verschieben, sofern er dem Mieter die Verschiebung mindestens 3 Monate vor dem ursprünglich vereinbarten Einzugsdatum schriftlich mitteilt. Die Mitteilung hat den neuen voraussichtlichen Termin zu enthalten." });
    a.push({ text: "2. Schadensersatzansprüche des Mieters wegen einer Verschiebung des Mietbeginns sind ausgeschlossen, wenn die Verzögerung auf Umstände zurückzuführen ist, die der Vermieter nicht zu vertreten hat (insbesondere: Bauverzögerungen durch Witterung, behördliche Genehmigungsverfahren, Lieferengpässe bei Baumaterialien oder Ausfall von Subunternehmern)." });
    a.push({ text: "3. Die Mietzahlungspflicht und die Pflicht zur Kautionsleistung beginnen in jedem Fall erst mit dem tatsächlichen Übergabedatum, das im Übergabeprotokoll festgehalten wird. Die Kaution ist spätestens 14 Tage vor dem tatsächlichen Übergabetermin zu leisten." });
    a.push({ text: "4. Außerordentliches Kündigungsrecht des Mieters: Teilt der Vermieter eine Verschiebung des Mietbeginns mit einer Frist von weniger als 3 Monaten mit, ist der Mieter berechtigt, diesen Mietvertrag innerhalb von 14 Tagen nach Erhalt der Mitteilung außerordentlich mit sofortiger Wirkung zu kündigen. In diesem Fall sind keine Vertragsstrafen oder Kosten für den Mieter fällig." });
  }

  // ---- § 1 Mietobjekt ----
  const objAdr = `${v.objekt_strasse || ""}, ${v.objekt_plz || ""} ${v.objekt_ort || ""}`.trim();
  H("Mietobjekt");
  a.push({ text: `1. Zur ausschließlichen Benutzung zu Wohnzwecken vermietet der Vermieter dem Mieter die Wohnung im Anwesen ${objAdr} gelegen: ${v.objekt_lage || ""} (nachfolgend als „Mietobjekt“ bezeichnet).` });
  a.push({ text: `Das Mietobjekt besteht aus ${v.objekt_raeume || ""}.`, spaceAfter: 0 });
  a.push({ text: `Die Wohnfläche beträgt ca. ${v.objekt_wohnflaeche || ""} qm.` });
  a.push({ text: `2. Dem Mieter werden bei Einzug folgende Schlüssel übergeben: ${v.schluessel || ""}.`, spaceAfter: 0 });
  a.push({ text: "Die Übergabe der Schlüssel wird gesondert protokolliert. Die Beschaffung weiterer Schlüssel bedarf der vorherigen schriftlichen Zustimmung des Vermieters." });
  a.push({ text: `3. Die Mieter beziehen das Mietobjekt im ${v.objekt_zustand || "Erstbezug"}. Dem Mieter ist der Zustand des Mietobjektes durch vorherige Besichtigung bekannt.` });
  a.push({ text: "4. Der Mieter ist berechtigt, vorhandene gemeinschaftliche Einrichtungen mitzubenutzen. Der Vermieter ist berechtigt, nach billigem Ermessen i.S.v. § 315 BGB aus wichtigem Grund, wie z. B. aufgrund der Anforderungen einer ordnungsgemäßen Bewirtschaftung, Änderungen an den gemeinschaftlichen Einrichtungen vorzunehmen (z. B. diese in einen anderen Raum zu verlegen), soweit eine angemessene Austauschleistung sichergestellt ist." });

  // ---- § 2 Mietzeit ----
  H("Mietzeit / Übergabe / Beendigung");
  if (v.neubau_klausel) {
    a.push({ text: `1. Das Mietverhältnis beginnt voraussichtlich am ${v.mietbeginn || ""} („geplanter Mietbeginn“). Die Übergabe des Mietobjektes an den Mieter erfolgt am tatsächlichen Übergabetag gemäß dem vorstehenden Vorbehalt Mietbeginn (Neubauvorhaben).` });
  } else {
    a.push({ text: `1. Das Mietverhältnis beginnt am ${v.mietbeginn || ""} ("Mietbeginn"). An diesem Tag erfolgt die Übergabe des Mietobjektes an den Mieter.` });
  }
  a.push({ text: "2. Das Mietverhältnis läuft für unbestimmte Zeit und kann nach den gesetzlichen Vorschriften gekündigt werden." });
  a.push({ text: `3. Beide Parteien verzichten für die Dauer von ${v.kuendigungsausschluss_monate || "24"} Monaten, berechnet ab dem Zeitpunkt des Vertragsschlusses, auf ihr Recht zur ordentlichen Kündigung des Mietverhältnisses. Eine ordentliche Kündigung kann daher frühestens - unter Beachtung der gesetzlichen Kündigungsfristen - zum Ablauf dieser Zeit erklärt werden. Das Recht beider Parteien zur außerordentlichen Kündigung bleibt unberührt. Der Mieter kann während der Laufzeit des Kündigungsausschlusses jederzeit unter Beachtung der gesetzlichen Kündigungsfristen seine vorzeitige Entlassung aus dem Mietverhältnis verlangen, wenn er die Wohnung aus wichtigen persönlichen Gründen aufgeben muss. Etwaige Rechte des Vermieters zur Mieterhöhung bestehen auch während der Laufzeit des Kündigungsausschlusses.` });
  a.push({ text: "4. Endet das Mietvertragsverhältnis und setzt der Mieter den Gebrauch der Mietsache nach Ablauf der Mietzeit fort, so verlängert sich das Mietverhältnis nicht stillschweigend auf unbestimmte Zeit. Die Regelung des § 545 BGB findet für Vermieter und Mieter keine Anwendung." });

  // ---- § 3 Betriebskosten ----
  H("Betriebskosten");
  a.push({ text: "1. Der Mieter trägt die kalten und warmen Betriebskosten des Mietobjektes und anteilig für die gemeinschaftlich genutzten Flächen des Anwesens. Bei den damit auf den Mieter übertragenen Kostenarten handelt es sich um die in der Betriebskostenverordnung (§ 1 und § 2 BetrKV, Anlage 2) in ihrer jeweils geltenden Fassung im Einzelnen aufgeführten Kostenarten." });
  a.push({ text: "2. Werden nach Abschluss des Mietvertrages öffentliche Abgaben neu eingeführt oder entstehen neue Betriebskosten i.S.d. §§ 1, 2 BetrKV für das Mietobjekt/Anwesen - z. B. wegen neuer Abgaben der Stadt/Gemeinde, welche in deren Ertragshoheit fallen, wegen des Abschlusses neuer Versicherungen, aufgrund von Modernisierungen oder Erweiterung des Katalogs der BetrKV -, so können diese vom Vermieter im Rahmen der gesetzlichen Vorschriften umgelegt werden." });
  a.push({ text: "3. Die kalten und warmen Betriebskosten sind nicht in der Grundmiete enthalten und werden gesondert im Vorschusswege erhoben.", spaceAfter: 0 });
  a.push({ text: "Ebenfalls nicht in der Miete und nicht in den monatlichen Betriebskostenvorauszahlungen enthalten sind folgende Kosten, die der Mieter selbst und unmittelbar trägt und für welche der Mieter selbst und unmittelbar die entsprechenden Versorgungsverträge abschließt:", spaceAfter: 0 });
  a.push({ text: "- Kabelfernsehgebühren", noJustify: true, spaceAfter: 0 });
  a.push({ text: "- Strom", noJustify: true });
  a.push({ text: "4. Von der Heizkostenverordnung erfasste warme Betriebskosten (Heiz- und Warmwasserkosten) werden entsprechend den dortigen Bestimmungen und den sonstigen gesetzlich zwingenden Vorgaben, insbesondere den Vorgaben gemäß dem CO2KostAufG, umgelegt. Die kalten Betriebskosten werden da es sich bei dem Mietobjekt um vermietetes Wohnungseigentum handelt, nach den auf das Mietobjekt entfallenden Miteigentumsanteilen im Verhältnis zu allen Miteigentumsanteilen umgelegt. Die Umlage der kalten Betriebskosten erfolgt abweichend hiervon nach einem Maßstab, der dem unterschiedlichen Verbrauch oder der unterschiedlichen Verursachung Rechnung trägt, soweit Betriebskosten von einem erfassten Verbrauch oder einer erfassten Verursachung durch den Mieter abhängen. Der Vermieter kann durch einseitige Erklärung in Textform bestimmen, dass die kalten Betriebskosten zukünftig abweichend von der getroffenen Vereinbarung ganz oder teilweise nach einem anderen Maßstab umgelegt werden. Dieses Änderungsrecht greift allein dann ein, wenn aufgrund sachlicher Veränderungen eine i.S.v. §§ 315, 316 BGB angemessene Neuverteilung unter Berücksichtigung der Interessen beider Parteien und der tatsächlichen Umstände erreicht werden soll. Die Erklärung ist nur vor Beginn eines Abrechnungszeitraums zulässig." });
  a.push({ text: "5. Über die monatlichen Vorauszahlungen für die Betriebskosten wird jährlich nach den gesetzlichen Vorschriften abgerechnet. Etwaige Nachzahlungen oder Guthaben sind mit Zugang der Abrechnung fällig und spätestens 30 Tage nach Zugang der Abrechnung auszugleichen. Es besteht kein Anspruch auf eine vorherige Abrechnung; das gilt auch im Falle der Beendigung des Mietverhältnisses im laufenden Abrechnungszeitraum.", spaceAfter: 0 });
  a.push({ text: "Die Betriebskostenvorschüsse bemessen sich nach der jeweiligen Kostenentwicklung des letzten vorherigen Abrechnungszeitraumes. Jede Partei kann nach einer Abrechnung durch Erklärung in Textform eine Anpassung auf eine angemessene Höhe vornehmen. Die geänderte Vorauszahlung ist zum Beginn des Folgemonats geschuldet, wenn der anderen Partei die Erklärung bis zum 15. eines Monats zugeht, sonst mit Beginn des übernächsten Monats." });

  // ---- § 4 Miete ----
  H("Miete");
  const grund = formatMoneyDE(v.miete_grundmiete || "0");
  const stell = v.miete_stellplatz ? formatMoneyDE(v.miete_stellplatz) : null;
  const bkkalt = formatMoneyDE(v.miete_bk_kalt || "0");
  const bkwarm = formatMoneyDE(v.miete_bk_warm || "0");
  let gesamt;
  if (v.miete_gesamt) {
    gesamt = formatMoneyDE(v.miete_gesamt);
  } else {
    const p = (x) => parseFloat(String(x || "0").replace(/\./g, "").replace(",", ".")) || 0;
    gesamt = formatMoneyDE(String((p(v.miete_grundmiete) + p(v.miete_stellplatz) + p(v.miete_bk_kalt) + p(v.miete_bk_warm)).toFixed(2)).replace(".", ","));
  }
  a.push({ text: "Der Mieter zahlt dem Vermieter monatlich", noJustify: true, spaceAfter: 2 });
  a.push({ text: `Grundmiete: ${grund} €`, noJustify: true, spaceAfter: 0 });
  if (stell) a.push({ text: `Stellplatz: ${stell} €`, noJustify: true, spaceAfter: 0 });
  a.push({ text: `Vorauszahlung für kalte Betriebskosten: ${bkkalt} €`, noJustify: true, spaceAfter: 0 });
  a.push({ text: `Vorauszahlung für warme Betriebskosten (Heiz- und Warmwasserkosten): ${bkwarm} €`, noJustify: true, spaceAfter: 2 });
  a.push({ text: "_________________________________________________________________________", noJustify: true, spaceAfter: 2 });
  a.push({ text: `Monatliche Gesamtmiete: ${gesamt} €`, bold: true, noJustify: true });

  // ---- § 5 Zahlung der Miete ----
  H("Zahlung der Miete");
  a.push({ text: "1. Die Gesamtmiete gemäß § 4 ist vom Mieter monatlich ab Beginn der Mietzeit gemäß § 2.1 im Voraus, spätestens bis zum dritten Werktag des Monats auf folgendes Konto zu überweisen:", spaceAfter: 4 });
  a.push({ text: `Kontoinhaber: ${v.bank_kontoinhaber || ""}`, noJustify: true, spaceAfter: 0 });
  a.push({ text: `IBAN: ${v.bank_iban || ""}`, noJustify: true, spaceAfter: 0 });
  a.push({ text: `BIC: ${v.bank_bic || ""}`, noJustify: true, spaceAfter: 0 });
  if (v.bank_institut) a.push({ text: `Kreditinstitut: ${v.bank_institut}`, noJustify: true });
  else a.push({ text: "", noJustify: true, spaceAfter: 0 });
  a.push({ text: "2. Bei Zahlungsverzug des Mieters werden Mahnkosten mit 5 € für jedes Mahnschreiben berechnet, die gesetzlichen Regelungen über Verzugszinsen bleiben hiervon unberührt. Dem Mieter bleibt der Nachweis gestattet, dass aufgrund der verspäteten Zahlung ein Mahnaufwand nicht entstanden oder niedriger ist als die Pauschale. Die Geltendmachung eines höheren Schadens bleibt dem Vermieter unbenommen.", spaceBefore: 4 });

  // ---- § 6 Kaution ----
  H("Kaution");
  a.push({ text: `1. Der Mieter gewährt dem Vermieter zur Absicherung der Erfüllung sämtlicher Forderungen aus dem Mietverhältnis und im Zusammenhang mit dessen Beendigung eine Sicherheit gemäß § 551 BGB in Höhe von ${v.kaution_betrag ? formatMoneyDE(v.kaution_betrag) : ""} €.` });
  a.push({ text: "2. Die Sicherheit ist in bar (ersatzweise bankbestätigte Überweisung) gemäß den Voraussetzungen des § 551 Abs. 2 BGB zu leisten." });

  // ---- § 7 - § 8 ----
  H("Haftung des Vermieters");
  a.push({ text: "Die verschuldensunabhängige Haftung des Vermieters für bei Mietvertragsschluss vorhandene Mängel gemäß § 536a Abs. 1, 1. Alternative BGB ist ausgeschlossen." });
  H("Aufrechnung");
  a.push({ text: "Der Mieter kann mit einer Forderung aufgrund der §§ 536a, 539 BGB oder aus ungerechtfertigter Bereicherung wegen zu viel gezahlter Miete aufrechnen. Mit anderen Ansprüchen kann er nur aufrechnen, soweit sie unbestritten, rechtskräftig festgestellt oder entscheidungsreif sind. Ist die Aufrechnung des Mieters zulässig, muss er sie mindestens einen Monat vor Fälligkeit der Vermieterforderung dem Vermieter anzeigen." });

  // ---- § 9 Benutzung ----
  H("Benutzung des Mietobjekts, Anzeige von Mängeln, Abfallbeseitigung, Tierhaltung");
  a.push({ text: "1. Die Benutzung des Mietobjekts ist nur im Rahmen des vertraglich vereinbarten Zweckes der Nutzung als Wohnung gestattet." });
  a.push({ text: "2. Der Mieter hat das Mietobjekt sowie die gemeinschaftlichen Räume, Einrichtungen und Ausstattungen schonend und pfleglich zu behandeln und ordnungsgemäß zu reinigen. Er hat entsprechend den technischen Gegebenheiten für ausreichende Lüftung und Heizung aller ihm überlassenen Räume zu sorgen." });
  a.push({ text: "3. Sobald der Mieter von einem Mangel des Mietobjektes oder einem Ungezieferbefall Kenntnis erlangt, hat der Mieter dies dem Vermieter unverzüglich anzuzeigen. Dies gilt auch für Maßnahmen, die der Vermieter zum Schutz des Mietobjektes vorsehen muss." });
  a.push({ text: "4. Der Mieter darf Haustiere mit Ausnahme von Kleintieren, wie z. B. Zierfische, Wellensittiche soweit sich die Anzahl der Tiere in den üblichen Grenzen hält, nur mit Zustimmung des Vermieters halten. Die Zustimmung darf nur aus wichtigem Grund versagt bzw. widerrufen werden, z. B. wenn durch die Tiere andere Hausbewohner oder Nachbarn belästigt werden oder eine Beeinträchtigung der Mieter, des Mietobjektes oder des Grundstückes zu befürchten ist." });
  a.push({ text: "5. Soweit für die Abfallbeseitigung getrennte Behälter zur Verfügung gestellt werden, ist der Mieter verpflichtet, diese entsprechend zu benutzen." });

  // ---- § 10 - § 14 ----
  H("Überlassung der Mietsache an Dritte");
  a.push({ text: "Eine Überlassung der Mietsache an Dritte bedarf der vorherigen Zustimmung des Vermieters. Wird die Zustimmung verweigert, hat der Mieter das Recht, das Mietverhältnis außerordentlich mit der gesetzlichen Frist zu kündigen, es sei denn in der Person des Dritten liegt ein wichtiger Grund für die Verweigerung der Erlaubnis vor." });
  a.push({ text: "Entsteht nach Abschluss des Mietvertrags ein berechtigtes Interesse, einen Teil des Wohnraums einem Dritten zu Gebrauch zu überlassen, so kann der Mieter die Zustimmung hierzu verlangen. Der Vermieter darf die Zustimmung verweigern, wenn in der Person des Dritten ein wichtiger Grund vorliegt, der Wohnraum übermäßig belegt würde oder dem Vermieter die Überlassung aus sonstigen Gründen nicht zugemutet werden kann. Die Erlaubnis kann davon abhängig gemacht werden, dass der Mieter sich mit einer angemessenen Erhöhung der Miete einverstanden erklärt, wenn die Überlassung nur durch eine solche Erhöhung dem Vermieter zuzumuten ist." });
  H("Hausordnung");
  a.push({ text: "Der Mieter hat die Bestimmungen der diesem Vertrag als Anlage beigefügten Hausordnung einzuhalten. Der Vermieter ist berechtigt, diese Hausordnung, soweit es für eine ordnungsgemäße Verwaltung und Bewirtschaftung unerlässlich ist, nach billigem Ermessen i.S.v. § 315 BGB zu ändern. Bestimmungen dieses Vertrags können damit nicht geändert werden. Die Gründe für die Änderung sind dem Mieter zugleich mit der neuen Hausordnung mitzuteilen." });
  H("Veränderungen des Mietobjektes durch den Mieter");
  a.push({ text: "Bauliche oder sonstige nachhaltige, den vertragsgemäßen Gebrauch überschreitende Veränderungen an und innerhalb des Mietobjektes oder der darin befindlichen Einrichtungen und Anlagen darf der Mieter ohne Erlaubnis des Vermieters nicht vornehmen. Die Erlaubnis kann davon abhängig gemacht werden, dass der Mieter sich zur völligen oder teilweisen Wiederherstellung des früheren Zustandes im Falle seines Auszugs verpflichtet." });
  H("Schönheitsreparaturen");
  a.push({ text: "Der Mieter ist während der Mietzeit verpflichtet, die laufenden Schönheitsreparaturen innerhalb des Mietobjekts auf eigene Kosten auszuführen, wenn und soweit diese durch den vertragsgemäßen Gebrauch des Mietobjekts durch den Mieter seit Mietbeginn bzw. seit Übergabe, soweit diese nach Mietbeginn erfolgte, erforderlich werden. Diese Verpflichtung wurde von den Parteien bei der Bemessung der Miete durch einen Abschlag zugunsten des Mieters berücksichtigt. Durch die Übertragung dieser Verpflichtung auf den Mieter werden in keinem Fall die Gewährleistungsrechte des Mieters, insbesondere auch nicht das Recht zur Minderung, beschränkt." });
  H("Kleinstreparaturen");
  a.push({ text: "Der Mieter trägt die Kosten der Kleinstreparaturen. Die Obergrenze beträgt pro Reparatur 150 Euro brutto. Übersteigen die Reparaturkosten diese Obergrenze im jeweiligen Einzelfall, sind sie in voller Höhe vom Vermieter zu tragen. Von allen insoweit vom Mieter zu tragenden Reparaturkosten pro Jahr zusammengerechnet, trägt der Mieter maximal Kosten in Höhe von 8% der Jahresgrundmiete (Nettokaltmiete ohne kalte und warme Betriebskosten). Der Jahreszeitraum beginnt jeweils mit dem Mietbeginn bzw. mit dem entsprechenden Tag des Mietbeginns in den Folgejahren. Das Datum der Rechnungsstellung für die Reparatur ist entscheidend. Kleinstreparaturen sind kleine Reparaturen, die während der Mietdauer erforderlich werden. Sie umfassen nur das Beheben kleiner, durch den Mietgebrauch des Mieters schuldhaft verursachter Schäden an Teilen der Mietsache, die dem häufigen Zugriff des Mieters ausgesetzt sind, z. B. an den Installationsgegenständen für Elektrizität, Wasser, Gas, den Heizeinrichtungen, den Fenster-, Fensterschiebetür- und Türverschlüssen (soweit jeweils vorhanden)." });

  // ---- § 15 - § 18 ----
  H("Betreten der Mietsache durch den Vermieter");
  a.push({ text: "1. Der Vermieter oder von ihm Beauftragte - wie z. B. Handwerker, Gutachter, Sachverständige - dürfen das Mietobjekt aus sachlichem Grund und nach rechtzeitiger Ankündigung zu angemessenen Zeiten betreten, soweit berechtigte Belange des Mieters nicht entgegenstehen. Ein sachlicher Grund liegt insbesondere in den Fällen der Überprüfung des Zustandes des Mietobjektes, der Besichtigung oder Behebung von Mängeln und Schäden oder des Ablesens von Messgeräten vor. Im Fall einer dringenden Gefahr (z. B. Brand, Havarie etc.) darf der Vermieter oder von ihm Beauftragte auch ohne vorherige Ankündigung das Mietobjekt betreten." });
  a.push({ text: "2. Will der Vermieter das Mietobjekt verkaufen oder ist das Mietverhältnis gekündigt, so sind der Vermieter oder von ihm Beauftragte auch zusammen mit Kauf- oder Mietinteressenten berechtigt, das Mietobjekt nach Terminvereinbarung mit angemessener Frist und zu angemessenen Zeiten zur Besichtigung zu betreten, soweit berechtigte Belange des Mieters nicht entgegenstehen." });
  H("Beendigung des Mietverhältnisses");
  a.push({ text: "Der Mieter hat das Mietobjekt bei Beendigung der Mietzeit vollständig geräumt, gereinigt und in vertragsgemäßem, sowie renovierten Zustand mit sämtlichen Schlüsseln zurückzugeben." });
  H("Personenmehrheit als Mieter");
  a.push({ text: "1. Haben mehrere Personen - z. B. Ehegatten, Lebenspartner usw. - gemietet, so haften sie für alle Verpflichtungen aus dem Mietverhältnis als Gesamtschuldner." });
  a.push({ text: "2. Willenserklärungen, die das Mietverhältnis betreffen, müssen von oder gegenüber allen Mietern abgegeben werden. Die Mieter bevollmächtigen sich in jederzeit widerruflicher Weise gegenseitig zur Entgegennahme oder Abgabe solcher Erklärungen. Diese Vollmacht gilt auch für die Entgegennahme einer Kündigung, jedoch nicht für den Ausspruch von Kündigungen, die Zustimmung zu einem Mieterhöhungsverlangen, für ein Verlangen auf Fortsetzung des Mietverhältnisses sowie den Abschluss von Mietaufhebungs- und Änderungsverträgen." });
  H("Salvatorische Klausel");
  a.push({ text: "Sollten Vereinbarungen aus diesem Vertrag nebst Anlagen ungültig sein oder werden, so gilt als vereinbart, dass die übrigen in diesem Vertrag getroffenen Regelungen ihre Gültigkeit behalten sollen. Die ungültige Regelung wird sodann durch eine neu zutreffende Vereinbarung ersetzt, die der ursprünglichen Absicht der Mietvertragspartner am ehesten entspricht." });

  // ---- § 19 Vertragsbestandteile ----
  H("Vertragsbestandteile");
  a.push({ text: "Anlagen als Vertragsbestandteile:", noJustify: true, spaceAfter: 0 });
  a.push({ text: "- Hausordnung (Anlage 1)", noJustify: true, spaceAfter: 0 });
  a.push({ text: "- Betriebskostenverordnung (BetrKV, Anlage 2)", noJustify: true });
  a.push({ text: "Ein Energieausweis wird - soweit vorhanden - nicht Bestandteil des Mietvertrages.", spaceAfter: 10 });

  return a;
}

// ============================================================================
// Haupt-Renderer. deps = { PDFDocument, rgb, PageSizes, StandardFonts },
// assets = { fontRegular?, fontBold?, logo? (Uint8Array), fontkit? }
// Rückgabe: { pdfBytes (Uint8Array), dateiname }
// ============================================================================
export async function renderMietvertragPdf(deps, vertrag, assets) {
  const { PDFDocument, rgb, PageSizes, StandardFonts } = deps;
  const SCHWARZ = rgb(SCHWARZ_RGB[0], SCHWARZ_RGB[1], SCHWARZ_RGB[2]);
  const GRAU = rgb(0.45, 0.45, 0.45);

  const pdf = await PDFDocument.create();
  let fontRegular, fontBold;
  let nutztCustomFonts = false;
  if (assets && assets.fontkit && assets.fontRegular && assets.fontBold) {
    try {
      pdf.registerFontkit(assets.fontkit);
      fontRegular = await pdf.embedFont(assets.fontRegular, { subset: false });
      fontBold = await pdf.embedFont(assets.fontBold, { subset: false });
      nutztCustomFonts = true;
    } catch (_e) { /* Fallback unten */ }
  }
  if (!nutztCustomFonts) {
    fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
    fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  }
  let embeddedLogo = null;
  if (assets && assets.logo) {
    try { embeddedLogo = await pdf.embedPng(assets.logo); } catch (_e) { /* optional */ }
  }

  const fix = (s) => sanitizeGlyphs(s);
  const margin = 56;
  const pageWidth = PageSizes.A4[0];
  const pageHeight = PageSizes.A4[1];
  const maxTextWidth = pageWidth - 2 * margin;
  let page;
  let y = 0;

  const zeichneKopf = () => {
    if (!embeddedLogo) return;
    const logoH = 42;
    const logoW = logoH * (embeddedLogo.width / embeddedLogo.height);
    page.drawImage(embeddedLogo, { x: pageWidth - margin - logoW, y: pageHeight - margin - logoH + 14, width: logoW, height: logoH });
  };
  const neueSeite = () => {
    page = pdf.addPage(PageSizes.A4);
    zeichneKopf();
    y = pageHeight - margin - (embeddedLogo ? 52 : 0);
  };
  neueSeite();

  const widthCache = new Map();
  const fontKey = new Map();
  let fontKeyZaehler = 0;
  const sicherBreite = (font, text, size) => {
    try { return font.widthOfTextAtSize(text, size); }
    catch (_e) { return font.widthOfTextAtSize(asciiFallback(text), size); }
  };
  const wortBreite = (font, wort, size) => {
    let fk = fontKey.get(font);
    if (!fk) { fk = String(++fontKeyZaehler); fontKey.set(font, fk); }
    const key = `${fk}|${size}|${wort}`;
    let w = widthCache.get(key);
    if (w === undefined) { w = sicherBreite(font, wort, size); widthCache.set(key, w); }
    return w;
  };
  const wrapWords = (text, font, size, maxWidth) => {
    const words = (text || "").split(/\s+/).filter(Boolean);
    const spaceW = wortBreite(font, " ", size);
    const lines = [];
    let current = [];
    let currentW = 0;
    for (const w of words) {
      const wW = wortBreite(font, w, size);
      if (current.length > 0 && currentW + spaceW + wW > maxWidth) {
        lines.push(current); current = [w]; currentW = wW;
      } else {
        currentW = current.length > 0 ? currentW + spaceW + wW : wW;
        current.push(w);
      }
    }
    if (current.length > 0) lines.push(current);
    return lines;
  };
  const drawTextSicher = (t, x, size, font, color) => {
    try { page.drawText(t, { x, y, size, font, color }); }
    catch (_e) { page.drawText(asciiFallback(t), { x, y, size, font, color }); }
  };

  const drawAbsaetze = (liste) => {
    for (const abs of liste) {
      if (abs.pageBreak) neueSeite();
      if (abs.spaceBefore) y -= abs.spaceBefore;
      const size = abs.size || 10;
      const font = abs.bold || abs.heading ? fontBold : fontRegular;
      const color = SCHWARZ;
      const indent = abs.indent || 0;
      const lineHeight = size * 1.45;
      const textFixed = fix(abs.text);
      const boldPrefix = abs.boldPrefix ? fix(abs.boldPrefix) : null;
      const zeilen = textFixed === "" ? [[]] : wrapWords(textFixed, font, size, maxTextWidth - indent);
      const spaceW = wortBreite(font, " ", size);
      let restBoldWoerter = boldPrefix ? boldPrefix.split(/\s+/).filter(Boolean).length : 0;
      for (let zi = 0; zi < zeilen.length; zi++) {
        const words = zeilen[zi];
        if (y < margin + lineHeight + 20) neueSeite();
        const istLetzteZeile = zi === zeilen.length - 1;
        const zeileText = words.join(" ");
        const zeileBreite = words.reduce((s, w) => s + wortBreite(font, w, size), 0) + spaceW * Math.max(0, words.length - 1);
        const luecke = (maxTextWidth - indent) - zeileBreite;
        if (abs.heading || abs.center) {
          drawTextSicher(zeileText, margin + indent + Math.max(0, luecke / 2), size, font, color);
        } else if (abs.right) {
          drawTextSicher(zeileText, margin + indent + Math.max(0, luecke), size, font, color);
        } else {
          const blocksatz = !abs.noJustify && !istLetzteZeile &&
          words.length > 1 && luecke > 0 && luecke < spaceW * words.length * 3;
          const extra = blocksatz ? luecke / (words.length - 1) : 0;
          let x = margin + indent;
          for (const w of words) {
            const wFont = restBoldWoerter > 0 ? fontBold : font;
            drawTextSicher(w, x, size, wFont, color);
            if (restBoldWoerter > 0) restBoldWoerter -= 1;
            x += wortBreite(font, w, size) + spaceW + extra;
          }
        }
        y -= lineHeight;
      }
      y -= (abs.spaceAfter !== undefined ? abs.spaceAfter : 4);
    }
  };

  const drawUnterschriftZeile = (spalten) => {
    const spaltBreite = (maxTextWidth - 60) / 2;
    const maxLabels = Math.max(...spalten.map((s) => s.length));
    const benoetigt = 60 + maxLabels * 13;
    if (y < margin + benoetigt) neueSeite();
    y -= 50;
    spalten.forEach((labels, i) => {
      const x0 = margin + i * (spaltBreite + 60);
      page.drawLine({ start: { x: x0, y: y }, end: { x: x0 + spaltBreite, y: y }, thickness: 0.8, color: SCHWARZ });
      labels.forEach((l, li) => {
        try { page.drawText(fix(l), { x: x0, y: y - 13 - li * 12, size: 9, font: fontRegular, color: SCHWARZ }); }
        catch (_e) { page.drawText(asciiFallback(fix(l)), { x: x0, y: y - 13 - li * 12, size: 9, font: fontRegular, color: SCHWARZ }); }
      });
    });
    y -= 16 + maxLabels * 12;
  };

  drawAbsaetze(buildMietvertragAbsaetze(vertrag));
  drawUnterschriftZeile([["Ort, Datum", "Vermieter"], ["Ort, Datum", "Mieter"]]);

  // Seitenzahlen "n/m" unten mittig (wie in der Word-Vorlage)
  const seiten = pdf.getPages();
  seiten.forEach((p, i) => {
    const t = `${i + 1}/${seiten.length}`;
    const w = fontRegular.widthOfTextAtSize(t, 9);
    p.drawText(t, { x: (pageWidth - w) / 2, y: 30, size: 9, font: fontRegular, color: GRAU });
  });

  const pdfBytes = await pdf.save();

  const safe = (s) => (s || "").replace(/[^A-Za-z0-9äöüÄÖÜß]+/g, "_").replace(/^_+|_+$/g, "") || "Dokument";
  const vermName = vertrag.vermieter_typ === "erben" && Array.isArray(vertrag.vermieter_erben) && vertrag.vermieter_erben[0] && vertrag.vermieter_erben[0].name ?
  vertrag.vermieter_erben[0].name :
  vertrag.vermieter_name || "Vermieter";
  const dateiname = `Mietvertrag_${safe(vermName)}_${safe(vertrag.objekt_strasse || "Objekt")}.pdf`;

  return { pdfBytes, dateiname };
}
