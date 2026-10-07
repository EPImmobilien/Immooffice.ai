-- ===========================================================================
-- fork_80 — Nachlese der Supabase-Advisors fuer die Betreiber-Objekte
-- ===========================================================================
-- Auftrag Betreiber-Dashboard, Abschnitt 19: „Supabase-Advisors
-- (Security/Performance) nach jeder Migration pruefen und Warnungen beheben."
-- Gepruft am 07.10.2026 nach fork_79. Behoben wird hier, was zu den
-- Betreiber-Objekten (fork_47–fork_79) gehoert:
--
--   * function_search_path_mutable: die zwei Trigger-Funktionen der
--     Unveraenderlichkeit (Ledger, Audit-Log) bekommen einen festen
--     search_path. Die 75 uebrigen Funktionen sind Vorlage/Altbestand
--     (docs/OFFEN.md).
--   * auth_rls_initplan: acht Richtlinien rufen auth.uid() je Zeile statt
--     einmal je Abfrage. Gleiche Bedingung, in (select auth.uid()) gefasst.
--   * unindexed_foreign_keys: 17 Fremdschluessel der Betreiber-Tabellen
--     bekommen einen Index.
--
-- NICHT behoben, mit Grund:
--   * authenticated_security_definer_function_executable (124): gewollt.
--     Das Gate tests/funktionsrechte.sql verlangt EXECUTE fuer authenticated
--     auf allen Funktionen ausser den Geldfunktionen; jede Betreiberfunktion
--     prueft plattform_rolle() im Koerper (42501).
--   * rls_enabled_no_policy auf ankuendigungen, mandant_ki_limits,
--     plattform_warnregeln, plattform_warnungen, system_mail_vorlagen:
--     gewollt — nur der Dienstschluessel schreibt und liest; Angemeldete
--     bekommen die Daten ueber Funktionen (meine_ankuendigungen,
--     system_mail_rendern) oder gar nicht.
--   * multiple_permissive_policies auf plattform_*: lesen (alle) und pflegen
--     (owner/admin) sind zwei Richtlinien mit Absicht; eine zusammengelegte
--     waere schwerer zu lesen und nicht schneller messbar.
--   * auth_leaked_password_protection: Konsole des Betreibers (docs/ADMIN.md).
--
-- RUECKNAHME: drop index der 17 Indizes; alter function … reset search_path;
-- die Richtlinien aus fork_47/52/54/55/77/78 wiederherstellen.
-- ===========================================================================

-- --- search_path -------------------------------------------------------------
alter function public.credit_buchung_unveraenderlich() set search_path = public;
alter function public.plattform_protokoll_unveraenderlich() set search_path = public;

-- --- Richtlinien: auth.uid() einmal je Abfrage ---------------------------------
drop policy if exists credit_buchungen_lesen on public.credit_buchungen;
create policy credit_buchungen_lesen on public.credit_buchungen for select to authenticated
  using (coalesce(public.aktuelle_rolle(), '') = 'chef' or nutzer_id = (select auth.uid()));

drop policy if exists fehler_protokoll_melden on public.fehler_protokoll;
create policy fehler_protokoll_melden on public.fehler_protokoll for insert to authenticated
  with check (benutzer_id is null or benutzer_id = (select auth.uid()));

drop policy if exists plattform_admins_lesen on public.plattform_admins;
create policy plattform_admins_lesen on public.plattform_admins for select to authenticated
  using (benutzer_id = (select auth.uid()) or public.ist_plattform_admin());

drop policy if exists rechtstext_zustimmungen_anlegen on public.rechtstext_zustimmungen;
create policy rechtstext_zustimmungen_anlegen on public.rechtstext_zustimmungen for insert to authenticated
  with check (mandant_id = public.aktuelle_mandant_id() and nutzer_id = (select auth.uid())
              and coalesce(public.aktuelle_rolle(), '') = 'chef');

drop policy if exists support_anfragen_anlegen on public.support_anfragen;
create policy support_anfragen_anlegen on public.support_anfragen for insert to authenticated
  with check (mandant_id = public.aktuelle_mandant_id() and nutzer_id = (select auth.uid())
              and status = 'offen' and zustaendig_id is null and uebernahme_status is null
              and paket_rechnung_id is null);

drop policy if exists support_antworten_anlegen on public.support_antworten;
create policy support_antworten_anlegen on public.support_antworten for insert to authenticated
  with check (mandant_id = public.aktuelle_mandant_id() and autor_id = (select auth.uid())
              and von_betreiber = false
              and exists (select 1 from public.support_anfragen a
                           where a.id = anfrage_id and a.mandant_id = support_antworten.mandant_id
                             and a.status <> 'geschlossen'));

drop policy if exists support_protokoll_lesen on public.support_protokoll;
create policy support_protokoll_lesen on public.support_protokoll for select to authenticated
  using (mandant_id = (select p.mandant_id from public.profiles p where p.id = (select auth.uid())));

drop policy if exists support_sitzungen_lesen on public.support_sitzungen;
create policy support_sitzungen_lesen on public.support_sitzungen for select to authenticated
  using (admin_id = (select auth.uid())
         or mandant_id = (select p.mandant_id from public.profiles p where p.id = (select auth.uid())));

-- --- Indizes auf Fremdschluessel ------------------------------------------------
create index if not exists credit_buchungen_konto_idx on public.credit_buchungen (konto_id);
create index if not exists credit_buchungen_nutzer_idx on public.credit_buchungen (nutzer_id);
create index if not exists fehler_protokoll_benutzer_idx on public.fehler_protokoll (benutzer_id);
create index if not exists mandant_abo_tarif_idx on public.mandant_abo (tarif);
create index if not exists mandant_features_feature_idx on public.mandant_features (feature);
create index if not exists plattform_admins_erstellt_von_idx on public.plattform_admins (erstellt_von);
create index if not exists plattform_notizen_admin_idx on public.plattform_notizen (admin_id);
create index if not exists plattform_protokoll_benutzer_idx on public.plattform_protokoll (benutzer_id);
create index if not exists plattform_tarife_geaendert_von_idx on public.plattform_tarife (geaendert_von);
create index if not exists plattform_warnungen_mandant_idx on public.plattform_warnungen (mandant_id);
create index if not exists plattform_warnungen_regel_idx on public.plattform_warnungen (regel);
create index if not exists rechtstext_zustimmungen_text_idx on public.rechtstext_zustimmungen (rechtstext_id);
create index if not exists support_anfragen_nutzer_idx on public.support_anfragen (nutzer_id);
create index if not exists support_anfragen_zustaendig_idx on public.support_anfragen (zustaendig_id);
create index if not exists support_sitzungen_beendet_von_idx on public.support_sitzungen (beendet_von);
create index if not exists support_sitzungen_freigegeben_von_idx on public.support_sitzungen (freigegeben_von);
create index if not exists tarif_features_feature_idx on public.tarif_features (feature);
