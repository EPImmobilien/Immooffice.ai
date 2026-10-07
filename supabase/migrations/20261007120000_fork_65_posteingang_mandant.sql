-- ===========================================================================
-- fork_65 — der Posteingang war leer, obwohl 156 Mails darin lagen
-- ===========================================================================
-- Gemeldet am 06.10.2026: „im postfach wird meine testmail bisher nicht
-- angezeigt". Der Abruf lief, und er lief richtig: 156 Mails und 15 Ordner
-- standen in der Datenbank. Sichtbar war keine einzige.
--
-- `mail_eingang`, `mail_ordner` und `mietanfragen` sind MANDANT-Tabellen,
-- und ihre Spalte `mandant_id` hat den Vorgabewert `aktuelle_mandant_id()`.
-- Der greift nur bei einem ANGEMELDETEN Nutzer. `mail-postfach-pull` läuft
-- aus dem Zeitplan mit dem Dienstschlüssel — dort ist `auth.uid()` null,
-- also auch der Vorgabewert. Eingefügt wurde mit `mandant_id = null`, und
-- die restriktive Richtlinie vergleicht `mandant_id = aktuelle_mandant_id()`:
-- `null = irgendwas` ist null, nicht wahr. Der Dienstschlüssel umgeht RLS
-- und schrieb ohne Murren; der Nutzer sah nichts.
--
-- Genau diese Lücke steht in `docs/ENTSCHEIDUNGEN.md` seit dem 28.09.2026
-- unter „Was offen bleibt": „NOT NULL auf mandant_id. Der Vorgabewert
-- greift nur bei angemeldetem Nutzer; Edge Functions arbeiten mit
-- service_role." Sie ist nicht theoretisch geblieben.
--
-- Die Funktion schreibt den Mandanten des Postfachs jetzt mit (fork_65 im
-- Erzeuger). Diese Migration holt nach, was schon liegt — und zwar nur
-- dort, wo die Herkunft eindeutig ist: über das Postfach, über das Objekt.
-- Geraten wird nichts.
--
-- Dass es nicht wieder vorkommt, prüft `tests/mandant-ohne.sql`: keine
-- MANDANT-Tabelle darf Zeilen ohne Mandanten führen.
-- ===========================================================================

-- --- Mails und Ordner: der Mandant steht am Postfach ------------------------
update public.mail_eingang e
   set mandant_id = p.mandant_id
  from public.mail_postfaecher p
 where p.id = e.postfach_id
   and e.mandant_id is null
   and p.mandant_id is not null;

update public.mail_ordner o
   set mandant_id = p.mandant_id
  from public.mail_postfaecher p
 where p.id = o.postfach_id
   and o.mandant_id is null
   and p.mandant_id is not null;

-- --- Dateien und KI-Prüfungen: der Mandant steht am Objekt ------------------
-- Ein erzeugtes Exposé-PDF vom 28.09.2026 hing in derselben Falle.
update public.immobilie_datei d
   set mandant_id = i.mandant_id
  from public.immobilien i
 where i.id = d.immobilie_id
   and d.mandant_id is null
   and i.mandant_id is not null;

update public.ki_pruefungen k
   set mandant_id = i.mandant_id
  from public.immobilien i
 where i.id = k.immobilie_id
   and k.mandant_id is null
   and i.mandant_id is not null;

do $$
declare offen int;
begin
  select (select count(*) from public.mail_eingang where mandant_id is null)
       + (select count(*) from public.mail_ordner where mandant_id is null)
       + (select count(*) from public.immobilie_datei where mandant_id is null)
       + (select count(*) from public.ki_pruefungen where mandant_id is null)
    into offen;
  raise notice 'Nach dem Nachtragen ohne Mandanten: % Zeile(n).', offen;
end $$;

-- ---------------------------------------------------------------------------
-- Derselbe Fehler an einer zweiten Stelle — gefunden vom neuen Gate
-- ---------------------------------------------------------------------------
-- `tests/mandant-ohne.sql` hat beim ersten Lauf nicht nur die Mails
-- gemeldet, sondern auch zwei Zeilen in `aktivitaeten` vom Typ
-- `nachricht_vom_neubaukunden`. Dahinter steckt derselbe Mechanismus:
--
-- `projekt_nachricht_glocke()` ist ein Trigger auf `projekt_nachrichten`.
-- Er legt die Glocken-Meldung für den Makler an, wenn ein Neubaukunde im
-- Kundenportal schreibt. Der Kunde ist KEIN angemeldeter Nutzer der
-- Anwendung — er hat kein Profil, also ist `aktuelle_mandant_id()` null,
-- also auch der Vorgabewert der Spalte.
--
-- Wirkung: Der Kunde schreibt, die Meldung entsteht, und der Makler sieht
-- sie nie. Eine Glocke, die nicht klingelt.
--
-- Der Mandant steht am Projekt. Von dort wird er geholt — und wenn das
-- Projekt keinen hat, bleibt die Zeile leer statt geraten zu werden
-- (dieselbe Regel wie beim Wächter `mandant_aus_eltern`: lieber sichtbar
-- unvollständig als falsch zugeordnet).
-- ---------------------------------------------------------------------------

create or replace function public.projekt_nachricht_glocke()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_projekt text; v_ansprech uuid; v_name text; v_mandant uuid;
begin
  if new.richtung <> 'kunde' then return new; end if;
  select p.name, p.mandant_id into v_projekt, v_mandant
    from projekte p where p.id = new.projekt_id;
  select z.ansprechpartner_id, coalesce(nullif(z.anzeigename,''), z.email)
    into v_ansprech, v_name
    from projekt_zugaenge z where z.id = new.zugang_id;
  insert into aktivitaeten (zielgruppe, empfaenger_user_id, typ, titel, text,
                            ref_tabelle, ref_id, mandant_id)
  values ('makler', v_ansprech, 'nachricht_vom_neubaukunden',
          '💬 Neubau-Nachricht von ' || coalesce(v_name, new.absender_name, 'Kunde'),
          left(new.text, 300) || case when v_projekt is not null
            then ' – Projekt „' || v_projekt || '“ → Neubauprojekte → Nachrichten'
            else '' end,
          'projekt_nachrichten', new.id, v_mandant);
  return new;
end $function$;

comment on function public.projekt_nachricht_glocke() is
  'Glocke fuer den Makler, wenn ein Neubaukunde schreibt. Traegt den '
  'Mandanten des Projekts: der Kunde ist kein angemeldeter Nutzer, der '
  'Vorgabewert der Spalte greift fuer ihn nicht (fork_65).';

update public.aktivitaeten a
   set mandant_id = p.mandant_id
  from public.projekt_nachrichten n
  join public.projekte p on p.id = n.projekt_id
 where a.ref_tabelle = 'projekt_nachrichten'
   and a.ref_id = n.id
   and a.mandant_id is null
   and p.mandant_id is not null;
