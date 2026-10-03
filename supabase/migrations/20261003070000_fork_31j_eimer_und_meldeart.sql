-- ===========================================================================
-- Fork-eigene Migration 31j — zwei Eimer und eine Abrufart
--
-- scan-dateien (Stufe 124/125): Punktwolken und Raumscans aus der App.
-- transfer-dateien (Stufe 117): Dateien eines Transfers ohne Objekt.
--
-- BEIDE PRIVAT. Die restriktive Richtlinie aus fork_09 gilt fuer jeden
-- Eimer: das erste Pfadsegment ist die Mandantenkennung, mit UND verknuepft
-- und von keiner erlaubenden Richtlinie aufzuheben. Ein neuer Eimer ist
-- damit sofort getrennt, ohne eigene Richtlinie.
--
-- 2 GB je Datei: eine Punktwolke aus einem LiDAR-Scan erreicht diese
-- Groessenordnung. Das Limit gilt JE DATEI, nicht je Mandant — eine Grenze
-- fuer den Gesamtverbrauch gibt es auf dieser Ebene nicht und gehoert zur
-- Abrechnung (Gate 3).
--
-- ZU transfer-dateien: die Oberflaeche laedt dorthin als nackter XHR an die
-- Storage-API, nicht ueber supabase-js — und laeuft damit NEBEN der
-- Storage-Huelle vorbei, die sonst jedem Pfad den Mandanten voranstellt.
-- Ohne Zutun fehlte das erste Pfadsegment und die Richtlinie wiese den
-- Upload ab. Der Erzeuger stellt den Mandanten deshalb in der Oberflaeche
-- voran (Regel "Transfer: der XHR-Upload stellt den Mandanten voran").
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit)
  values ('scan-dateien', 'scan-dateien', false, 2147483648)
  on conflict (id) do update set public = false,
                                 file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
  values ('transfer-dateien', 'transfer-dateien', false, 2147483648)
  on conflict (id) do update set public = false,
                                 file_size_limit = excluded.file_size_limit;

-- 'gemeldet' fehlte in der Liste der Abrufarten. Die Meldemail an den
-- Ersteller braucht einen Eintrag im Protokoll, sonst kann der naechste
-- Cron-Lauf nicht erkennen, dass schon gemeldet wurde, und schickt die
-- Meldung alle fuenf Minuten erneut.
alter table public.unterlagen_link_abrufe
  drop constraint if exists unterlagen_link_abrufe_art_check;
alter table public.unterlagen_link_abrufe
  add constraint unterlagen_link_abrufe_art_check
  check (art in ('geoeffnet', 'passwort_falsch', 'download', 'zip', 'abgelaufen', 'gemeldet'));
