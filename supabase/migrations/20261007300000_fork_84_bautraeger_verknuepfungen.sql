-- ===========================================================================
-- fork_84 — Bautraeger-Paket v2, Block A: Verknuepfungen
-- ===========================================================================
-- Auftrag „FEATURE-PAKET BAUTRAEGER v2" vom 07.10.2026, Abschnitt A.
-- Alles additiv: neue Spalten, erweiterte Pruefbedingungen, Indizes und
-- Richtlinien. Keine Spalte wird entfernt, kein Wert umgeschrieben; die
-- Oberflaeche der Vorlage laeuft unveraendert weiter.
--
--   1. uebergabeprotokoll bekommt die Fremdschluessel, die es nie hatte:
--      Objekt, Projekt, Einheit, Zugang (Kaeufer), Kontakte aus dem
--      Adressbuch, Signaturvorgang, PDF-Datei — und drei Neubau-Typen
--      (Vorabnahme, Abnahme, Nachabnahme) neben Einzug und Auszug.
--   2. projekt_maengel wird DIE Maengeltabelle: Kundenmeldung, Abnahme und
--      Bauleitung schreiben in dieselbe Tabelle (Spalte quelle). Dazu Raum,
--      Gewerk, Handwerker, Frist, Verlauf, Todo und der Token fuer den
--      Handwerker-Link. zugang_id wird dafuer optional: ein Mangel aus der
--      Abnahme hat nicht zwingend einen Portalzugang.
--   3. projekt_kontakte bekommt den Bezug zum Adressbuch (kontakt_id, Rolle
--      „handwerker"), einen Portal-Token und einen Schalter aktiv.
--   4. projekt_einheiten: Fremdschluessel auf immobilien (die Spalte gab es,
--      der Schluessel nicht) und eine Raumliste fuer die Abnahme.
--   5. todo_verknuepfung darf auf mangel, protokoll, einheit und projekt
--      zeigen; vermerke kennt die Quelle „system".
--
-- Richtlinien: das Protokoll der Vorlage lesen nur Ersteller und Chef. Ein
-- Protokoll MIT Projekt (Neubau) liest und pflegt das ganze Team — die
-- Verwaltung, nicht nur, wer es angelegt hat. Die restriktive
-- Mandantentrennung (fork_07) bleibt davon unberuehrt.
--
-- RUECKNAHME: alter table … drop column fuer die neuen Spalten; die alten
-- CHECKs aus 20260915000200_vorlage_schluessel.sql wiederherstellen; drop
-- policy uebergabeprotokoll_projekt_team_*.
-- ===========================================================================

-- --- 1. uebergabeprotokoll --------------------------------------------------
alter table public.uebergabeprotokoll
  add column if not exists immobilie_id        uuid references public.immobilien(id) on delete set null,
  add column if not exists projekt_id          uuid references public.projekte(id) on delete set null,
  add column if not exists einheit_id          uuid references public.projekt_einheiten(id) on delete set null,
  add column if not exists zugang_id           uuid references public.projekt_zugaenge(id) on delete set null,
  add column if not exists kontakt_ids         uuid[] not null default '{}',
  add column if not exists signatur_vorgang_id uuid references public.signatur_vorgaenge(id) on delete set null,
  add column if not exists pdf_datei_id        uuid references public.projekt_dateien(id) on delete set null,
  add column if not exists pdf_pfad            text,
  add column if not exists frist_standard_tage integer not null default 14,
  add column if not exists abgeschlossen_am    timestamptz,
  add column if not exists termin_id           uuid references public.termine(id) on delete set null;

comment on column public.uebergabeprotokoll.kontakt_ids is
  'Kaeufer, Mieter oder Eigentuemer aus dem Adressbuch (kontakte.id). Die Namen im Protokoll bleiben Text — das Protokoll ist ein Dokument und darf sich nicht aendern, wenn ein Kontakt umbenannt wird.';
comment on column public.uebergabeprotokoll.frist_standard_tage is
  'Vorgabe fuer die Frist neuer Maengel aus diesem Protokoll, in Tagen ab Abschluss.';
comment on column public.uebergabeprotokoll.pdf_pfad is
  'Pfad des abgeschlossenen PDFs im Bucket projekt-dateien (Neubau) — sonst null, das PDF wird dann nur heruntergeladen.';

alter table public.uebergabeprotokoll drop constraint if exists uebergabeprotokoll_protokoll_typ_check;
alter table public.uebergabeprotokoll add constraint uebergabeprotokoll_protokoll_typ_check
  check (protokoll_typ = any (array['einzug','auszug','neubau_vorabnahme','neubau_abnahme','neubau_nachabnahme']));
-- Ein Neubau-Protokoll haengt immer an einem Projekt. Umgekehrt nicht: ein
-- Einzug kann zu einer Neubau-Einheit gehoeren (Vermietung aus dem Bestand).
alter table public.uebergabeprotokoll drop constraint if exists uebergabeprotokoll_neubau_projekt_check;
alter table public.uebergabeprotokoll add constraint uebergabeprotokoll_neubau_projekt_check
  check (protokoll_typ not like 'neubau_%' or projekt_id is not null);

create index if not exists uebergabeprotokoll_immobilie_idx on public.uebergabeprotokoll (immobilie_id);
create index if not exists uebergabeprotokoll_projekt_idx   on public.uebergabeprotokoll (projekt_id);
create index if not exists uebergabeprotokoll_einheit_idx   on public.uebergabeprotokoll (einheit_id);
create index if not exists uebergabeprotokoll_zugang_idx    on public.uebergabeprotokoll (zugang_id);
create index if not exists uebergabeprotokoll_termin_idx    on public.uebergabeprotokoll (termin_id);
create index if not exists uebergabeprotokoll_signatur_idx  on public.uebergabeprotokoll (signatur_vorgang_id);
create index if not exists uebergabeprotokoll_pdf_idx       on public.uebergabeprotokoll (pdf_datei_id);

drop policy if exists uebergabeprotokoll_projekt_team_select on public.uebergabeprotokoll;
create policy uebergabeprotokoll_projekt_team_select on public.uebergabeprotokoll
  for select to authenticated
  using (projekt_id is not null and public.ist_team());
drop policy if exists uebergabeprotokoll_projekt_team_update on public.uebergabeprotokoll;
create policy uebergabeprotokoll_projekt_team_update on public.uebergabeprotokoll
  for update to authenticated
  using (projekt_id is not null and public.ist_team())
  with check (projekt_id is not null and public.ist_team());

-- --- 2. projekt_maengel -------------------------------------------------------
alter table public.projekt_maengel alter column zugang_id drop not null;
alter table public.projekt_maengel
  add column if not exists quelle              text not null default 'kunde',
  add column if not exists protokoll_id        uuid references public.uebergabeprotokoll(id) on delete set null,
  add column if not exists raum                text,
  add column if not exists gewerk              text,
  add column if not exists projekt_kontakt_id  uuid references public.projekt_kontakte(id) on delete set null,
  add column if not exists frist               date,
  add column if not exists nachfrist           date,
  add column if not exists kategorie           text,
  add column if not exists erledigt_fotos      text[] not null default '{}',
  add column if not exists verlauf             jsonb not null default '[]'::jsonb,
  add column if not exists todo_id             uuid references public.todos(id) on delete set null,
  add column if not exists handwerker_token    text,
  add column if not exists termin_am           date,
  add column if not exists gemeldet_erledigt_am timestamptz,
  add column if not exists geprueft_am         timestamptz,
  add column if not exists geprueft_von        uuid references auth.users(id) on delete set null,
  add column if not exists erinnert_am         timestamptz,
  add column if not exists mahnung_am          timestamptz,
  add column if not exists erstellt_von        uuid references auth.users(id) on delete set null;

comment on column public.projekt_maengel.quelle is 'kunde = Meldung aus dem Kundenportal · abnahme = aus einem Abnahmeprotokoll · bauleitung = vor Ort erfasst';
comment on column public.projekt_maengel.verlauf is 'Unveraenderliche Folge von Eintraegen {am, wer, was, text?} — jeder Statuswechsel, jede Erinnerung, jede Rueckfrage.';
comment on column public.projekt_maengel.handwerker_token is 'Token fuer den Link ohne Anmeldung; zeigt genau diesen Mangel. Je Handwerker gibt es zusaetzlich projekt_kontakte.portal_token fuer alle seine Maengel.';
comment on column public.projekt_maengel.erledigt_fotos is 'Pflichtfotos der Erledigung durch den Handwerker (Bucket projekt-dateien, Pfad maengel/<projekt>/<mangel>/…).';

alter table public.projekt_maengel drop constraint if exists projekt_maengel_quelle_check;
alter table public.projekt_maengel add constraint projekt_maengel_quelle_check
  check (quelle = any (array['kunde','abnahme','bauleitung']));
-- Der Status. Die Vorlage hatte keine Pruefbedingung und nur „offen" als
-- Vorgabe; die Werte in_bearbeitung/erledigt kamen aus der externen
-- Portalseite. Sie bleiben erlaubt, damit nichts bricht, gelten aber als
-- Altbestand — die Oberflaeche schreibt nur noch die sechs neuen.
alter table public.projekt_maengel drop constraint if exists projekt_maengel_status_check;
alter table public.projekt_maengel add constraint projekt_maengel_status_check
  check (status = any (array['offen','beauftragt','termin_geplant','gemeldet_erledigt','geprueft_erledigt','abgelehnt',
                             'in_bearbeitung','erledigt']));

create unique index if not exists projekt_maengel_handwerker_token_key on public.projekt_maengel (handwerker_token) where handwerker_token is not null;
create index if not exists projekt_maengel_protokoll_idx  on public.projekt_maengel (protokoll_id);
create index if not exists projekt_maengel_kontakt_idx    on public.projekt_maengel (projekt_kontakt_id);
create index if not exists projekt_maengel_todo_idx       on public.projekt_maengel (todo_id);
create index if not exists projekt_maengel_frist_idx      on public.projekt_maengel (frist) where status not in ('geprueft_erledigt','abgelehnt','erledigt');
create index if not exists projekt_maengel_geprueft_von_idx on public.projekt_maengel (geprueft_von);
create index if not exists projekt_maengel_erstellt_von_idx on public.projekt_maengel (erstellt_von);

-- --- 3. projekt_kontakte ---------------------------------------------------------
alter table public.projekt_kontakte
  add column if not exists kontakt_id   uuid references public.kontakte(id) on delete set null,
  add column if not exists portal_token text,
  add column if not exists aktiv        boolean not null default true;
create unique index if not exists projekt_kontakte_portal_token_key on public.projekt_kontakte (portal_token) where portal_token is not null;
create index if not exists projekt_kontakte_kontakt_idx on public.projekt_kontakte (kontakt_id);
comment on column public.projekt_kontakte.portal_token is 'Link ohne Anmeldung fuer den Handwerker: alle seine offenen Maengel in diesem Projekt. Wird beim ersten Auftrag erzeugt.';

-- --- 4. projekt_einheiten --------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projekt_einheiten_immobilie_id_fkey') then
    alter table public.projekt_einheiten
      add constraint projekt_einheiten_immobilie_id_fkey
      foreign key (immobilie_id) references public.immobilien(id) on delete set null;
  end if;
end $$;
alter table public.projekt_einheiten
  add column if not exists raeume text[] not null default '{}';
create index if not exists projekt_einheiten_immobilie_idx on public.projekt_einheiten (immobilie_id);
comment on column public.projekt_einheiten.raeume is 'Raumliste der Einheit fuer Abnahme und Protokoll (z. B. aus dem Grundriss). Leer = Standardraeume der Vorlage.';

-- --- 5. Zeitleisten ----------------------------------------------------------------
alter table public.todo_verknuepfung drop constraint if exists todo_verknuepfung_objekt_typ_check;
alter table public.todo_verknuepfung add constraint todo_verknuepfung_objekt_typ_check
  check (objekt_typ = any (array['immobilie','kontakt','vertrag','mail_eingang','termin','rechnung','bewertung',
                                 'eigentuemer','objektnachweis','mietanfrage','akq_lead',
                                 'mangel','protokoll','einheit','projekt']));
alter table public.vermerke drop constraint if exists vermerke_quelle_check;
alter table public.vermerke add constraint vermerke_quelle_check
  check (quelle is null or quelle = any (array['klick','manuell','sipgate','system']));

-- --- Hilfe fuer die Oberflaeche: Objekte zu einer Adresse -------------------------
-- Fuer den Abgleich bestehender Protokolle (Auftrag A1: „per Adresse-Abgleich
-- Vorschlaege, nichts automatisch"). Liefert hoechstens fuenf Objekte des
-- eigenen Mandanten, deren Strasse und Hausnummer in der Adresse vorkommen.
create or replace function public.objekte_zu_adresse(p_adresse text)
 returns table (id uuid, bezeichnung text, strasse text, hausnummer text, plz text, ort text)
 language sql stable security invoker set search_path = public
as $$
  select i.id, coalesce(i.objekttitel, i.strasse || ' ' || coalesce(i.hausnummer, '')) as bezeichnung,
         i.strasse, i.hausnummer, i.plz, i.ort
    from public.immobilien i
   where p_adresse is not null and length(trim(p_adresse)) >= 4
     and i.strasse is not null and length(i.strasse) >= 3
     and position(lower(i.strasse) in lower(p_adresse)) > 0
     and (i.hausnummer is null or i.hausnummer = '' or position(lower(i.hausnummer) in lower(p_adresse)) > 0)
   order by (i.plz is not null and position(i.plz in p_adresse) > 0) desc, i.strasse
   limit 5
$$;
grant execute on function public.objekte_zu_adresse(text) to authenticated;
revoke all on function public.objekte_zu_adresse(text) from public, anon;
