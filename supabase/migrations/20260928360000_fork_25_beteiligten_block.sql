-- ===========================================================================
-- Fork-eigene Migration 25 — mehrere Beteiligte in einem markierten Feld
--
-- FRAGE vom 28.09.2026: "Was machen wir eigentlich, wenn es zum Beispiel eine
-- Gemeinschaft ist, wo wir mehrere Kontaktadressen eintragen muessen?"
--
-- Ein markiertes Rechteck ist EIN Platz. Wie viele Erben ein Vertrag hat,
-- weiss beim Markieren niemand. Die Vorlage hat darauf laengst eine Antwort,
-- und sie ist die richtige: buildVerkaeuferBlock() setzt aus N Beteiligten
-- EINEN mehrzeiligen Textblock zusammen —
--
--     Erbengemeinschaft
--
--     Erbe 1: <Name>
--     <Strasse>
--     <PLZ Ort>
--
--     Erbe 2: <Name>
--     ...
--
-- — und der steht an einer Stelle im Dokument. Genauso bei Eheleuten
-- ("Eheleute" + gemeinsamer Name) und bei einer Firma ("vertreten durch",
-- Registernummer).
--
-- FOLGE FUER DIE MARKIERUNG: Ein markiertes Feld ist nicht "der Name",
-- sondern "der Block". Deshalb bekommt der Katalog je Dokumentart ein
-- Block-Feld, und jedes Feld sagt, zu welcher GRUPPE es gehoert und ob es
-- der Block dieser Gruppe ist.
--
-- ENTWEDER-ODER: Wer den Block markiert, markiert nicht zusaetzlich die
-- Einzelfelder derselben Gruppe. Beides zusammen stuende doppelt im
-- Dokument, und welches gewaenne, waere Zufall. Der Wachposten weist es ab.
--
-- UEBERLAUF, jetzt ernsthaft: Die Entscheidung vom 28.09.2026 lautet
-- "Schrift verkleinern, bis es passt". Bei fuenf Erben in einem Kasten fuer
-- einen Namen fuehrt das zu Unlesbarkeit. Deshalb eine UNTERGRENZE: bis
-- dahin wird verkleinert, darunter wandert der Rest auf eine Anlage, und im
-- Kasten steht ein Verweis. Abgeschnitten wird nie — ein fehlender
-- Beteiligter in einem Vertrag ist ein Rechtsmangel, keine Schoenheitsfrage.
-- Im Word stellt sich die Frage nicht: dort flieszt der Text um.
-- ===========================================================================

alter table public.vorlagen_felder
  add column if not exists mindest_schriftgroesse numeric(5,2) not null default 7;

alter table public.vorlagen_felder drop constraint if exists vorlagen_felder_mindestgroesse_check;
alter table public.vorlagen_felder add constraint vorlagen_felder_mindestgroesse_check
  check (mindest_schriftgroesse >= 5 and mindest_schriftgroesse <= schriftgroesse);

comment on column public.vorlagen_felder.mindest_schriftgroesse is
  'Bis hierher wird verkleinert, wenn der Wert nicht ins Rechteck passt. '
  'Reicht auch das nicht, wandert der Rest auf eine Anlage und im Kasten '
  'steht ein Verweis. Abgeschnitten wird nie.';

-- --- Der Katalog kennt jetzt Gruppen und Bloecke ---------------------------
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
    else '[]'::jsonb
  end
$function$;

comment on function public.vorlagen_feld_katalog(text) is
  'Welche Felder in einer Vorlage dieser Art markiert werden koennen. Jedes '
  'Feld nennt seine Gruppe; das Block-Feld einer Gruppe fasst alle '
  'Beteiligten in einen mehrzeiligen Text (Eheleute, Erbengemeinschaft, '
  'Firma mit Vertreter). Eine Stelle fuer Oberflaeche und Erzeugung.';

-- --- Der Wachposten prueft jetzt auch das Entweder-Oder ---------------------
create or replace function public.vorlagen_feld_bekannt()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  art_der_vorlage text;
  mandant_der_vorlage uuid;
  eintrag jsonb;
  ist_block boolean;
  meine_gruppe text;
  streit text;
begin
  select art, mandant_id into art_der_vorlage, mandant_der_vorlage
    from public.vertragsvorlagen where id = new.vorlage_id;
  if art_der_vorlage is null then
    raise exception 'Die Vorlage % gibt es nicht.', new.vorlage_id;
  end if;
  if mandant_der_vorlage is distinct from new.mandant_id then
    raise exception 'Die Vorlage gehoert einem anderen Mandanten.'
      using errcode = '42501';
  end if;

  select e into eintrag
    from jsonb_array_elements(public.vorlagen_feld_katalog(art_der_vorlage)) e
   where e->>'feld' = new.feld;
  if eintrag is null then
    raise exception 'Das Feld "%" kennt eine Vorlage der Art "%" nicht.',
      new.feld, art_der_vorlage;
  end if;

  ist_block := coalesce((eintrag->>'block')::boolean, false);
  meine_gruppe := eintrag->>'gruppe';

  -- Entweder der Block einer Gruppe oder ihre Einzelfelder. Beides zusammen
  -- stuende doppelt im Dokument, und welches gewaenne, waere Zufall.
  if meine_gruppe is not null then
    select string_agg(f.feld, ', ') into streit
      from public.vorlagen_felder f
      join jsonb_array_elements(public.vorlagen_feld_katalog(art_der_vorlage)) e
        on e->>'feld' = f.feld
     where f.vorlage_id = new.vorlage_id
       and f.id is distinct from new.id
       and e->>'gruppe' = meine_gruppe
       and coalesce((e->>'block')::boolean, false) <> ist_block;
    if streit is not null then
      if ist_block then
        raise exception 'Fuer diese Gruppe sind schon Einzelfelder markiert (%). '
          'Entweder der Block oder die Einzelfelder.', streit;
      else
        raise exception 'Fuer diese Gruppe ist schon der Block markiert (%). '
          'Entweder der Block oder die Einzelfelder.', streit;
      end if;
    end if;
  end if;

  return new;
end
$function$;
