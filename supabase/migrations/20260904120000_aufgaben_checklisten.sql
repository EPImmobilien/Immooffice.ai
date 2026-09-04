-- ===========================================================================
-- ToDos-Ausbau und Checklisten (docs/FUNKTIONSABGLEICH.md N1, Referenz-Kachel
-- „ToDos" und „Erinnerungen & Arbeitsketten"):
--   Aufgaben mit Status (offen, laeuft, wartet, erledigt, verworfen), Typ
--   (Aufgabe/Notiz), Tags, Wiederholung, Erinnerung, Quelle und Verknuepfungen
--   (Lead, Termin, Nachricht, Vertrag); Schritte (Teilaufgaben); Kommentare mit
--   Systemverlauf (Statuswechsel, Uebergabe); Tags je Mandant.
--   Checklisten-Vorlagen mit Punkten (Pflicht, Unterlagenart, Frist) und
--   laufende Checklisten an Objekt, Kontakt, Lead oder Vertrag; ein Punkt gilt
--   als erledigt, sobald die passende Unterlage am Objekt liegt.
--   Tutorial-Merker je Benutzer.
-- ===========================================================================

-- --- Aufgaben erweitern ------------------------------------------------------
alter table public.aufgaben
  add column status        text not null default 'offen' check (status in ('offen', 'laeuft', 'wartet', 'erledigt', 'verworfen')),
  add column typ           text not null default 'aufgabe' check (typ in ('aufgabe', 'notiz')),
  add column tags          text[] not null default '{}',
  add column wiederholung  text check (wiederholung is null or wiederholung in ('taeglich', 'woechentlich', 'monatlich', 'jaehrlich')),
  add column erinnerung_am timestamptz,
  add column quelle        text,
  add column team_sichtbar boolean not null default true,
  add column lead_id       uuid references public.akquise_leads(id) on delete set null,
  add column termin_id     uuid references public.termine(id) on delete set null,
  add column nachricht_id  uuid references public.nachrichten(id) on delete set null,
  add column vertrag_id    uuid references public.vertraege(id) on delete set null;
update public.aufgaben set status = 'erledigt' where erledigt_am is not null;
create index aufgaben_status_idx on public.aufgaben (mandant_id, status) where status <> 'erledigt';
create index aufgaben_tags_idx on public.aufgaben using gin (tags);
create index aufgaben_lead_idx on public.aufgaben (lead_id);

-- Status und Erledigt-Zeitpunkt bleiben deckungsgleich, egal ueber welchen
-- Weg eine Aufgabe erledigt wird (Kästchen, Kanban, Schnittstelle).
create or replace function intern.aufgabe_status_abgleichen()
returns trigger language plpgsql as $$
declare v_wer uuid;
begin
  if tg_op = 'UPDATE' and new.status = 'erledigt' and old.status <> 'erledigt' and new.erledigt_am is null then
    v_wer := coalesce(auth.uid(), new.zustaendig_id, new.erstellt_von);
    if v_wer is null then raise exception 'Erledigen braucht eine Person.'; end if;
    new.erledigt_am := now(); new.erledigt_von := v_wer;
  elsif tg_op = 'INSERT' and new.status = 'erledigt' and new.erledigt_am is null then
    v_wer := coalesce(auth.uid(), new.zustaendig_id, new.erstellt_von);
    if v_wer is null then raise exception 'Erledigen braucht eine Person.'; end if;
    new.erledigt_am := now(); new.erledigt_von := v_wer;
  elsif tg_op = 'UPDATE' and new.status <> 'erledigt' and old.status = 'erledigt' then
    new.erledigt_am := null; new.erledigt_von := null;
  elsif tg_op = 'UPDATE' and new.erledigt_am is not null and old.erledigt_am is null and new.status <> 'erledigt' then
    new.status := 'erledigt';
  elsif tg_op = 'UPDATE' and new.erledigt_am is null and old.erledigt_am is not null and new.status = 'erledigt' then
    new.status := 'offen';
  end if;
  return new;
end $$;
create trigger aufgaben_status_abgleich before insert or update on public.aufgaben
  for each row execute function intern.aufgabe_status_abgleichen();

-- Verknuepfungen muessen zum Mandanten gehoeren
create or replace function intern.aufgabe_verweise_pruefen()
returns trigger language plpgsql as $$
begin
  if new.lead_id is not null and not exists (select 1 from public.akquise_leads l where l.id = new.lead_id and l.mandant_id = new.mandant_id) then
    raise exception 'Der Lead gehoert nicht zu diesem Mandanten.';
  end if;
  if new.termin_id is not null and not exists (select 1 from public.termine t where t.id = new.termin_id and t.mandant_id = new.mandant_id) then
    raise exception 'Der Termin gehoert nicht zu diesem Mandanten.';
  end if;
  if new.nachricht_id is not null and not exists (select 1 from public.nachrichten n where n.id = new.nachricht_id and n.mandant_id = new.mandant_id) then
    raise exception 'Die Nachricht gehoert nicht zu diesem Mandanten.';
  end if;
  if new.vertrag_id is not null and not exists (select 1 from public.vertraege v where v.id = new.vertrag_id and v.mandant_id = new.mandant_id) then
    raise exception 'Der Vertrag gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;
create trigger aufgaben_verweise before insert or update on public.aufgaben
  for each row execute function intern.aufgabe_verweise_pruefen();

-- --- Schritte, Kommentare, Tags ------------------------------------------------
create table public.aufgaben_schritte (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  aufgabe_id   uuid not null references public.aufgaben(id) on delete cascade,
  titel        text not null check (length(trim(titel)) between 1 and 300),
  sortierung   integer not null default 0,
  erledigt_am  timestamptz,
  erledigt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am  timestamptz not null default now()
);
create index aufgaben_schritte_aufgabe on public.aufgaben_schritte (aufgabe_id, sortierung);
alter table public.aufgaben_schritte enable row level security;
create policy aufgaben_schritte_lesen on public.aufgaben_schritte
  for select using (mandant_id = intern.aktueller_mandant());
create policy aufgaben_schritte_schreiben on public.aufgaben_schritte
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.aufgaben_kommentare (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  aufgabe_id    uuid not null references public.aufgaben(id) on delete cascade,
  text          text not null check (length(trim(text)) between 1 and 4000),
  system        boolean not null default false,
  benutzer_id   uuid references public.benutzer(id) on delete set null,
  benutzer_name text,
  erstellt_am   timestamptz not null default now()
);
create index aufgaben_kommentare_aufgabe on public.aufgaben_kommentare (aufgabe_id, erstellt_am);
alter table public.aufgaben_kommentare enable row level security;
create policy aufgaben_kommentare_lesen on public.aufgaben_kommentare
  for select using (mandant_id = intern.aktueller_mandant());
-- Kommentare sind ein Verlauf: anlegen ja, aendern und loeschen nein.
create policy aufgaben_kommentare_anlegen on public.aufgaben_kommentare
  for insert with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.aufgaben_tags (
  id          uuid primary key default gen_random_uuid(),
  mandant_id  uuid not null references public.mandanten(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 40),
  farbe       text not null default '#1B2A47' check (farbe ~ '^#[0-9a-fA-F]{6}$'),
  erstellt_am timestamptz not null default now(),
  unique (mandant_id, name)
);
alter table public.aufgaben_tags enable row level security;
create policy aufgaben_tags_lesen on public.aufgaben_tags
  for select using (mandant_id = intern.aktueller_mandant());
create policy aufgaben_tags_schreiben on public.aufgaben_tags
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create or replace function intern.aufgaben_kind_verweise_pruefen()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.aufgaben a where a.id = new.aufgabe_id and a.mandant_id = new.mandant_id) then
    raise exception 'Die Aufgabe gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;
create trigger aufgaben_schritte_verweise before insert or update on public.aufgaben_schritte
  for each row execute function intern.aufgaben_kind_verweise_pruefen();
create trigger aufgaben_kommentare_verweise before insert on public.aufgaben_kommentare
  for each row execute function intern.aufgaben_kind_verweise_pruefen();

-- Systemverlauf: Statuswechsel und Uebergabe an Kollegen, Wiederholung anlegen
create or replace function intern.aufgabe_nachlauf()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text; v_alt text; v_neu text; v_naechste date;
begin
  select name into v_name from public.benutzer where id = auth.uid();
  if tg_op = 'INSERT' then
    if new.zustaendig_id is not null and new.erstellt_von is not null and new.zustaendig_id <> new.erstellt_von then
      select name into v_neu from public.benutzer where id = new.zustaendig_id;
      insert into public.aufgaben_kommentare (mandant_id, aufgabe_id, text, system, benutzer_id, benutzer_name)
        values (new.mandant_id, new.id, 'Angelegt von ' || coalesce(v_name, 'System') || ' für ' || coalesce(v_neu, '?'), true, auth.uid(), v_name);
    end if;
    return new;
  end if;
  if old.status <> new.status then
    insert into public.aufgaben_kommentare (mandant_id, aufgabe_id, text, system, benutzer_id, benutzer_name)
      values (new.mandant_id, new.id, 'Status: ' || old.status || ' → ' || new.status, true, auth.uid(), v_name);
    -- Wiederholung: beim Erledigen entsteht die naechste Aufgabe
    if new.status = 'erledigt' and new.wiederholung is not null and new.faellig_am is not null then
      v_naechste := case new.wiederholung
        when 'taeglich' then new.faellig_am + 1
        when 'woechentlich' then new.faellig_am + 7
        when 'monatlich' then (new.faellig_am + interval '1 month')::date
        else (new.faellig_am + interval '1 year')::date end;
      insert into public.aufgaben (mandant_id, titel, beschreibung, prioritaet, faellig_am, objekt_id, kontakt_id, zustaendig_id, erstellt_von, typ, tags, wiederholung, quelle, team_sichtbar, lead_id, vertrag_id)
        values (new.mandant_id, new.titel, new.beschreibung, new.prioritaet, v_naechste, new.objekt_id, new.kontakt_id, new.zustaendig_id, new.erstellt_von, new.typ, new.tags, new.wiederholung, 'wiederholung', new.team_sichtbar, new.lead_id, new.vertrag_id);
    end if;
  end if;
  if coalesce(old.zustaendig_id, '00000000-0000-0000-0000-000000000000') <> coalesce(new.zustaendig_id, '00000000-0000-0000-0000-000000000000') then
    select name into v_alt from public.benutzer where id = old.zustaendig_id;
    select name into v_neu from public.benutzer where id = new.zustaendig_id;
    insert into public.aufgaben_kommentare (mandant_id, aufgabe_id, text, system, benutzer_id, benutzer_name)
      values (new.mandant_id, new.id, 'Übergeben: ' || coalesce(v_alt, '—') || ' → ' || coalesce(v_neu, '—'), true, auth.uid(), v_name);
  end if;
  return new;
end $$;
create trigger aufgaben_nachlauf after insert or update on public.aufgaben
  for each row execute function intern.aufgabe_nachlauf();

-- --- Checklisten-Vorlagen ----------------------------------------------------------
create table public.checklisten_vorlagen (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 160),
  bereich      text not null default 'allgemein' check (bereich in ('verkauf', 'vermietung', 'akquise', 'allgemein')),
  beschreibung text,
  ist_standard boolean not null default false,
  aktiv        boolean not null default true,
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);
create index checklisten_vorlagen_mandant on public.checklisten_vorlagen (mandant_id, bereich);
create trigger checklisten_vorlagen_geaendert before update on public.checklisten_vorlagen
  for each row execute function intern.setze_geaendert_am();
alter table public.checklisten_vorlagen enable row level security;
create policy checklisten_vorlagen_lesen on public.checklisten_vorlagen
  for select using (mandant_id = intern.aktueller_mandant());
create policy checklisten_vorlagen_schreiben on public.checklisten_vorlagen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.checklisten_vorlagen_punkte (
  id           uuid primary key default gen_random_uuid(),
  mandant_id   uuid not null references public.mandanten(id) on delete cascade,
  vorlage_id   uuid not null references public.checklisten_vorlagen(id) on delete cascade,
  titel        text not null check (length(trim(titel)) between 1 and 300),
  beschreibung text,
  pflicht      boolean not null default true,
  -- Passende Unterlagenart: liegt sie am Objekt, gilt der Punkt als erledigt
  dokumentart  public.dokumentart,
  frist_tage   integer check (frist_tage is null or frist_tage between 0 and 365),
  sortierung   integer not null default 0
);
create index checklisten_vorlagen_punkte_vorlage on public.checklisten_vorlagen_punkte (vorlage_id, sortierung);
alter table public.checklisten_vorlagen_punkte enable row level security;
create policy checklisten_vorlagen_punkte_lesen on public.checklisten_vorlagen_punkte
  for select using (mandant_id = intern.aktueller_mandant());
create policy checklisten_vorlagen_punkte_schreiben on public.checklisten_vorlagen_punkte
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

-- --- Laufende Checklisten -----------------------------------------------------------
create table public.checklisten (
  id              uuid primary key default gen_random_uuid(),
  mandant_id      uuid not null references public.mandanten(id) on delete cascade,
  vorlage_id      uuid references public.checklisten_vorlagen(id) on delete set null,
  name            text not null check (length(trim(name)) between 1 and 200),
  bereich         text not null default 'allgemein' check (bereich in ('verkauf', 'vermietung', 'akquise', 'allgemein')),
  objekt_id       uuid references public.objekte(id) on delete cascade,
  kontakt_id      uuid references public.kontakte(id) on delete cascade,
  lead_id         uuid references public.akquise_leads(id) on delete cascade,
  vertrag_id      uuid references public.vertraege(id) on delete cascade,
  zustaendig_id   uuid references public.benutzer(id) on delete set null,
  abgeschlossen_am timestamptz,
  erstellt_von    uuid references public.benutzer(id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),
  constraint checkliste_hat_bezug check (objekt_id is not null or kontakt_id is not null or lead_id is not null or vertrag_id is not null)
);
create index checklisten_mandant on public.checklisten (mandant_id, abgeschlossen_am);
create index checklisten_objekt on public.checklisten (objekt_id);
create index checklisten_kontakt on public.checklisten (kontakt_id);
create index checklisten_lead on public.checklisten (lead_id);
create trigger checklisten_geaendert before update on public.checklisten
  for each row execute function intern.setze_geaendert_am();
alter table public.checklisten enable row level security;
create policy checklisten_lesen on public.checklisten
  for select using (mandant_id = intern.aktueller_mandant());
create policy checklisten_schreiben on public.checklisten
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create table public.checklisten_punkte (
  id            uuid primary key default gen_random_uuid(),
  mandant_id    uuid not null references public.mandanten(id) on delete cascade,
  checkliste_id uuid not null references public.checklisten(id) on delete cascade,
  titel         text not null check (length(trim(titel)) between 1 and 300),
  beschreibung  text,
  pflicht       boolean not null default true,
  dokumentart   public.dokumentart,
  faellig_am    date,
  status        text not null default 'offen' check (status in ('offen', 'erledigt', 'nicht_noetig')),
  erledigt_am   timestamptz,
  erledigt_von  uuid references public.benutzer(id) on delete set null,
  dokument_id   uuid references public.objekt_dokumente(id) on delete set null,
  aufgabe_id    uuid references public.aufgaben(id) on delete set null,
  notiz         text,
  sortierung    integer not null default 0
);
create index checklisten_punkte_liste on public.checklisten_punkte (checkliste_id, sortierung);
create index checklisten_punkte_offen on public.checklisten_punkte (mandant_id, dokumentart) where status = 'offen' and dokumentart is not null;
alter table public.checklisten_punkte enable row level security;
create policy checklisten_punkte_lesen on public.checklisten_punkte
  for select using (mandant_id = intern.aktueller_mandant());
create policy checklisten_punkte_schreiben on public.checklisten_punkte
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());

create or replace function intern.checklisten_verweise_pruefen()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'checklisten_vorlagen_punkte' then
    if not exists (select 1 from public.checklisten_vorlagen v where v.id = new.vorlage_id and v.mandant_id = new.mandant_id) then
      raise exception 'Die Vorlage gehoert nicht zu diesem Mandanten.';
    end if;
    return new;
  end if;
  if tg_table_name = 'checklisten_punkte' then
    if not exists (select 1 from public.checklisten c where c.id = new.checkliste_id and c.mandant_id = new.mandant_id) then
      raise exception 'Die Checkliste gehoert nicht zu diesem Mandanten.';
    end if;
    if new.status = 'erledigt' and new.erledigt_am is null then new.erledigt_am := now(); new.erledigt_von := coalesce(new.erledigt_von, auth.uid()); end if;
    if new.status = 'offen' then new.erledigt_am := null; new.erledigt_von := null; end if;
    return new;
  end if;
  if new.objekt_id is not null and not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.mandant_id = new.mandant_id) then
    raise exception 'Das Objekt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.kontakt_id is not null and not exists (select 1 from public.kontakte k where k.id = new.kontakt_id and k.mandant_id = new.mandant_id) then
    raise exception 'Der Kontakt gehoert nicht zu diesem Mandanten.';
  end if;
  if new.lead_id is not null and not exists (select 1 from public.akquise_leads l where l.id = new.lead_id and l.mandant_id = new.mandant_id) then
    raise exception 'Der Lead gehoert nicht zu diesem Mandanten.';
  end if;
  if new.vertrag_id is not null and not exists (select 1 from public.vertraege v where v.id = new.vertrag_id and v.mandant_id = new.mandant_id) then
    raise exception 'Der Vertrag gehoert nicht zu diesem Mandanten.';
  end if;
  return new;
end $$;
create trigger checklisten_vorlagen_punkte_verweise before insert or update on public.checklisten_vorlagen_punkte
  for each row execute function intern.checklisten_verweise_pruefen();
create trigger checklisten_punkte_verweise before insert or update on public.checklisten_punkte
  for each row execute function intern.checklisten_verweise_pruefen();
create trigger checklisten_verweise before insert or update on public.checklisten
  for each row execute function intern.checklisten_verweise_pruefen();

-- Abschluss: sobald kein Pflichtpunkt mehr offen ist
create or replace function intern.checkliste_abschluss_pruefen()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := coalesce(new.checkliste_id, old.checkliste_id); v_offen integer;
begin
  select count(*) into v_offen from public.checklisten_punkte where checkliste_id = v_id and pflicht and status = 'offen';
  update public.checklisten set abgeschlossen_am = case when v_offen = 0 then coalesce(abgeschlossen_am, now()) else null end where id = v_id;
  return null;
end $$;
create trigger checklisten_punkte_abschluss after insert or update or delete on public.checklisten_punkte
  for each row execute function intern.checkliste_abschluss_pruefen();

-- Unterlage am Objekt erledigt den passenden Punkt (Referenz: erledigt_durch_dokument)
create or replace function intern.checkliste_durch_dokument()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.checklisten_punkte p
     set status = 'erledigt', erledigt_am = now(), erledigt_von = coalesce(auth.uid(), new.erstellt_von), dokument_id = new.id
    from public.checklisten c
   where p.checkliste_id = c.id and c.objekt_id = new.objekt_id and c.abgeschlossen_am is null
     and p.status = 'offen' and p.dokumentart = new.art and p.dokument_id is null;
  return null;
end $$;
create trigger objekt_dokumente_checkliste after insert on public.objekt_dokumente
  for each row execute function intern.checkliste_durch_dokument();

-- --- Checkliste aus Vorlage anlegen --------------------------------------------------
create or replace function public.checkliste_aus_vorlage(p_vorlage uuid, p_objekt uuid default null, p_kontakt uuid default null, p_lead uuid default null, p_vertrag uuid default null, p_name text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m uuid := intern.aktueller_mandant(); v_v record; v_id uuid;
begin
  if v_m is null or not intern.darf_schreiben() then raise exception 'Nicht erlaubt.'; end if;
  select * into v_v from public.checklisten_vorlagen where id = p_vorlage and mandant_id = v_m;
  if v_v.id is null then raise exception 'Unbekannte Vorlage.'; end if;
  insert into public.checklisten (mandant_id, vorlage_id, name, bereich, objekt_id, kontakt_id, lead_id, vertrag_id, zustaendig_id, erstellt_von)
    values (v_m, v_v.id, coalesce(nullif(trim(p_name), ''), v_v.name), v_v.bereich, p_objekt, p_kontakt, p_lead, p_vertrag, auth.uid(), auth.uid())
    returning id into v_id;
  insert into public.checklisten_punkte (mandant_id, checkliste_id, titel, beschreibung, pflicht, dokumentart, faellig_am, sortierung)
    select v_m, v_id, titel, beschreibung, pflicht, dokumentart, case when frist_tage is null then null else current_date + frist_tage end, sortierung
      from public.checklisten_vorlagen_punkte where vorlage_id = v_v.id order by sortierung;
  -- Bereits vorhandene Unterlagen am Objekt gelten sofort
  if p_objekt is not null then
    update public.checklisten_punkte p
       set status = 'erledigt', erledigt_am = now(), erledigt_von = auth.uid(), dokument_id = d.id
      from public.objekt_dokumente d
     where p.checkliste_id = v_id and p.dokumentart is not null and d.objekt_id = p_objekt and d.art = p.dokumentart and p.status = 'offen';
  end if;
  return v_id;
end $$;
revoke all on function public.checkliste_aus_vorlage(uuid, uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.checkliste_aus_vorlage(uuid, uuid, uuid, uuid, uuid, text) to authenticated, service_role;

-- --- Standard-Vorlagen je Mandant ---------------------------------------------------
create or replace function public.checklisten_standard_anlegen()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m uuid := intern.aktueller_mandant(); v_id uuid; n integer := 0;
begin
  if v_m is null or not intern.darf_schreiben() then raise exception 'Nicht erlaubt.'; end if;
  if exists (select 1 from public.checklisten_vorlagen where mandant_id = v_m) then return 0; end if;
  insert into public.checklisten_vorlagen (mandant_id, name, bereich, beschreibung, ist_standard) values (v_m, 'Unterlagen Verkauf', 'verkauf', 'Was vom Eigentümer für Exposé, Portale und Notar vorliegen muss', true) returning id into v_id;
  insert into public.checklisten_vorlagen_punkte (mandant_id, vorlage_id, titel, pflicht, dokumentart, frist_tage, sortierung) values
    (v_m, v_id, 'Grundbuchauszug (nicht älter als 3 Monate)', true, 'grundbuchauszug', 14, 1),
    (v_m, v_id, 'Energieausweis', true, 'energieausweis', 14, 2),
    (v_m, v_id, 'Grundrisse', true, 'grundriss', 7, 3),
    (v_m, v_id, 'Flurkarte / Lageplan', true, 'flurkarte', 14, 4),
    (v_m, v_id, 'Wohnflächenberechnung', true, 'wohnflaechenberechnung', 14, 5),
    (v_m, v_id, 'Teilungserklärung (bei Wohnungseigentum)', false, 'teilungserklaerung', 21, 6),
    (v_m, v_id, 'Baubeschreibung', false, 'baubeschreibung', 21, 7),
    (v_m, v_id, 'Maklervertrag unterschrieben', true, 'maklervertrag', 7, 8),
    (v_m, v_id, 'Exposé freigegeben', true, 'expose', 21, 9);
  n := n + 1;
  insert into public.checklisten_vorlagen (mandant_id, name, bereich, beschreibung, ist_standard) values (v_m, 'Unterlagen Vermietung', 'vermietung', 'Vom Mietinteressenten bis zur Übergabe', true) returning id into v_id;
  insert into public.checklisten_vorlagen_punkte (mandant_id, vorlage_id, titel, pflicht, dokumentart, frist_tage, sortierung) values
    (v_m, v_id, 'Mieterselbstauskunft', true, null, 7, 1),
    (v_m, v_id, 'Einkommensnachweise (3 Monate)', true, null, 7, 2),
    (v_m, v_id, 'Bonitätsauskunft', true, null, 7, 3),
    (v_m, v_id, 'Mietschuldenfreiheitsbescheinigung', false, null, 7, 4),
    (v_m, v_id, 'Ausweiskopie', true, null, 7, 5),
    (v_m, v_id, 'Mietvertrag unterschrieben', true, 'mietvertrag', 14, 6),
    (v_m, v_id, 'Übergabeprotokoll', true, 'protokoll', 30, 7);
  n := n + 1;
  insert into public.checklisten_vorlagen (mandant_id, name, bereich, beschreibung, ist_standard) values (v_m, 'Akquise bis Auftrag', 'akquise', 'Vom Erstkontakt bis zum Maklervertrag', true) returning id into v_id;
  insert into public.checklisten_vorlagen_punkte (mandant_id, vorlage_id, titel, pflicht, dokumentart, frist_tage, sortierung) values
    (v_m, v_id, 'Erstkontakt und Verkaufsabsicht klären', true, null, 1, 1),
    (v_m, v_id, 'Objektaufnahme vor Ort', true, null, 7, 2),
    (v_m, v_id, 'Wertindikation erstellen und versenden', true, null, 10, 3),
    (v_m, v_id, 'Vermarktungsstrategie besprechen', true, null, 14, 4),
    (v_m, v_id, 'Maklervertrag vorlegen', true, 'maklervertrag', 21, 5);
  n := n + 1;
  insert into public.checklisten_vorlagen (mandant_id, name, bereich, beschreibung, ist_standard) values (v_m, 'Objektaufnahme vor Ort', 'allgemein', 'Was beim Termin nicht vergessen werden darf', true) returning id into v_id;
  insert into public.checklisten_vorlagen_punkte (mandant_id, vorlage_id, titel, pflicht, dokumentart, frist_tage, sortierung) values
    (v_m, v_id, 'Fotos aller Räume und Außenansicht', true, null, 0, 1),
    (v_m, v_id, 'Zählerstände und Heizungsart', true, null, 0, 2),
    (v_m, v_id, 'Mängel und Sanierungen notieren', true, null, 0, 3),
    (v_m, v_id, 'Schlüsselanzahl', false, null, 0, 4),
    (v_m, v_id, 'Preisvorstellung des Eigentümers', true, null, 0, 5);
  n := n + 1;
  return n;
end $$;
revoke all on function public.checklisten_standard_anlegen() from public;
grant execute on function public.checklisten_standard_anlegen() to authenticated, service_role;

-- --- Tutorial je Benutzer ----------------------------------------------------------------
alter table public.benutzer add column tutorial_gesehen_am timestamptz;

-- --- Credit-Preis: Rechtschreib- und Grammatikkorrektur -------------------------------
insert into public.credit_preise (aktion, bezeichnung, credits) values
  ('ki_text_korrektur', 'Rechtschreib- und Grammatikkorrektur eines Textes', 1)
on conflict (aktion) do nothing;
