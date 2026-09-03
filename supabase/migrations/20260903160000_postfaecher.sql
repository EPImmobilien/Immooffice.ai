-- ===========================================================================
-- ImmoOffice.ai — Postfaecher (docs/AUTONOMIE.md Abschnitt 6, P1–P8)
--
-- Kein Mail-Client. Gespiegelt werden Kopfdaten und Text (P4); Anhaenge nur
-- auf Anforderung. Persoenliche Postfaecher sind privat — die Row-Level-
-- Security kennt nur den verbundenen Benutzer. Unternehmenspostfaecher legt
-- die Verwaltung an und gibt sie einzeln frei (P1). Zugangsdaten liegen
-- verschluesselt (AES-256-GCM mit Mandanten-AAD) und sind fuer Benutzer
-- nicht lesbar; nur der Server schreibt sie, nur der Arbeiter liest sie.
-- ===========================================================================

create type public.postfach_anbieter as enum ('imap', 'microsoft', 'google');
create type public.postfach_status   as enum ('neu', 'aktiv', 'fehler', 'getrennt');
create type public.nachricht_ordner  as enum ('eingang', 'gesendet');

-- ---------------------------------------------------------------------------
-- 1. Postfaecher, Freigaben, Aufbewahrung
-- ---------------------------------------------------------------------------

create table public.postfaecher (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  -- null = Unternehmenspostfach (P1); sonst das persoenliche Postfach dieses Benutzers
  benutzer_id   uuid references public.benutzer(id) on delete cascade,
  anbieter      public.postfach_anbieter not null,
  adresse       text not null check (position('@' in adresse) > 1),
  anzeigename   text,
  -- Verschluesselt (v1.<iv>.<tag>.<geheimtext>): IMAP/SMTP-Zugang oder OAuth-Token.
  -- Nie im Protokoll, nie im Client — siehe Spaltenrechte unten.
  zugangsdaten  text,
  -- Abgleichzustand des Anbieters: Delta-Link (Microsoft), historyId (Google),
  -- uidvalidity/uidnext (IMAP). Nur der Arbeiter schreibt hier.
  sync_zustand  jsonb not null default '{}'::jsonb,
  intervall_minuten smallint not null default 5 check (intervall_minuten between 1 and 1440),
  letzter_abruf_am timestamptz,
  status        public.postfach_status not null default 'neu',
  fehler_text   text,
  fehler_zaehler integer not null default 0,
  -- P6: Signatur aus Profil und Erscheinungsbild anhaengen
  signatur_anhaengen boolean not null default false,
  erstellt_von  uuid references public.benutzer(id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);

comment on table public.postfaecher is
  'Verbundene Postfaecher (Microsoft 365, Google, IMAP). benutzer_id null = Unternehmenspostfach.';

create unique index postfaecher_eindeutig on public.postfaecher
  (mandant_id, lower(adresse), coalesce(benutzer_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index postfaecher_mandant on public.postfaecher (mandant_id);

create trigger postfaecher_geaendert before update on public.postfaecher
  for each row execute function intern.setze_geaendert_am();

-- Freigabe eines Unternehmenspostfachs an Kollegen (P1)
create table public.postfach_freigaben (
  postfach_id  uuid not null references public.postfaecher(id) on delete cascade,
  benutzer_id  uuid not null references public.benutzer(id) on delete cascade,
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  darf_senden  boolean not null default true,
  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am  timestamptz not null default now(),
  primary key (postfach_id, benutzer_id)
);

-- P7: Aufbewahrung gespiegelter Inhalte je Unternehmen, Vorgabe 24 Monate.
alter table public.mandanten
  add column nachrichten_aufbewahrung_monate smallint not null default 24
    check (nachrichten_aufbewahrung_monate between 1 and 120);

-- ---------------------------------------------------------------------------
-- 2. Nachrichten und Anhaenge
-- ---------------------------------------------------------------------------

create table public.nachrichten (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  postfach_id   uuid not null references public.postfaecher(id) on delete cascade,
  ordner        public.nachricht_ordner not null default 'eingang',
  -- Kennung beim Anbieter (Microsoft: id, Google: id, IMAP: uidvalidity:uid)
  extern_id     text not null,
  message_id    text,
  in_reply_to   text,
  thread_id     text,
  von_adresse   text,
  von_name      text,
  an            jsonb not null default '[]'::jsonb,   -- [{adresse, name}]
  cc            jsonb not null default '[]'::jsonb,
  betreff       text,
  -- Nur Text (P4). HTML wird beim Abruf in Text ueberfuehrt und nicht gespeichert.
  text          text,
  vorschau      text,
  gesendet_am   timestamptz not null,
  gelesen       boolean not null default false,
  hat_anhaenge  boolean not null default false,
  -- Zuordnung (Objekt als Drehkreuz): Kontakt ueber den Absender, Objekt ueber
  -- Objektnummer oder Anschrift; unter der Schwelle nur als Vorschlag.
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  objekt_id     uuid references public.objekte(id) on delete set null,
  zuordnung_art text check (zuordnung_art is null or zuordnung_art in ('automatisch', 'manuell')),
  objekt_vorschlag_id        uuid references public.objekte(id) on delete set null,
  objekt_vorschlag_konfidenz smallint check (objekt_vorschlag_konfidenz is null or objekt_vorschlag_konfidenz between 0 and 100),
  objekt_vorschlag_grund     text,
  -- P7: Nach der Aufbewahrungsfrist bleibt nur die Verknuepfung.
  inhalt_entfernt_am timestamptz,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  constraint nachrichten_extern_eindeutig unique (postfach_id, extern_id)
);

create index nachrichten_postfach_datum on public.nachrichten (postfach_id, gesendet_am desc);
create index nachrichten_objekt  on public.nachrichten (objekt_id)  where objekt_id is not null;
create index nachrichten_kontakt on public.nachrichten (kontakt_id) where kontakt_id is not null;
create index nachrichten_suche on public.nachrichten
  using gin (to_tsvector('german', coalesce(betreff, '') || ' ' || coalesce(von_adresse, '') || ' ' || coalesce(text, '')));

create trigger nachrichten_geaendert before update on public.nachrichten
  for each row execute function intern.setze_geaendert_am();

create table public.nachricht_anhaenge (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  nachricht_id  uuid not null references public.nachrichten(id) on delete cascade,
  -- Kennung beim Anbieter (Anhang-ID bzw. IMAP-Teil); der Inhalt wird auf
  -- Anforderung geholt und nur bei Uebernahme in die Unterlagen gespeichert.
  extern_id     text,
  dateiname     text not null check (length(trim(dateiname)) between 1 and 300),
  mime          text,
  bytes         integer,
  dokument_id   uuid references public.objekt_dokumente(id) on delete set null,
  erstellt_am   timestamptz not null default now()
);

create index nachricht_anhaenge_nachricht on public.nachricht_anhaenge (nachricht_id);

-- ---------------------------------------------------------------------------
-- 3. Mandantenreine Verweise (wie verweise_mandantenrein)
-- ---------------------------------------------------------------------------

create or replace function intern.pruefe_postfach()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (new.mandant_id <> old.mandant_id or new.benutzer_id is distinct from old.benutzer_id) then
    raise exception 'Unternehmen und Inhaber eines Postfachs sind nicht aenderbar.';
  end if;
  if new.benutzer_id is not null and not exists (
    select 1 from public.benutzer b where b.id = new.benutzer_id and b.mandant_id = new.mandant_id
  ) then
    raise exception 'Der Benutzer gehoert nicht zu diesem Unternehmen.';
  end if;
  return new;
end;
$$;

create trigger postfaecher_pruefen before insert or update on public.postfaecher
  for each row execute function intern.pruefe_postfach();

create or replace function intern.pruefe_postfach_freigabe()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.postfaecher p
     where p.id = new.postfach_id and p.mandant_id = new.mandant_id and p.benutzer_id is null
  ) then
    raise exception 'Freigaben gibt es nur fuer Unternehmenspostfaecher desselben Unternehmens.';
  end if;
  if not exists (
    select 1 from public.benutzer b where b.id = new.benutzer_id and b.mandant_id = new.mandant_id
  ) then
    raise exception 'Der Benutzer gehoert nicht zu diesem Unternehmen.';
  end if;
  return new;
end;
$$;

create trigger postfach_freigaben_pruefen before insert or update on public.postfach_freigaben
  for each row execute function intern.pruefe_postfach_freigabe();

create or replace function intern.pruefe_nachricht()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.postfaecher p where p.id = new.postfach_id and p.mandant_id = new.mandant_id) then
    raise exception 'Das Postfach gehoert nicht zu diesem Unternehmen.';
  end if;
  if new.objekt_id is not null and not exists (
    select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id
  ) then
    raise exception 'Das Objekt gehoert nicht zu diesem Unternehmen.';
  end if;
  if new.objekt_vorschlag_id is not null and not exists (
    select 1 from public.objekte o where o.id = new.objekt_vorschlag_id and o.mandant_id = new.mandant_id
  ) then
    raise exception 'Das vorgeschlagene Objekt gehoert nicht zu diesem Unternehmen.';
  end if;
  if new.kontakt_id is not null and not exists (
    select 1 from public.kontakte k where k.id = new.kontakt_id and k.mandant_id = new.mandant_id
  ) then
    raise exception 'Der Kontakt gehoert nicht zu diesem Unternehmen.';
  end if;
  return new;
end;
$$;

create trigger nachrichten_pruefen before insert or update on public.nachrichten
  for each row execute function intern.pruefe_nachricht();

create or replace function intern.pruefe_nachricht_anhang()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.nachrichten n where n.id = new.nachricht_id and n.mandant_id = new.mandant_id) then
    raise exception 'Die Nachricht gehoert nicht zu diesem Unternehmen.';
  end if;
  if new.dokument_id is not null and not exists (
    select 1 from public.objekt_dokumente d where d.id = new.dokument_id and d.mandant_id = new.mandant_id
  ) then
    raise exception 'Die Unterlage gehoert nicht zu diesem Unternehmen.';
  end if;
  return new;
end;
$$;

create trigger nachricht_anhaenge_pruefen before insert or update on public.nachricht_anhaenge
  for each row execute function intern.pruefe_nachricht_anhang();

-- ---------------------------------------------------------------------------
-- 4. Sichtbarkeit (P1): eigenes Postfach, oder Unternehmenspostfach fuer die
--    Verwaltung und freigegebene Kollegen. Security definer, damit die
--    Policies nicht rekursiv aufeinander verweisen.
-- ---------------------------------------------------------------------------

-- Hat der angemeldete Benutzer eine Freigabe fuer dieses Postfach?
create or replace function intern.postfach_freigegeben(p_postfach uuid, p_senden boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.postfach_freigaben f
     where f.postfach_id = p_postfach and f.benutzer_id = auth.uid()
       and (not p_senden or f.darf_senden)
  )
$$;

create or replace function intern.postfach_sichtbar(p_postfach uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.postfaecher p
     where p.id = p_postfach
       and p.mandant_id = intern.aktueller_mandant()
       and (
         p.benutzer_id = auth.uid()
         or (p.benutzer_id is null and (
              intern.ist_verwaltung()
              or exists (select 1 from public.postfach_freigaben f
                          where f.postfach_id = p.id and f.benutzer_id = auth.uid())))
       )
  )
$$;

-- Darf der Benutzer ueber dieses Postfach senden? (Eigenes: ja. Unternehmen:
-- Verwaltung, oder Freigabe mit darf_senden.)
create or replace function intern.postfach_sendbar(p_postfach uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.postfaecher p
     where p.id = p_postfach
       and p.mandant_id = intern.aktueller_mandant()
       and p.status <> 'getrennt'
       and (
         p.benutzer_id = auth.uid()
         or (p.benutzer_id is null and (
              intern.ist_verwaltung()
              or exists (select 1 from public.postfach_freigaben f
                          where f.postfach_id = p.id and f.benutzer_id = auth.uid() and f.darf_senden)))
       )
  )
$$;

-- Darf der Benutzer das Postfach verwalten (aendern, trennen, loeschen)?
create or replace function intern.postfach_verwaltbar(p_postfach uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.postfaecher p
     where p.id = p_postfach
       and p.mandant_id = intern.aktueller_mandant()
       and (p.benutzer_id = auth.uid() or (p.benutzer_id is null and intern.ist_verwaltung()))
  )
$$;

create or replace function intern.nachricht_sichtbar(p_nachricht uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select intern.postfach_sichtbar(n.postfach_id) from public.nachrichten n where n.id = p_nachricht
$$;

-- Die Policies rufen diese Helfer als angemeldeter Benutzer auf; sie verraten
-- nur, was der Aufrufer selbst sehen darf.
revoke all on function intern.postfach_sichtbar(uuid)   from public, anon;
revoke all on function intern.postfach_sendbar(uuid)    from public, anon;
revoke all on function intern.postfach_verwaltbar(uuid) from public, anon;
revoke all on function intern.nachricht_sichtbar(uuid)  from public, anon;
revoke all on function intern.postfach_freigegeben(uuid, boolean) from public, anon;
grant execute on function intern.postfach_sichtbar(uuid), intern.postfach_sendbar(uuid),
  intern.postfach_verwaltbar(uuid), intern.nachricht_sichtbar(uuid),
  intern.postfach_freigegeben(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Row-Level-Security und Spaltenrechte
-- ---------------------------------------------------------------------------

alter table public.postfaecher        enable row level security;
alter table public.postfach_freigaben enable row level security;
alter table public.nachrichten        enable row level security;
alter table public.nachricht_anhaenge enable row level security;

-- Die Policies dieser Tabelle greifen nicht ueber eine Funktion auf die
-- Tabelle selbst zurueck: Eine stabile Funktion arbeitet auf dem Schnappschuss
-- vom Beginn der Anweisung und saehe die gerade eingefuegte Zeile (RETURNING)
-- nicht — der Einfuegende bekaeme einen RLS-Fehler fuer sein eigenes Postfach.
create policy postfaecher_lesen on public.postfaecher
  for select using (
    mandant_id = intern.aktueller_mandant()
    and (
      benutzer_id = auth.uid()
      or (benutzer_id is null and (intern.ist_verwaltung() or intern.postfach_freigegeben(id)))
    )
  );

create policy postfaecher_anlegen on public.postfaecher
  for insert with check (
    mandant_id = intern.aktueller_mandant()
    and intern.darf_schreiben()
    and (benutzer_id = auth.uid() or (benutzer_id is null and intern.ist_verwaltung()))
  );

create policy postfaecher_aendern on public.postfaecher
  for update
  using (
    mandant_id = intern.aktueller_mandant() and intern.darf_schreiben()
    and (benutzer_id = auth.uid() or (benutzer_id is null and intern.ist_verwaltung()))
  )
  with check (mandant_id = intern.aktueller_mandant());

-- Loeschen erst nach dem Trennen (P7): Das Trennen anonymisiert die
-- Verknuepfungen; ein direktes Loeschen wuerde sie mitreissen.
create policy postfaecher_loeschen on public.postfaecher
  for delete using (
    mandant_id = intern.aktueller_mandant() and intern.darf_schreiben()
    and (benutzer_id = auth.uid() or (benutzer_id is null and intern.ist_verwaltung()))
    and status = 'getrennt'
  );

-- Zugangsdaten und Abgleichzustand sind fuer Benutzer NICHT lesbar; die
-- Zugangsdaten duerfen sie (verschluesselt, ueber die Server Action) setzen.
revoke select, update on public.postfaecher from anon, authenticated;
grant select (
  id, mandant_id, benutzer_id, anbieter, adresse, anzeigename, intervall_minuten,
  letzter_abruf_am, status, fehler_text, fehler_zaehler, signatur_anhaengen,
  erstellt_von, erstellt_am, geaendert_am
) on public.postfaecher to authenticated;
grant update (anzeigename, zugangsdaten, intervall_minuten, status, fehler_text, signatur_anhaengen)
  on public.postfaecher to authenticated;

create policy postfach_freigaben_lesen on public.postfach_freigaben
  for select using (
    mandant_id = intern.aktueller_mandant()
    and (benutzer_id = auth.uid() or intern.ist_verwaltung())
  );

create policy postfach_freigaben_schreiben on public.postfach_freigaben
  for all
  using (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.ist_verwaltung() and intern.darf_schreiben());

create policy nachrichten_lesen on public.nachrichten
  for select using (intern.postfach_sichtbar(postfach_id));

-- Benutzer legen nur gesendete Nachrichten an (Versand ueber die Anwendung);
-- den Eingang schreibt allein der Arbeiter mit der Dienstrolle.
create policy nachrichten_anlegen on public.nachrichten
  for insert with check (
    mandant_id = intern.aktueller_mandant()
    and intern.darf_schreiben()
    and ordner = 'gesendet'
    and intern.postfach_sendbar(postfach_id)
  );

create policy nachrichten_aendern on public.nachrichten
  for update
  using (intern.postfach_sichtbar(postfach_id) and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant());

-- Benutzer aendern nur Lesestatus und Zuordnung — nie Inhalt oder Herkunft.
revoke update on public.nachrichten from anon, authenticated;
grant update (gelesen, kontakt_id, objekt_id, zuordnung_art, objekt_vorschlag_id, objekt_vorschlag_konfidenz, objekt_vorschlag_grund)
  on public.nachrichten to authenticated;

create policy nachricht_anhaenge_lesen on public.nachricht_anhaenge
  for select using (intern.nachricht_sichtbar(nachricht_id));

create policy nachricht_anhaenge_anlegen on public.nachricht_anhaenge
  for insert with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben() and intern.nachricht_sichtbar(nachricht_id));

create policy nachricht_anhaenge_aendern on public.nachricht_anhaenge
  for update
  using (intern.nachricht_sichtbar(nachricht_id) and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant());

revoke update on public.nachricht_anhaenge from anon, authenticated;
grant update (dokument_id) on public.nachricht_anhaenge to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Auftragswarteschlange: neue Art „postfach“; Einplaner alle fuenf
--    Minuten (P4) mit Rueckzug nach Fehlern
-- ---------------------------------------------------------------------------

alter table public.jobs drop constraint jobs_art_check;
alter table public.jobs add constraint jobs_art_check
  check (art in ('sync', 'ki_text', 'ki_bild', 'mail', 'export', 'postfach'));

create or replace function public.postfaecher_faellige_einplanen()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p record;
  v_anzahl integer := 0;
  v_abstand interval;
begin
  for v_p in
    select id, mandant_id, intervall_minuten, letzter_abruf_am, fehler_zaehler
      from public.postfaecher
     where status in ('aktiv', 'fehler') and zugangsdaten is not null
  loop
    -- Nach Fehlern wird der Abstand gestreckt (hoechstens das Zwoelffache).
    v_abstand := make_interval(mins => v_p.intervall_minuten * (1 + least(v_p.fehler_zaehler, 11)));
    if v_p.letzter_abruf_am is not null and v_p.letzter_abruf_am + v_abstand > now() then
      continue;
    end if;
    if exists (
      select 1 from public.jobs
       where art = 'postfach' and status in ('offen', 'laeuft')
         and nutzlast ->> 'postfach_id' = v_p.id::text
    ) then
      continue;
    end if;
    insert into public.jobs (mandant_id, art, nutzlast, prioritaet)
    values (v_p.mandant_id, 'postfach',
            jsonb_build_object('postfach_id', v_p.id, 'ausloeser', 'zeitplan'), 5);
    v_anzahl := v_anzahl + 1;
  end loop;
  return v_anzahl;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Aufbewahrung (P7): Nach der Frist bleibt nur die Verknuepfung —
--    Betreff, Datum, Absender, Kontakt und Objekt. Text, Empfaenger und
--    Anhaenge werden entfernt.
-- ---------------------------------------------------------------------------

create or replace function public.nachrichten_aufraeumen()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_anzahl integer;
begin
  with faellig as (
    select n.id
      from public.nachrichten n
      join public.mandanten m on m.id = n.mandant_id
     where n.inhalt_entfernt_am is null
       and n.gesendet_am < now() - make_interval(months => m.nachrichten_aufbewahrung_monate)
  ), bereinigt as (
    update public.nachrichten n
       set text = null, vorschau = null, an = '[]'::jsonb, cc = '[]'::jsonb,
           von_name = null, inhalt_entfernt_am = now()
      from faellig f
     where n.id = f.id
    returning n.id
  )
  select count(*) into v_anzahl from bereinigt;

  delete from public.nachricht_anhaenge a
   using public.nachrichten n
   where a.nachricht_id = n.id and n.inhalt_entfernt_am is not null;

  return v_anzahl;
end;
$$;

-- Trennen (P7): Gespiegelte Inhalte werden geloescht; was an Objekt oder
-- Kontakt haengt, bleibt als anonymisierte Verknuepfung. Danach ist das
-- Postfach ohne Zugangsdaten und kann geloescht werden.
create or replace function public.postfach_trennen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not intern.postfach_verwaltbar(p_id) then
    raise exception 'Nur der verbundene Benutzer oder die Verwaltung kann ein Postfach trennen.';
  end if;
  if not intern.darf_schreiben() then
    raise exception 'Im Lesemodus koennen Postfaecher nicht getrennt werden.';
  end if;

  delete from public.nachricht_anhaenge a
   using public.nachrichten n
   where a.nachricht_id = n.id and n.postfach_id = p_id;

  delete from public.nachrichten
   where postfach_id = p_id and objekt_id is null and kontakt_id is null;

  update public.nachrichten
     set text = null, vorschau = null, an = '[]'::jsonb, cc = '[]'::jsonb,
         von_name = null, inhalt_entfernt_am = now()
   where postfach_id = p_id and inhalt_entfernt_am is null;

  delete from public.postfach_freigaben where postfach_id = p_id;

  update public.postfaecher
     set status = 'getrennt', zugangsdaten = null, sync_zustand = '{}'::jsonb,
         fehler_text = null, fehler_zaehler = 0
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

revoke all on function public.postfaecher_faellige_einplanen() from public, anon, authenticated;
revoke all on function public.nachrichten_aufraeumen()         from public, anon, authenticated;
revoke all on function public.postfach_trennen(uuid)           from public, anon;
grant execute on function public.postfaecher_faellige_einplanen() to service_role;
grant execute on function public.nachrichten_aufraeumen()         to service_role;
grant execute on function public.postfach_trennen(uuid)           to authenticated, service_role;
