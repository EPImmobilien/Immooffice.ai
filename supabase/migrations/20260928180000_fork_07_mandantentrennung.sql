-- ===========================================================================
-- Fork-eigene Migration 07 — die Mandantentrennung selbst
--
-- Die Vorlage hat 351 Richtlinien. Sie pruefen die ROLLE (ist_team(),
-- ist_chef(), "gehoert mir") und sind darin richtig. Was ihnen fehlt, ist der
-- Mandant.
--
-- Der naheliegende Weg waere, alle 351 umzuschreiben und jeder ein
-- `and mandant_id = aktuelle_mandant_id()` anzuhaengen. Das waere 351 Mal
-- Gelegenheit, sich zu vertun, und es wuerde die Rollenlogik der Vorlage
-- anfassen, die nicht angefasst werden soll (CLAUDE.md, Phase 9).
--
-- Postgres kann es besser. Eine RESTRICTIVE Richtlinie wird mit UND
-- verknuepft, nicht mit ODER. Eine einzige je Tabelle genuegt also, und sie
-- ist nicht zu umgehen: keine noch so grosszuegige permissive Richtlinie
-- kann sie aufheben. Die 351 vorhandenen bleiben unveraendert.
--
--   permissiv (Vorlage):   darf ich das ueberhaupt?      -- ODER-verknuepft
--   restriktiv (hier):     ist es mein Mandant?          -- UND-verknuepft
--
-- `to public` und nicht `to authenticated`: die Trennung soll fuer jede Rolle
-- gelten, auch fuer eine, die spaeter hinzukommt. service_role umgeht RLS
-- ohnehin — das ist der Weg der Edge Functions und bleibt es.
--
-- Eine Zeile mit mandant_id = null ist damit fuer jeden unsichtbar (null = x
-- ist niemals wahr). Das ist die sichere Richtung: kein fremder Zugriff,
-- sondern ein Datensatz, der auffaellt, weil ihn niemand findet.
-- ===========================================================================

do $$
declare r record; n int := 0;
begin
  for r in select tabelle from public.mandanten_einstufung
            where gruppe = 'MANDANT' order by tabelle loop
    execute format(
      'create policy "mandant_trennung" on public.%I '
      'as restrictive for all to public '
      'using (mandant_id = public.aktuelle_mandant_id()) '
      'with check (mandant_id = public.aktuelle_mandant_id())', r.tabelle);
    n := n + 1;
  end loop;
  raise notice 'Mandantentrennung auf % Tabellen', n;
end $$;

create policy "gesellschaften_mandant_trennung" on public.gesellschaften
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

create policy "firma_stammdaten_mandant_trennung" on public.firma_stammdaten
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

create policy "profiles_mandant_trennung" on public.profiles
  as restrictive for all to public
  using (mandant_id = public.aktuelle_mandant_id())
  with check (mandant_id = public.aktuelle_mandant_id());

-- Aufraeumen: die Tabelle heisst seit fork_05 mandanten, ihre Bedingungen
-- trugen noch den alten Namen. Ein Fehler, der auf "konten_slug_key" zeigt,
-- schickt den Leser sonst auf die Suche nach einer Tabelle, die es nicht gibt.
alter table public.mandanten rename constraint konten_pkey to mandanten_pkey;
alter table public.mandanten rename constraint konten_slug_key to mandanten_slug_key;
alter table public.mandanten rename constraint konten_abo_status_check to mandanten_abo_status_check;
