-- Führt eine MANDANT-Tabelle Zeilen ohne Mandanten?
--
-- Am 06.10.2026 gemeldet: „im postfach wird meine testmail bisher nicht
-- angezeigt". Der Abruf lief, 156 Mails und 15 Ordner standen in der
-- Datenbank — sichtbar war keine. Alle 171 Zeilen hatten `mandant_id = null`,
-- und die restriktive Richtlinie vergleicht `mandant_id =
-- aktuelle_mandant_id()`: `null = irgendwas` ist null, nicht wahr.
--
-- Warum es niemand merkte, ist der eigentliche Punkt:
--
--   * Der Dienstschlüssel umgeht RLS. Die Einfügung gelang ohne Murren.
--   * Der Vorgabewert `aktuelle_mandant_id()` greift nur bei einem
--     ANGEMELDETEN Nutzer. Ein Cron-Lauf hat keinen.
--   * `tests/mandant-rundumschlag.sql` prüft die RICHTLINIEN — die waren in
--     Ordnung. Dass sie auf Zeilen angewendet werden, die niemandem
--     gehören, sieht es nicht.
--   * Die Prüfung „Edge Functions: schreiben sie mit Mandanten?" liest
--     Quelltext, aber nur die ÖFFENTLICHEN Endpunkte. `mail-postfach-pull`
--     läuft aus dem Zeitplan und fiel nicht darunter.
--
-- Vier Gates, und keines stellte die einfachste Frage: steht in der
-- Tabelle etwas, das niemandem gehört? Dieses tut es. Es ist eine
-- Bestandsprüfung und keine Strukturprüfung — sie findet den Fehler nicht
-- im Code, sondern an seinem Ergebnis, und zwar bei der ersten Zeile.
--
-- In `npm run check` läuft es gegen eine frisch migrierte Instanz; dort
-- sind die Tabellen fast alle leer, und es prüft vor allem die Zeilen, die
-- Migrationen und Tests selbst anlegen. Seinen eigentlichen Wert hat es
-- gegen das laufende Projekt — dafür steht der Aufruf in `docs/BETRIEB.md`.

\set ON_ERROR_STOP on
\pset pager off

create temporary table befund (tabelle text, zeilen bigint, ohne bigint);
grant all on befund to public;

-- Jede Tabelle, die `mandanten_einstufung` als MANDANT führt und eine
-- Spalte `mandant_id` hat. Die Liste kommt aus der Datenbank und nicht von
-- hier: eine zweite Liste wäre eine, die man doppelt pflegt.
do $$
declare t record; n bigint; o bigint;
begin
  for t in
    select e.tabelle from public.mandanten_einstufung e
     where e.gruppe = 'MANDANT'
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = e.tabelle
                      and c.column_name = 'mandant_id')
       and to_regclass('public.' || quote_ident(e.tabelle)) is not null
     order by e.tabelle
  loop
    execute format('select count(*), count(*) filter (where mandant_id is null) '
                   'from public.%I', t.tabelle) into n, o;
    if o > 0 then
      insert into befund values (t.tabelle, n, o);
    end if;
  end loop;
end $$;

-- Mit Grund erlaubt. Nur eine Zeile, und sie ist begründet:
-- Systemvorlagen gehören ausdrücklich keinem Mandanten (fork_37) — sie sind
-- für alle lesbar und für niemanden schreibbar. Eine Vorlage MIT Mandanten
-- in dieser Tabelle ist die Kopie eines Kunden.
delete from befund where tabelle = 'expose_vorlagen';

select tabelle, zeilen, ohne from befund order by ohne desc, tabelle;

do $$
declare n int; liste text;
begin
  select count(*), string_agg(format('%s (%s von %s)', tabelle, ohne, zeilen), '; ')
    into n, liste from befund;
  if n > 0 then
    raise exception 'Zeilen ohne Mandanten in % Tabelle(n) — %. '
      'Sie sind fuer jeden Nutzer unsichtbar: die restriktive Richtlinie '
      'vergleicht mandant_id = aktuelle_mandant_id(), und null ist nicht '
      'gleich irgendwas. Wer sie geschrieben hat, lief mit dem '
      'Dienstschluessel und hat den Mandanten nicht mitgegeben.', n, liste;
  end if;
  raise notice 'Keine MANDANT-Tabelle fuehrt Zeilen ohne Mandanten.';
end $$;
