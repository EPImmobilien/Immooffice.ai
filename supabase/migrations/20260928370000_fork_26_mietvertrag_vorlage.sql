-- ===========================================================================
-- Fork-eigene Migration 26 — auch der Mietvertrag bekommt eine eigene Vorlage
--
-- Der Rest von dem, was am 28.09.2026 aufgefallen ist. fillMaklervertrag und
-- fillObjektnachweis holen ihren Inhalt seither aus den markierten Stellen;
-- fillMietvertrag konnte das nicht, weil vertragsvorlagen.art ihn gar nicht
-- kannte. Er suchte deshalb weiter woertliche Saetze aus einem
-- Mustermietvertrag — Vornamen der Mietparteien, deren Strasse, die
-- Anschrift des Objekts, das Kreditinstitut, die Hoehe der Miete.
--
-- Mit dieser Migration ist er eine Vorlagenart wie die anderen vier, und die
-- Anker fallen mit derselben Umstellung weg.
--
-- ZWEI BLOCK-GRUPPEN statt einer: Vermieter UND Mieter koennen Eheleute oder
-- eine Erbengemeinschaft sein — die Tabelle fuehrt fuer beide ein
-- vermieter_erben beziehungsweise mieter_erben. Die Regel "entweder der
-- Block oder die Einzelfelder" gilt je Gruppe, nicht je Dokument; sie traegt
-- das ohne Aenderung.
--
-- KEINE VORGABEWERTE fuer den Mietvertrag. Die Pruefbedingung aus fork_23
-- laesst fuer unbekannte Arten nur '{}' zu, und dabei bleibt es vorerst:
-- welche Werte hier sinnvoll voreinzustellen waeren — Kuendigungsausschluss,
-- Kaution in Monatsmieten —, ist eine fachliche Frage, die niemand gestellt
-- hat. Lieber keine Vorgabe als eine erfundene.
-- ===========================================================================

alter table public.vertragsvorlagen drop constraint if exists vertragsvorlagen_art_check;
alter table public.vertragsvorlagen add constraint vertragsvorlagen_art_check
  check (art in ('maklervertrag', 'vollmacht', 'objektnachweis', 'reservierung',
                 'mietvertrag'));

create or replace function public.vorlagen_feld_katalog(p_art text)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case p_art
    when 'maklervertrag' then '[
      {"feld":"verkaeufer_block","name":"Verkäufer – ganzer Block (auch Gemeinschaften)","gruppe":"verkaeufer","block":true,"mehrzeilig":true},
      {"feld":"verkaeufer_name","name":"Verkäufer – Name","gruppe":"verkaeufer"},
      {"feld":"verkaeufer_vertreter","name":"Verkäufer – vertreten durch","gruppe":"verkaeufer"},
      {"feld":"verkaeufer_strasse","name":"Verkäufer – Straße","gruppe":"verkaeufer"},
      {"feld":"verkaeufer_plz","name":"Verkäufer – PLZ","gruppe":"verkaeufer"},
      {"feld":"verkaeufer_ort","name":"Verkäufer – Ort","gruppe":"verkaeufer"},
      {"feld":"objekt_bezeichnung","name":"Objekt – Bezeichnung","gruppe":"objekt"},
      {"feld":"objekt_adresse","name":"Objekt – Anschrift","gruppe":"objekt","mehrzeilig":true},
      {"feld":"angebotspreis","name":"Angebotspreis","gruppe":"konditionen"},
      {"feld":"laufzeit_monate","name":"Laufzeit (Monate)","gruppe":"konditionen"},
      {"feld":"provision","name":"Provision (%)","gruppe":"konditionen"},
      {"feld":"provisionsmodell","name":"Provisionsmodell","gruppe":"konditionen"},
      {"feld":"firma_name","name":"Eigene Firma – Name","gruppe":"eigene"},
      {"feld":"firma_anschrift","name":"Eigene Firma – Anschrift","gruppe":"eigene","mehrzeilig":true},
      {"feld":"makler_name","name":"Bearbeiter – Name","gruppe":"eigene"},
      {"feld":"datum_heute","name":"Datum","gruppe":"sonstiges"}]'::jsonb
    when 'vollmacht' then '[
      {"feld":"verkaeufer_block","name":"Vollmachtgeber – ganzer Block (auch Gemeinschaften)","gruppe":"verkaeufer","block":true,"mehrzeilig":true},
      {"feld":"verkaeufer_name","name":"Vollmachtgeber – Name","gruppe":"verkaeufer"},
      {"feld":"verkaeufer_strasse","name":"Vollmachtgeber – Straße","gruppe":"verkaeufer"},
      {"feld":"verkaeufer_plz","name":"Vollmachtgeber – PLZ","gruppe":"verkaeufer"},
      {"feld":"verkaeufer_ort","name":"Vollmachtgeber – Ort","gruppe":"verkaeufer"},
      {"feld":"objekt_bezeichnung","name":"Objekt – Bezeichnung","gruppe":"objekt"},
      {"feld":"objekt_adresse","name":"Objekt – Anschrift","gruppe":"objekt","mehrzeilig":true},
      {"feld":"firma_name","name":"Eigene Firma – Name","gruppe":"eigene"},
      {"feld":"datum_heute","name":"Datum","gruppe":"sonstiges"}]'::jsonb
    when 'objektnachweis' then '[
      {"feld":"kaeufer_block","name":"Käufer – ganzer Block (alle Käufer untereinander)","gruppe":"kaeufer","block":true,"mehrzeilig":true},
      {"feld":"k1_name","name":"1. Käufer – Name","gruppe":"kaeufer"},
      {"feld":"k1_anschrift","name":"1. Käufer – Anschrift","gruppe":"kaeufer","mehrzeilig":true},
      {"feld":"k1_geburt","name":"1. Käufer – Geburtsdatum/-ort","gruppe":"kaeufer"},
      {"feld":"k1_ausweis","name":"1. Käufer – Ausweisnummer","gruppe":"kaeufer"},
      {"feld":"k2_name","name":"2. Käufer – Name","gruppe":"kaeufer"},
      {"feld":"k2_anschrift","name":"2. Käufer – Anschrift","gruppe":"kaeufer","mehrzeilig":true},
      {"feld":"k2_geburt","name":"2. Käufer – Geburtsdatum/-ort","gruppe":"kaeufer"},
      {"feld":"k2_ausweis","name":"2. Käufer – Ausweisnummer","gruppe":"kaeufer"},
      {"feld":"objekt_bezeichnung","name":"Objekt – Bezeichnung","gruppe":"objekt"},
      {"feld":"objekt_adresse","name":"Objekt – Anschrift","gruppe":"objekt","mehrzeilig":true},
      {"feld":"kaufpreis","name":"Kaufpreis","gruppe":"konditionen"},
      {"feld":"provision","name":"Käuferprovision (%)","gruppe":"konditionen"},
      {"feld":"angebotsdatum","name":"Datum des Angebots","gruppe":"sonstiges"},
      {"feld":"notar_name","name":"Notar – Name","gruppe":"notar"},
      {"feld":"notar_adresse","name":"Notar – Anschrift","gruppe":"notar","mehrzeilig":true},
      {"feld":"firma_name","name":"Eigene Firma – Name","gruppe":"eigene"},
      {"feld":"makler_name","name":"Bearbeiter – Name","gruppe":"eigene"},
      {"feld":"datum_heute","name":"Datum","gruppe":"sonstiges"}]'::jsonb
    when 'reservierung' then '[
      {"feld":"kaeufer_block","name":"Käufer – ganzer Block (auch Eheleute und Gemeinschaften)","gruppe":"kaeufer","block":true,"mehrzeilig":true},
      {"feld":"kaeufer_name","name":"Käufer – Name","gruppe":"kaeufer"},
      {"feld":"kaeufer_anschrift","name":"Käufer – Anschrift","gruppe":"kaeufer","mehrzeilig":true},
      {"feld":"projektname","name":"Projekt","gruppe":"objekt"},
      {"feld":"wohneinheit_nr","name":"Wohneinheit","gruppe":"objekt"},
      {"feld":"etage","name":"Etage","gruppe":"objekt"},
      {"feld":"wohnflaeche_m2","name":"Wohnfläche (m²)","gruppe":"objekt"},
      {"feld":"objekt_adresse","name":"Objekt – Anschrift","gruppe":"objekt","mehrzeilig":true},
      {"feld":"kaufpreis","name":"Kaufpreis","gruppe":"konditionen"},
      {"feld":"reservierungsgebuehr_brutto","name":"Reservierungsgebühr (€ brutto)","gruppe":"konditionen"},
      {"feld":"reservierungsdauer_bis","name":"Reserviert bis","gruppe":"konditionen"},
      {"feld":"zahlungsfrist_werktage","name":"Zahlungsfrist (Werktage)","gruppe":"konditionen"},
      {"feld":"ort_unterzeichnung","name":"Ort der Unterzeichnung","gruppe":"sonstiges"},
      {"feld":"datum_unterzeichnung","name":"Datum der Unterzeichnung","gruppe":"sonstiges"},
      {"feld":"firma_name","name":"Eigene Firma – Name","gruppe":"eigene"},
      {"feld":"makler_name","name":"Bearbeiter – Name","gruppe":"eigene"}]'::jsonb
    when 'mietvertrag' then '[
      {"feld":"vermieter_block","name":"Vermieter – ganzer Block (auch Gemeinschaften)","gruppe":"vermieter","block":true,"mehrzeilig":true},
      {"feld":"vermieter_name","name":"Vermieter – Name","gruppe":"vermieter"},
      {"feld":"vermieter_strasse","name":"Vermieter – Straße","gruppe":"vermieter"},
      {"feld":"vermieter_plz","name":"Vermieter – PLZ","gruppe":"vermieter"},
      {"feld":"vermieter_ort","name":"Vermieter – Ort","gruppe":"vermieter"},
      {"feld":"mieter_block","name":"Mieter – ganzer Block (auch Eheleute)","gruppe":"mieter","block":true,"mehrzeilig":true},
      {"feld":"mieter_name","name":"Mieter – Name","gruppe":"mieter"},
      {"feld":"mieter_strasse","name":"Mieter – Straße","gruppe":"mieter"},
      {"feld":"mieter_plz","name":"Mieter – PLZ","gruppe":"mieter"},
      {"feld":"mieter_ort","name":"Mieter – Ort","gruppe":"mieter"},
      {"feld":"objekt_adresse","name":"Mietobjekt – Anschrift","gruppe":"objekt","mehrzeilig":true},
      {"feld":"objekt_lage","name":"Mietobjekt – Lage im Haus","gruppe":"objekt"},
      {"feld":"objekt_raeume","name":"Mietobjekt – Räume","gruppe":"objekt","mehrzeilig":true},
      {"feld":"objekt_wohnflaeche","name":"Mietobjekt – Wohnfläche","gruppe":"objekt"},
      {"feld":"objekt_zustand","name":"Mietobjekt – Zustand","gruppe":"objekt"},
      {"feld":"schluessel","name":"Übergebene Schlüssel","gruppe":"objekt","mehrzeilig":true},
      {"feld":"mietbeginn","name":"Mietbeginn","gruppe":"konditionen"},
      {"feld":"kuendigungsausschluss_monate","name":"Kündigungsausschluss (Monate)","gruppe":"konditionen"},
      {"feld":"miete_grundmiete","name":"Grundmiete","gruppe":"konditionen"},
      {"feld":"miete_stellplatz","name":"Stellplatz","gruppe":"konditionen"},
      {"feld":"miete_bk_kalt","name":"Betriebskosten kalt","gruppe":"konditionen"},
      {"feld":"miete_bk_warm","name":"Betriebskosten warm","gruppe":"konditionen"},
      {"feld":"miete_gesamt","name":"Gesamtmiete","gruppe":"konditionen"},
      {"feld":"kaution_betrag","name":"Kaution","gruppe":"konditionen"},
      {"feld":"bank_kontoinhaber","name":"Bank – Kontoinhaber","gruppe":"bank"},
      {"feld":"bank_iban","name":"Bank – IBAN","gruppe":"bank"},
      {"feld":"bank_bic","name":"Bank – BIC","gruppe":"bank"},
      {"feld":"bank_institut","name":"Bank – Kreditinstitut","gruppe":"bank"},
      {"feld":"firma_name","name":"Eigene Firma – Name","gruppe":"eigene"},
      {"feld":"makler_name","name":"Bearbeiter – Name","gruppe":"eigene"},
      {"feld":"datum_heute","name":"Datum","gruppe":"sonstiges"}]'::jsonb
    else '[]'::jsonb
  end
$function$;

comment on function public.vorlagen_feld_katalog(text) is
  'Welche Felder in einer Vorlage dieser Art markiert werden koennen. Jedes '
  'Feld nennt seine Gruppe; das Block-Feld einer Gruppe fasst alle '
  'Beteiligten in einen mehrzeiligen Text. Der Mietvertrag hat zwei solcher '
  'Gruppen — Vermieter und Mieter koennen beide Eheleute sein. Eine Stelle '
  'fuer Oberflaeche und Erzeugung.';

-- --- Wachposten: je Gruppe hoechstens ein Block ---------------------------
-- Zwei Bloecke in derselben Gruppe waeren zwei Stellen fuer dasselbe, und
-- das Entweder-Oder aus fork_25 haette keinen Sinn mehr.
do $$
declare art text; doppelt text;
begin
  foreach art in array array['maklervertrag','vollmacht','objektnachweis',
                             'reservierung','mietvertrag'] loop
    select string_agg(g, ', ') into doppelt from (
      select e->>'gruppe' as g
        from jsonb_array_elements(public.vorlagen_feld_katalog(art)) e
       where coalesce((e->>'block')::boolean, false)
       group by e->>'gruppe' having count(*) > 1) x;
    if doppelt is not null then
      raise exception 'Vorlagenart %: mehr als ein Block in der Gruppe %', art, doppelt;
    end if;
  end loop;
end $$;
