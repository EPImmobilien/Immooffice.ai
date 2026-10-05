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

    'ansprechpartner.name': ap.name,
    'ansprechpartner.funktion': ap.rolle,
    'ansprechpartner.telefon': ap.tel,
    'ansprechpartner.mobil': ap.mobil,
    'ansprechpartner.email': ap.mail,
  };
}

const UEBERSETZER = { raster };

module.exports = { daten: (vorlage, D) => UEBERSETZER[vorlage](D) };
