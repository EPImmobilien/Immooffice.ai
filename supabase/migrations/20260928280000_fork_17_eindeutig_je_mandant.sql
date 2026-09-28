-- ===========================================================================
-- Fork-eigene Migration 17 — eindeutig je Mandant, nicht global
--
-- BEFUND (28.09.2026): 41 Eindeutigkeitsregeln auf Mandantentabellen enthalten
-- die Spalte mandant_id nicht. Die meisten zu Recht — ein Zufallstoken, eine
-- Fremdkennung oder ein zusammengesetzter Schluessel ueber eine ohnehin
-- mandantengebundene Elterntabelle ist richtig global eindeutig.
--
-- Zehn sind es nicht. Sie tragen einen NAMEN, den ein zweiter Mandant mit
-- demselben Recht fuehren will. Solange die Regel global gilt, nimmt der erste
-- Mandant ihn dem zweiten weg — und der zweite bekommt beim Anlegen eine
-- Fehlermeldung, die nichts erklaert.
--
-- Die schwerste: rechnungen.rechnungsnummer. Zwei Mandanten mit dem Praefix
-- "RE" kollidieren ab der ersten Rechnung. Der zweite kann nicht abrechnen,
-- und der Fehler faellt erst beim Stellen auf.
--
-- Weiter:
--   external_credentials.service   nur EIN Mandant kann eine Anbindung je
--                                  Dienst haben — genau das, was der Auftrag
--                                  je Mandant verlangt
--   portal_zugaenge.portal         nur ein Mandant je Portal
--   firma_kennzahlen.jahr          nur ein Mandant je Geschaeftsjahr
--   news_briefings.briefing_datum  nur ein Mandant je Tag
--   firma_stammdaten.slug          nur ein Mandant kann "standard" heissen
--   akq_quellen.slug               nur einer kann "website" fuehren
--   checkliste_vorlagen.name       nur einer eine "Eigentumswohnung"
--   projekte.slug                  Projektkuerzel
--   liquid_kategorisierung.match_key  Zuordnungsregeln der Buchhaltung
--
-- Keine dieser Regeln wird von einem Fremdschluessel gebraucht (geprueft), sie
-- lassen sich also sauber ersetzen: Regel weg, eindeutiger Index ueber
-- (mandant_id, Spalte) hin.
--
-- NULL in mandant_id: Ein eindeutiger Index behandelt NULL als verschieden,
-- zwei Zeilen ohne Mandanten kollidieren also nicht. Das ist hier richtig —
-- Zeilen ohne Mandanten sind ein Altlastenfall, und die Trennung erzwingen die
-- restriktiven Richtlinien, nicht dieser Index.
-- ===========================================================================

do $$
declare
  umstellung jsonb := jsonb_build_array(
    jsonb_build_array('rechnungen',            'rechnungen_rechnungsnummer_key',      'rechnungsnummer'),
    jsonb_build_array('external_credentials',  'external_credentials_service_key',    'service'),
    jsonb_build_array('portal_zugaenge',       'portal_zugaenge_portal_key',          'portal'),
    jsonb_build_array('firma_kennzahlen',      'firma_kennzahlen_jahr_key',           'jahr'),
    jsonb_build_array('news_briefings',        'news_briefings_briefing_datum_key',   'briefing_datum'),
    jsonb_build_array('firma_stammdaten',      'firma_stammdaten_slug_key',           'slug'),
    jsonb_build_array('akq_quellen',           'akq_quellen_slug_key',                'slug'),
    jsonb_build_array('checkliste_vorlagen',   'checkliste_vorlagen_name_key',        'name'),
    jsonb_build_array('projekte',              'projekte_slug_key',                   'slug'),
    jsonb_build_array('liquid_kategorisierung','liquid_kat_match_unique',             'match_key')
  );
  eintrag jsonb;
  tabelle text; regel text; spalte text; index_name text;
  referenzen int;
begin
  for eintrag in select * from jsonb_array_elements(umstellung) loop
    tabelle := eintrag->>0; regel := eintrag->>1; spalte := eintrag->>2;
    index_name := tabelle || '_mandant_' || spalte || '_idx';

    -- Schon umgestellt? Dann ist nichts zu tun.
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = index_name) then
      continue;
    end if;

    if not exists (select 1 from pg_constraint where conname = regel) then
      raise exception 'Regel % gibt es nicht — die Vorlage hat sich geaendert.', regel;
    end if;

    -- Haengt ein Fremdschluessel daran, waere das Loeschen ein Eingriff in
    -- fremde Beziehungen. Dann lieber abbrechen als raten.
    select count(*) into referenzen from pg_constraint f
     where f.contype = 'f'
       and f.confrelid = (select conrelid from pg_constraint where conname = regel)
       and f.confkey = (select conkey from pg_constraint where conname = regel);
    if referenzen > 0 then
      raise exception 'Auf % zeigen % Fremdschluessel — nicht ersetzbar.', regel, referenzen;
    end if;

    execute format('alter table public.%I drop constraint %I', tabelle, regel);
    execute format('create unique index %I on public.%I (mandant_id, %I)',
                   index_name, tabelle, spalte);
    execute format('comment on index public.%I is %L', index_name,
      'Eindeutig je Mandant, nicht global (fork_17). Die Regel ' || regel ||
      ' der Vorlage galt ueber alle Mandanten und haette dem zweiten den Namen '
      'weggenommen.');
  end loop;
end $$;

-- --- Wachposten -----------------------------------------------------------
-- Kommt eine neue global eindeutige Regel auf einer Mandantentabelle dazu,
-- faellt sie hier auf. Die Ausnahmen sind benannt und begruendet.
do $$
declare offen text;
begin
  select string_agg(r.relname || '.' || con.conname, ', ' order by r.relname) into offen
    from pg_constraint con
    join pg_class r on r.oid = con.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    join public.mandanten_einstufung e on e.tabelle = r.relname and e.gruppe = 'MANDANT'
   where n.nspname = 'public' and con.contype = 'u'
     and not exists (select 1 from unnest(con.conkey) k
                      join pg_attribute a on a.attrelid = r.oid and a.attnum = k
                     where a.attname = 'mandant_id')
     and con.conname not in (
       -- Zufallstoken: global eindeutig ist hier die Absicht.
       'bewerber_einladungen_token_key', 'eigentuemer_einladungen_token_key',
       'expose_freigaben_token_key', 'projekt_zugaenge_token_key',
       'push_geraete_token_key', 'rundgaenge_share_token_key',
       'signatur_empfaenger_token_key',
       -- Kennungen fremder Systeme.
       'jotform_formulare_form_id_key', 'onoffice_expose_versand_agentslog_id_key',
       'mietanfragen_jotform_submission_id_key', 'akq_mail_leads_mail_eingang_id_key',
       'bewerber_antworten_einladung_id_key',
       -- Zusammengesetzt ueber eine bereits mandantengebundene Elterntabelle.
       'eigentuemer_objekte_eigentuemer_id_maklervertrag_id_key',
       'immobilie_eigentuemer_immobilie_id_eigentuemer_id_key',
       'immobilie_portal_status_immobilie_id_portal_key',
       'kontakt_objekt_kontakt_id_immobilie_id_rolle_key',
       'mail_ordner_postfach_id_name_key', 'projekt_einheiten_projekt_id_we_nr_key',
       'projekt_datei_freigaben_datei_id_zugang_id_key',
       'projekt_merkliste_zugang_id_einheit_id_key',
       'termin_einladungen_termin_id_email_key',
       'todo_verknuepfung_todo_id_objekt_typ_objekt_id_key',
       'todo_vorlage_schritt_vorlage_id_nr_key',
       'liquid_trans_dedup_unique', 'mail_absender_onedrive_user_id_absender_email_key',
       'mail_blockierte_absender_benutzer_id_email_key',
       'mail_postfaecher_benutzer_id_email_adresse_key',
       'notiz_tags_user_id_name_key',
       -- Ein Benutzerkonto gehoert zu genau einem Mandanten.
       'eigentuemer_user_id_key', 'eigentuemer_personen_user_id_key',
       -- Eine IBAN ist in der Welt eindeutig, nicht nur im Mandanten.
       'liquid_konten_iban_unique');
  if offen is not null then
    raise exception 'Global eindeutige Regel(n) auf Mandantentabellen ohne Begruendung: %', offen;
  end if;
end $$;
