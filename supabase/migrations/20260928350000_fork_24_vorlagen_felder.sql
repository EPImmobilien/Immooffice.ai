-- ===========================================================================
-- Fork-eigene Migration 24 — markierte Felder in der eigenen Vorlage
--
-- ANWEISUNG vom 28.09.2026: "Koennen wir das so konzipieren, dass die Kunden
-- eine Word- oder eine PDF-Vorlage hochladen und dann in einem gesonderten
-- Feld die Flaechen oder Bereiche markieren, die zu dem jeweiligen
-- Eingabefeld gehoeren?"
--
-- Ja — und den Mechanismus gibt es hier schon einmal: das Signaturverfahren
-- legt in signatur_vorgaenge.unterschrift_positionen genau solche Rechtecke
-- ab (seite, x, y, breite, hoehe) und stempelt die Unterschrift beim
-- Abschluss hinein. Diese Migration verallgemeinert den Gedanken: nicht nur
-- die Unterschrift, sondern jedes Feld; und nicht vom Programm gerechnet,
-- sondern vom Makler markiert.
--
-- ZWEI ZEIGER-ARTEN, weil die beiden Dateiformate verschieden sind:
--
--   rechteck    PDF. Seite und Koordinaten, wie bei der Unterschrift. Der
--               Makler zieht das Rechteck auf der angezeigten Seite auf.
--
--   textstelle  Word. Eine .docx-Datei hat keine Koordinaten, sie ist XML;
--               wo ein Absatz auf der Seite landet, entscheidet erst Word
--               beim Umbrechen. Ein aufgezogenes Rechteck liesse sich nicht
--               auf eine Textstelle zurueckrechnen. Stattdessen markiert der
--               Makler die Stelle im Text — "Dauer von 6 Monaten" — und
--               gespeichert wird der Suchtext samt Nummer des Vorkommens.
--
-- Das zweite ist genau das, was die Erzeugung heute tut. Nur waren die
-- Suchtexte fest auf den Mustervertrag der Referenz verdrahtet, mit Namen,
-- Anschriften und Ausweisnummern echter Vertragsparteien im Quelltext
-- (docs/OFFEN.md). Sie zu Daten zu machen loest beides auf einmal.
--
-- UEBERLAUF: Passt ein Wert nicht in sein Rechteck, wird die Schrift
-- verkleinert, bis er passt (Entscheidung vom 28.09.2026). Deshalb gibt es
-- schriftgroesse als Ausgangswert und keine Abschneide-Einstellung: ein
-- abgeschnittener Wert in einem Vertrag waere schlimmer als eine kleinere
-- Schrift.
-- ===========================================================================

-- --- Welches Format liegt hinter der Vorlage? -----------------------------
alter table public.vertragsvorlagen
  add column if not exists dateiformat text;

alter table public.vertragsvorlagen drop constraint if exists vertragsvorlagen_dateiformat_check;
alter table public.vertragsvorlagen add constraint vertragsvorlagen_dateiformat_check
  check (dateiformat is null or dateiformat in ('docx', 'pdf'));

comment on column public.vertragsvorlagen.dateiformat is
  'docx oder pdf. Entscheidet, welche Zeiger-Art die Felder tragen duerfen: '
  'im PDF ein Rechteck, im Word eine Textstelle.';

-- Bestehende Zeilen stammen alle aus dem Word-Weg.
update public.vertragsvorlagen set dateiformat = 'docx' where dateiformat is null;

-- --- Die markierten Felder ------------------------------------------------
create table if not exists public.vorlagen_felder (
  id             uuid primary key default gen_random_uuid(),
  mandant_id     uuid not null references public.mandanten(id) on delete cascade,
  vorlage_id     uuid not null references public.vertragsvorlagen(id) on delete cascade,
  feld           text not null,
  zeiger_art     text not null,
  -- Rechteck (PDF). Koordinaten in Punkten, Ursprung unten links wie bei
  -- pdf-lib — dieselbe Rechnung wie bei der Unterschrift.
  seite          integer,
  x              numeric(9,2),
  y              numeric(9,2),
  breite         numeric(9,2),
  hoehe          numeric(9,2),
  ausrichtung    text not null default 'links',
  schriftgroesse numeric(5,2) not null default 11,
  -- Textstelle (Word).
  suchtext       text,
  vorkommen      integer not null default 1,
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now(),

  constraint vorlagen_felder_zeiger_check
    check (zeiger_art in ('rechteck', 'textstelle')),
  constraint vorlagen_felder_ausrichtung_check
    check (ausrichtung in ('links', 'mitte', 'rechts')),
  -- Ein Zeiger muss vollstaendig sein. Halbe Angaben waeren ein Feld, das
  -- beim Erzeugen still nichts tut.
  constraint vorlagen_felder_vollstaendig_check check (
    case zeiger_art
      when 'rechteck' then seite is not null and seite >= 0
                       and x is not null and y is not null
                       and breite is not null and breite > 0
                       and hoehe is not null and hoehe > 0
      when 'textstelle' then suchtext is not null and btrim(suchtext) <> ''
                         and vorkommen >= 1
      else false
    end),
  constraint vorlagen_felder_schriftgroesse_check
    check (schriftgroesse >= 4 and schriftgroesse <= 72)
);

-- Ein Feld einmal je Vorlage. Wer es zweimal markiert, hat sich vertan —
-- und beim Erzeugen gewaenne sonst der Zufall.
create unique index if not exists vorlagen_felder_je_vorlage_idx
  on public.vorlagen_felder (vorlage_id, feld);
create index if not exists vorlagen_felder_mandant_idx
  on public.vorlagen_felder (mandant_id);

comment on table public.vorlagen_felder is
  'Wo in der hochgeladenen Vorlage welcher Wert steht. Im PDF ein Rechteck '
  '(Seite und Koordinaten), im Word eine Textstelle (Suchtext und Nummer '
  'des Vorkommens). Gleiche Bauart wie unterschrift_positionen im '
  'Signaturverfahren, nur fuer jedes Feld und vom Makler markiert.';
comment on column public.vorlagen_felder.vorkommen is
  'Das wievielte Vorkommen des Suchtextes gemeint ist. Steht "Musterstadt" '
  'dreimal im Vertrag und nur das zweite ist der Ort der Unterzeichnung, '
  'waere ohne diese Zahl nicht zu sagen, welches.';
comment on column public.vorlagen_felder.schriftgroesse is
  'Ausgangsgroesse beim Stempeln. Passt der Wert nicht ins Rechteck, wird '
  'von hier aus verkleinert, bis er passt — abgeschnitten wird nie.';

-- --- Mandantentrennung, gleiche Bauart wie fork_07 -------------------------
alter table public.vorlagen_felder
  alter column mandant_id set default public.aktuelle_mandant_id();

alter table public.vorlagen_felder enable row level security;

drop policy if exists "vorlagen_felder_lesen" on public.vorlagen_felder;
create policy "vorlagen_felder_lesen" on public.vorlagen_felder
  for select to authenticated using (true);

-- Aendern darf, wer auch die Vorlage hochladen darf.
drop policy if exists "vorlagen_felder_pflegen" on public.vorlagen_felder;
create policy "vorlagen_felder_pflegen" on public.vorlagen_felder
  for all to authenticated
  using (public.hat_recht('admin')) with check (public.hat_recht('admin'));

drop policy if exists "mandant_trennung" on public.vorlagen_felder;
create policy "mandant_trennung" on public.vorlagen_felder
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

insert into public.mandanten_einstufung (tabelle, gruppe, grund)
values ('vorlagen_felder', 'MANDANT', 'Markierte Felder in den eigenen Vorlagen')
on conflict (tabelle) do nothing;

-- Der Mandant kommt von der Vorlage, wie bei allem anderen seit fork_22.
drop trigger if exists mandant_aus_eltern on public.vorlagen_felder;
create trigger mandant_aus_eltern before insert on public.vorlagen_felder
  for each row execute function public.mandant_aus_eltern('vorlage_id', 'vertragsvorlagen');

-- --- Welche Felder es je Dokumentart ueberhaupt gibt ------------------------
-- An einer Stelle, weil zwei Stellen auseinanderlaufen: die Oberflaeche
-- bietet sie zur Auswahl an, die Erzeugung fuellt sie. Die Namen sind die
-- Spalten der jeweiligen Tabelle — nachgesehen, nicht erfunden.
create or replace function public.vorlagen_feld_katalog(p_art text)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case p_art
    when 'maklervertrag' then '[
      {"feld":"verkaeufer_name","name":"Verkäufer – Name"},
      {"feld":"verkaeufer_vertreter","name":"Verkäufer – vertreten durch"},
      {"feld":"verkaeufer_strasse","name":"Verkäufer – Straße"},
      {"feld":"verkaeufer_plz","name":"Verkäufer – PLZ"},
      {"feld":"verkaeufer_ort","name":"Verkäufer – Ort"},
      {"feld":"objekt_bezeichnung","name":"Objekt – Bezeichnung"},
      {"feld":"objekt_adresse","name":"Objekt – Anschrift"},
      {"feld":"angebotspreis","name":"Angebotspreis"},
      {"feld":"laufzeit_monate","name":"Laufzeit (Monate)"},
      {"feld":"provision","name":"Provision (%)"},
      {"feld":"provisionsmodell","name":"Provisionsmodell"},
      {"feld":"firma_name","name":"Eigene Firma – Name"},
      {"feld":"firma_anschrift","name":"Eigene Firma – Anschrift"},
      {"feld":"makler_name","name":"Bearbeiter – Name"},
      {"feld":"datum_heute","name":"Datum"}]'::jsonb
    when 'vollmacht' then '[
      {"feld":"verkaeufer_name","name":"Vollmachtgeber – Name"},
      {"feld":"verkaeufer_strasse","name":"Vollmachtgeber – Straße"},
      {"feld":"verkaeufer_plz","name":"Vollmachtgeber – PLZ"},
      {"feld":"verkaeufer_ort","name":"Vollmachtgeber – Ort"},
      {"feld":"objekt_bezeichnung","name":"Objekt – Bezeichnung"},
      {"feld":"objekt_adresse","name":"Objekt – Anschrift"},
      {"feld":"firma_name","name":"Eigene Firma – Name"},
      {"feld":"datum_heute","name":"Datum"}]'::jsonb
    when 'objektnachweis' then '[
      {"feld":"k1_name","name":"1. Käufer – Name"},
      {"feld":"k1_anschrift","name":"1. Käufer – Anschrift"},
      {"feld":"k1_geburt","name":"1. Käufer – Geburtsdatum/-ort"},
      {"feld":"k1_ausweis","name":"1. Käufer – Ausweisnummer"},
      {"feld":"k2_name","name":"2. Käufer – Name"},
      {"feld":"k2_anschrift","name":"2. Käufer – Anschrift"},
      {"feld":"k2_geburt","name":"2. Käufer – Geburtsdatum/-ort"},
      {"feld":"k2_ausweis","name":"2. Käufer – Ausweisnummer"},
      {"feld":"objekt_bezeichnung","name":"Objekt – Bezeichnung"},
      {"feld":"objekt_adresse","name":"Objekt – Anschrift"},
      {"feld":"kaufpreis","name":"Kaufpreis"},
      {"feld":"provision","name":"Käuferprovision (%)"},
      {"feld":"angebotsdatum","name":"Datum des Angebots"},
      {"feld":"notar_name","name":"Notar – Name"},
      {"feld":"notar_adresse","name":"Notar – Anschrift"},
      {"feld":"firma_name","name":"Eigene Firma – Name"},
      {"feld":"makler_name","name":"Bearbeiter – Name"},
      {"feld":"datum_heute","name":"Datum"}]'::jsonb
    when 'reservierung' then '[
      {"feld":"kaeufer_name","name":"Käufer – Name"},
      {"feld":"kaeufer_anschrift","name":"Käufer – Anschrift"},
      {"feld":"projektname","name":"Projekt"},
      {"feld":"wohneinheit_nr","name":"Wohneinheit"},
      {"feld":"etage","name":"Etage"},
      {"feld":"wohnflaeche_m2","name":"Wohnfläche (m²)"},
      {"feld":"objekt_adresse","name":"Objekt – Anschrift"},
      {"feld":"kaufpreis","name":"Kaufpreis"},
      {"feld":"reservierungsgebuehr_brutto","name":"Reservierungsgebühr (€ brutto)"},
      {"feld":"reservierungsdauer_bis","name":"Reserviert bis"},
      {"feld":"zahlungsfrist_werktage","name":"Zahlungsfrist (Werktage)"},
      {"feld":"ort_unterzeichnung","name":"Ort der Unterzeichnung"},
      {"feld":"datum_unterzeichnung","name":"Datum der Unterzeichnung"},
      {"feld":"firma_name","name":"Eigene Firma – Name"},
      {"feld":"makler_name","name":"Bearbeiter – Name"}]'::jsonb
    else '[]'::jsonb
  end
$function$;

comment on function public.vorlagen_feld_katalog(text) is
  'Welche Felder in einer Vorlage dieser Art markiert werden koennen. Eine '
  'Stelle fuer Oberflaeche und Erzeugung — zwei Listen liefen auseinander.';

grant execute on function public.vorlagen_feld_katalog(text) to authenticated, service_role;

-- --- Wachposten: kein Feld, das der Katalog nicht kennt ---------------------
-- Eine Pruefbedingung kann den Katalog nicht aufrufen (er ist eine Funktion
-- auf einer anderen Tabelle), deshalb hier als Trigger. Ein Feldname, den die
-- Erzeugung nicht fuellt, waere eine Markierung, die stumm nichts tut.
-- SECURITY DEFINER, damit dieser Wachposten nur EINE Frage beantwortet:
-- kennt die Dokumentart dieses Feld? Ohne ihn sieht er die Vorlage eines
-- fremden Mandanten nicht und meldete "die Vorlage gibt es nicht" — eine
-- Antwort auf die falsche Frage. Die Mandantengrenze zieht die restriktive
-- Richtlinie, und sie soll sie auch melden.
create or replace function public.vorlagen_feld_bekannt()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  art_der_vorlage text;
  mandant_der_vorlage uuid;
  bekannt boolean;
begin
  select art, mandant_id into art_der_vorlage, mandant_der_vorlage
    from public.vertragsvorlagen where id = new.vorlage_id;
  if art_der_vorlage is null then
    raise exception 'Die Vorlage % gibt es nicht.', new.vorlage_id;
  end if;
  -- Die Markierung muss zur Vorlage DESSELBEN Mandanten gehoeren.
  --
  -- Das faengt die restriktive Richtlinie NICHT ab, und der Grund ist
  -- lehrreich: mandant_id traegt den Standardwert aktuelle_mandant_id(),
  -- ist beim Einfuegen also schon mit dem EIGENEN Mandanten gefuellt. Der
  -- Wachposten aus fork_22 laesst sie deshalb in Ruhe, und die Richtlinie
  -- sieht den eigenen Mandanten und ist zufrieden — waehrend vorlage_id auf
  -- eine fremde Vorlage zeigt. Eine Zeile, die niemandem auffaellt und auf
  -- etwas zeigt, das dem Mandanten nicht gehoert.
  if mandant_der_vorlage is distinct from new.mandant_id then
    raise exception 'Die Vorlage gehoert einem anderen Mandanten.'
      using errcode = '42501';
  end if;
  select exists (select 1 from jsonb_array_elements(public.vorlagen_feld_katalog(art_der_vorlage)) e
                  where e->>'feld' = new.feld) into bekannt;
  if not bekannt then
    raise exception 'Das Feld "%" kennt eine Vorlage der Art "%" nicht.',
      new.feld, art_der_vorlage;
  end if;
  return new;
end
$function$;

drop trigger if exists vorlagen_feld_bekannt on public.vorlagen_felder;
create trigger vorlagen_feld_bekannt before insert or update on public.vorlagen_felder
  for each row execute function public.vorlagen_feld_bekannt();
