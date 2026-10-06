// Die Demodaten der Prototypen in die Felder des Baukastens uebersetzen.
//
// Die Prototypen fuehren ihre Beispieldaten in einem flachen dict `D` mit
// eigenen Namen ("objnr", "plz_ort", "ap"). Der Baukasten kennt
// Platzhalter aus dem tatsaechlichen Schema ("objekt.immo_nr",
// "objekt.plz_ort", "ansprechpartner.name"). Diese Uebersetzung ist
// Pruefgeruest, kein Produktbestandteil: im Betrieb kommen die Werte aus
// der Datenbank.
//
// Wo ein Prototyp einen Wert FERTIG FORMATIERT fuehrt ("148 m²",
// "589.000 €"), wird hier der Rohwert eingesetzt und die Formatierung dem
// Renderer ueberlassen — sonst prueft der Vergleich die Formatierung nicht
// mit.

function rohzahl(s) {
  if (typeof s === 'number') return s;
  if (typeof s !== 'string') return undefined;
  const t = s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function raster(D) {
  const ap = D.ap || {};
  return {
    // Der Prototyp setzt unter den Markennamen das feste Wort
    // "Immobilien". In der Vorlage steht dafuer jetzt die Markenlinie des
    // Mandanten: ein Sachverstaendigenbuero ist kein Immobilienmakler.
    'firma.linie': 'Immobilien',
    // Das Logo. Der Prototyp malt an dieser Stelle einen Platzhalter
    // (gerundetes Quadrat mit Haussymbol); im Produkt steht dort die Datei
    // aus branding-assets.
    'firma.logo.hell': 'logo-hell',
    'firma.logo.dunkel': 'logo-dunkel',
    // Bildunterschriften. Im Prototyp stehen sie fest im Zeichencode, in
    // der Vorlage stand bis zum 06.10.2026 dasselbe — eine Vorlage, die
    // "Wohnbereich" unter ein Foto schreibt, behauptet etwas ueber ein
    // Bild, das sie nie gesehen hat. Jetzt kommen sie aus
    // immobilie_datei.titel; hier stehen die des Prototyps, damit der
    // Vergleich dieselben Worte an derselben Stelle findet.
    'objekt.hauptbild_url.titel': 'Titelbild',
    'bild.foto.1.titel': 'Wohnbereich',
    'bild.foto.2.titel': 'Außenansicht',
    'bild.foto.3.titel': 'Küche / Essbereich',
    'firma.name': D.firma,
    'firma.marken_name': D.firma_kurz,
    'firma.adresse': D.firma_adr,
    'firma.telefon': D.firma_tel,
    'firma.email': D.firma_mail,
    'firma.web': D.firma_web,
    'firma.impressum_zeile': D.hrb,

    'objekt.immo_nr': D.objnr,
    'objekt.objektart': D.objektart,
    'objekt.vertragsart': D.vermarktung,
    // Der Schluessel, auf den die Kostenseite prueft. Im Betrieb
    // rechnet ihn aufbereiten.ts aus immobilien.vertragsart aus.
    'objekt.vermarktung': 'kauf',
    'objekt.objekttitel': D.titel,
    'objekt.expose_slogan': D.slogan,
    'objekt.adresse': D.adresse,
    'objekt.plz_ort': D.plz_ort,
    'objekt.ortsteil': D.ortsteil,
    'objekt.preis': D.preis,
    'objekt.provision_aussen': D.provision,
    'objekt.hausgeld': rohzahl(D.hausgeld),
    'objekt.wohnflaeche': rohzahl(D.wohnflaeche),
    'objekt.nutzflaeche': rohzahl(D.nutzflaeche),
    'objekt.grundstueck': rohzahl(D.grundstueck),
    'objekt.zimmer': rohzahl(D.zimmer),
    'objekt.schlafzimmer': rohzahl(D.schlafzimmer),
    'objekt.badezimmer': rohzahl(D.baeder),
    'objekt.etagen_gesamt': rohzahl(D.etagen),
    'objekt.baujahr': rohzahl(D.baujahr),
    'objekt.modernisierung_jahr': rohzahl(D.modernisierung),
    'objekt.zustand': D.zustand,
    'objekt.stellplatz': D.stellplatz,
    'objekt.verfuegbar_ab': D.verfuegbar,
    'objekt.heizungsart': D.heizung,
    'objekt.energie_traeger': D.traeger,
    'objekt.energieausweis_typ': D.ausweis,
    'objekt.energie_kennwert': D.kennwert,
    'objekt.energie_klasse': D.klasse,
    'objekt.energie_gueltig_kurz': D.gueltig,
    'objekt.unterkellert': D.keller,
    'objekt.beschreibung_objekt': D.beschreibung,
    'objekt.beschreibung_lage': D.lage,
    'objekt.beschreibung_ausstattung_expose': (D.ausstattung || []).join('\n'),
    'objekt.expose_highlights': (D.highlights || []).map(([titel, text]) => ({ titel, text })),
    'objekt.lage_distanzen': (D.distanzen || []).map(([ziel, km]) => ({ ziel, km })),
    'objekt.raumaufteilung': []
      .concat((D.raeume_eg || []).map(([name, flaeche]) => ({ name, flaeche, ebene: 'eg' })))
      .concat((D.raeume_og || []).map(([name, flaeche]) => ({ name, flaeche, ebene: 'og' }))),
    'objekt.angebotspreis': D.kaufpreis,
    'objekt.grunderwerbsteuer_satz': D.grest,
    'objekt.expose_qr_url': 'https://' + String(D.firma_web || '') + '/expose/' + String(D.objnr || ''),

    'objekt.expose_energie_hinweis':
      'Durch Wärmepumpe und Photovoltaik mit Speicher wird ein großer Teil des '
      + 'Strombedarfs selbst erzeugt. Der vollständige Energieausweis liegt zur '
      + 'Besichtigung vor.',
    'objekt.laufende_kosten': [
      { name: 'Grundsteuer', betrag: 38 },
      { name: 'Gebäudeversicherung', betrag: 54 },
      { name: 'Strom (nach PV)', betrag: 65 },
      { name: 'Wasser / Abwasser', betrag: 48 },
    ],
    'objekt.stellplatz': D.stellplatz,

    // Die Rechnung: der Prototyp rechnet sie im Satz, die Edge Function
    // wird sie in rechnen.ts rechnen. Fuer den Vergleich stehen hier
    // dieselben Formeln — nicht dieselben Zahlen, damit ein Fehler in der
    // Rechnung nicht mit abgeschrieben wird.
    ...(() => {
      const kp = Number(D.kaufpreis);
      const grest = kp * Number(D.grest) / 100;
      const notar = kp * Number(D.notar) / 100;
      const court = kp * Number(D.courtage) / 100;
      const gesamt = kp + grest + notar + court;
      const ek = gesamt * Number(D.ek) / 100;
      const darlehen = gesamt - ek;
      const zahl = (v, n) => v.toFixed(n).replace('.', ',');
      return {
        'rechnung.kaufpreis': kp,
        'rechnung.grunderwerbsteuer': grest,
        'rechnung.grunderwerbsteuer_satz': Number(D.grest),
        'rechnung.notar': notar,
        'rechnung.notar_satz': Number(D.notar),
        'rechnung.courtage': court,
        'rechnung.courtage_satz': zahl(Number(D.courtage), 2) + ' %',
        'rechnung.gesamtaufwand': gesamt,
        'rechnung.eigenkapital_prozent': Number(D.ek),
        'rechnung.eigenkapital': ek,
        'rechnung.darlehen': darlehen,
        'rechnung.zinssatz': Number(D.zins),
        'rechnung.tilgung': Number(D.tilgung),
        'rechnung.monatsrate': darlehen * (Number(D.zins) + Number(D.tilgung)) / 100 / 12,
        'rechnung.laufende_summe': 38 + 54 + 65 + 48,
      };
    })(),

    'ansprechpartner.name': ap.name,
    'ansprechpartner.funktion': ap.rolle,
    'ansprechpartner.telefon': ap.tel,
    'ansprechpartner.mobil': ap.mobil,
    'ansprechpartner.email': ap.mail,
  };
}

function studio(D) {
  const ap = D.ap || {};
  const kp = Number(D.kaufpreis);
  const grest = kp * Number(D.grest) / 100;
  const notar = kp * Number(D.notar) / 100;
  const court = kp * Number(D.courtage) / 100;
  const gesamt = kp + grest + notar + court;
  const zahl = (v, n) => v.toFixed(n).replace('.', ',');
  const eck = (D.eck || []).map(([wert, einheit, label]) => ({ label, wert, einheit }));
  return {
    // Siehe raster: "Immobilien" ist die Markenlinie des Mandanten.
    'firma.linie': 'Immobilien',
    'firma.logo.hell': 'logo-hell',
    'firma.logo.dunkel': 'logo-dunkel',
    // Siehe raster: die Unterschrift gehoert ans Bild, nicht in die Vorlage.
    'bild.foto.1.titel': 'Wohnen / Dachterrasse',
    'bild.foto.2.titel': 'Wohnbereich',
    'bild.foto.3.titel': 'Küche',
    'bild.foto.4.titel': 'Bad',
    'bild.foto.5.titel': 'Bad / Detail',
    'firma.name': D.firma,
    'firma.marken_name': D.marke,
    'firma.adresse': D.firma_adr,
    'firma.telefon': D.firma_tel,
    'firma.email': D.firma_mail,
    'firma.web': D.firma_web,
    'firma.impressum_zeile': D.hrb,

    'objekt.immo_nr': D.objnr,
    'objekt.objektart': D.objektart,
    'objekt.vertragsart': D.vermarktung,
    // Der Schluessel, auf den die Kostenseite prueft. Im Betrieb
    // rechnet ihn aufbereiten.ts aus immobilien.vertragsart aus.
    'objekt.vermarktung': 'kauf',
    // Der Prototyp fuehrt den Titel als drei feste Zeilen — die Studio-Vorlage
    // setzt ihn in 78 Punkt, da bricht nichts von selbst sinnvoll um.
    'objekt.expose_titel_text': (D.titel || []).join('\n'),
    'objekt.objekttitel': (D.titel || []).join(' '),
    'objekt.untertitel': D.untertitel,
    'objekt.adresse': D.adresse,
    'objekt.plz_ort': D.ort,
    'objekt.ort': String(D.ort || '').replace(/^\d+\s+/, ''),
    // "Musterstadt-Hafenviertel" ist Stadt UND Viertel in einem Feld des
    // Prototyps. Der Ortsteil ist der Teil dahinter.
    'objekt.ortsteil': String(D.viertel || '').split('-').pop(),
    'objekt.preis': D.preis,
    'objekt.provision_aussen': D.provision,
    'objekt.hausgeld': rohzahl(D.hausgeld),
    'objekt.angebotspreis': kp,
    'objekt.grunderwerbsteuer_satz': D.grest,
    'objekt.beschreibung_objekt': D.beschreibung,
    'objekt.beschreibung_lage': D.lage,
    'objekt.beschreibung_ausstattung_expose': (D.ausstattung || []).join('\n'),
    'objekt.expose_highlights': (D.highlights || []).map((h) => ({ titel: h })),
    'objekt.expose_wege': (D.wege || []).map(([ziel, fuss, rad, auto]) =>
      ({ ziel, fuss, rad, auto })),
    'objekt.raumaufteilung': (D.raeume || []).map(([name, flaeche]) => ({ name, flaeche })),
    'objekt.miete_ist': D.miete,
    'objekt.hausgeld_nicht_umlagefaehig': D.hg_nu,
    'objekt.expose_qr_url': 'https://' + String(D.firma_web || '') + '/expose/' + String(D.objnr || ''),
    'objekt.eckdaten': eck,
    // Der Studio-Prototyp fuehrt die Einzelwerte nur in `eck` und
    // `fakten`. Hier zurueck in die Felder, aus denen sie im Betrieb
    // kommen.
    'objekt.wohnflaeche': 112,
    'objekt.zimmer': 3,
    'objekt.etage': '4. OG (Dachgeschoss)',
    'objekt.baujahr': 2021,
    'objekt.energie_klasse': 'A+',
    'objekt.schlafzimmer': 2,
    'objekt.zustand': 'neuwertig',
    'objekt.verfuegbar_ab': '01.02.2027',
    'objekt.heizungsart': 'Fernwärme, Fußbodenheizung',
    'objekt.fakten': (D.fakten || []).map(([label, wert]) => ({ label, wert })),
    'objekt.energie_angaben': (D.energie || []).map(([label, wert]) => ({ label, wert })),

    'rechnung.kaufpreis': kp,
    'rechnung.grunderwerbsteuer': grest,
    'rechnung.grunderwerbsteuer_satz': Number(D.grest),
    'rechnung.notar': notar,
    'rechnung.notar_satz': Number(D.notar),
    'rechnung.courtage': court,
    'rechnung.courtage_satz': zahl(Number(D.courtage), 2) + ' %',
    'rechnung.gesamtaufwand': gesamt,
    'rechnung.bruttorendite': (Number(D.miete) * 12) / kp * 100,
    'rechnung.nettorendite': (Number(D.miete) * 12 - Number(D.hg_nu) * 12) / gesamt * 100,
    'rechnung.kaufpreisfaktor': kp / (Number(D.miete) * 12),

    'ansprechpartner.name': ap.name,
    'ansprechpartner.funktion': ap.rolle,
    'ansprechpartner.telefon': ap.tel,
    'ansprechpartner.mobil': ap.mobil,
    'ansprechpartner.email': ap.mail,
  };
}

function signature(D) {
  const ap = D.ap || {};
  const kp = Number(D.kaufpreis);
  const grest = kp * Number(D.grest) / 100;
  const notar = kp * Number(D.notar) / 100;
  const court = kp * Number(D.courtage) / 100;
  const gesamt = kp + grest + notar + court;
  const zahl = (v, n) => v.toFixed(n).replace('.', ',');
  const paare = (liste) => (liste || []).map(([label, wert]) => ({ label, wert }));
  return {
    'firma.logo.hell': 'logo-hell',
    'firma.logo.dunkel': 'logo-dunkel',
    // Siehe raster: die Unterschrift gehoert ans Bild, nicht in die Vorlage.
    'bild.foto.1.titel': 'Seeterrasse',
    'bild.foto.2.titel': 'Fassade / Entree',
    'bild.foto.3.titel': 'Wohnsalon mit Seeblick',
    'bild.foto.4.titel': 'Mastersuite',
    'bild.foto.5.titel': 'Spa-Bad',
    'bild.foto.6.titel': 'Küche',
    'firma.name': D.firma,
    'firma.marken_name': D.marke,
    'firma.linie': D.linie,
    'firma.adresse': D.firma_adr,
    'firma.telefon': D.firma_tel,
    'firma.email': D.firma_mail,
    'firma.web': D.firma_web,
    'firma.impressum_zeile': D.hrb,

    'objekt.immo_nr': D.objnr,
    'objekt.objektart': D.objektart,
    'objekt.vertragsart': 'Kauf',
    'objekt.titel_erste_zeile': D.titel1,
    'objekt.titel_zweite_zeile': D.titel2,
    'objekt.objekttitel': D.titel1 + ' ' + D.titel2,
    'objekt.untertitel': D.unter,
    'objekt.adresse': D.adresse,
    'objekt.plz_ort': D.ort,
    'objekt.ort': D.ort,
    'objekt.preis': D.preis,
    'objekt.expose_preis_auf_anfrage': D.preis_auf_anfrage,
    'objekt.provision_aussen': D.provision,
    'objekt.wohnflaeche': rohzahl(D.wohnflaeche),
    'objekt.grundstueck': rohzahl(D.grundstueck),
    'objekt.zimmer': rohzahl(D.zimmer),
    'objekt.badezimmer': rohzahl(D.baeder),
    'objekt.baujahr': rohzahl(D.baujahr),
    'objekt.seeufer_meter': rohzahl(D.ufer),
    'objekt.zustand': 'neuwertig',
    'objekt.verfuegbar_ab': 'nach Absprache',
    'objekt.expose_zitat': D.prolog_quote,
    'objekt.expose_prolog': D.prolog,
    // Die Initiale ist der erste Buchstabe, der Rest der Text dahinter.
    // Der Renderer setzt beides als zwei Elemente — nur so kann die
    // Initiale ueber drei Zeilen stehen.
    'objekt.expose_prolog_initiale': String(D.prolog || '').slice(0, 1),
    'objekt.expose_prolog_rest': String(D.prolog || '').slice(1),
    'objekt.beschreibung_objekt': D.beschreibung,
    'objekt.beschreibung_lage': D.lage,
    'objekt.expose_ausstattung_gruppen': (D.ausstattung || [])
      .map(([titel, punkte]) => ({ titel, punkte })),
    'objekt.lage_distanzen': (D.distanzen || []).map(([ziel, wert]) => ({ ziel, wert })),
    'objekt.raumaufteilung': []
      .concat((D.raeume_eg || []).map(([name, flaeche]) => ({ name, flaeche, ebene: 'eg' })))
      .concat((D.raeume_og || []).map(([name, flaeche]) => ({ name, flaeche, ebene: 'og' }))),
    'objekt.fakten': paare(D.details),
    'objekt.energie_angaben': paare(D.energie),
    'objekt.energie_kennwert': D.kennwert,
    'objekt.angebotspreis': kp,
    'objekt.expose_qr_url': 'https://' + String(D.firma_web || '') + '/expose/' + String(D.objnr || ''),

    'rechnung.kaufpreis': kp,
    'rechnung.grunderwerbsteuer': grest,
    'rechnung.grunderwerbsteuer_satz': Number(D.grest),
    'rechnung.notar': notar,
    'rechnung.notar_satz': Number(D.notar),
    'rechnung.courtage': court,
    'rechnung.courtage_satz': zahl(Number(D.courtage), 2) + ' %',
    'rechnung.gesamtaufwand': gesamt,

    'ansprechpartner.name': ap.name,
    'ansprechpartner.funktion': ap.rolle,
    'ansprechpartner.telefon': ap.tel,
    'ansprechpartner.mobil': ap.mobil,
    'ansprechpartner.email': ap.mail,
  };
}

const UEBERSETZER = { raster, studio, signature };

// Texte, die der Prototyp je Objekt schreibt. Im Produkt stehen sie in
// immobilien.expose_overrides; die Vorlage haelt nur einen neutralen
// Vorschlag bereit.
const UEBERNAHMEN = {
  studio: {
    texte: {
      // Die Fussnote der Zahlenseite nennt im Prototyp ein konkretes
      // Hausgeld (95 €/Monat) und behauptet, die Wohnung sei bezugsfrei.
      // Beides sind Angaben zu EINEM Objekt und haben in einer Vorlage
      // nichts zu suchen; die Vorlage sagt jetzt dasselbe ohne Zahlen.
      'zahlen-fussnote':
        '* auf Gesamtaufwand, abzgl. nicht umlagefähigem Hausgeld (95 €/Monat).  '
        + '** Marktmiete laut Mietspiegel-Einschätzung, Wohnung ist bezugsfrei. '
        + 'Alle Werte ohne Gewähr, keine Anlage- oder Steuerberatung.',
    },
  },
  signature: {
    texte: {
      'strecke-text':
        'Der Wohnsalon mit über sechs Meter Raumhöhe öffnet sich über eine '
        + 'rahmenlose Glasfront vollständig zur Seeterrasse. Morgens fällt das '
        + 'Licht über das Wasser bis tief in den Raum, abends spiegeln sich die '
        + 'Ufer im ruhigen See.',
      // Die Unterzeilen am Diptychon: im Prototyp fest, im Produkt eine
      // Bildbeschreibung je Objekt. Die Vorlage haelt nur den Platz.
      'dip-links-zeile': 'Mastersuite  —  mit Loggia über dem Wasser',
      'dip-rechts-zeile': 'Spa-Bad  —  Naturstein & Eiche',
      'diptychon-text':
        'Vier Schlafzimmer, jedes mit eigenem Bad, schaffen private Räume für '
        + 'Familie und Gäste. Die Mastersuite nimmt das gesamte Westende des '
        + 'Obergeschosses ein – mit Ankleide, freistehender Wanne und einer '
        + 'Loggia, von der der Blick ungehindert über den See reicht.',
    },
  },
};

module.exports = {
  daten: (vorlage, D) => UEBERSETZER[vorlage](D),
  uebernahmen: (vorlage) => UEBERNAHMEN[vorlage],
};
