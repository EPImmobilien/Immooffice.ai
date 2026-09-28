-- ===========================================================================
-- Fork-eigene Migration 22 — der Mandant kommt vom Elternsatz
--
-- BEFUND vom 28.09.2026: die oeffentlichen Endpunkte schrieben 47 Zeilen ohne
-- mandant_id. Der Standardwert der Spalte ist aktuelle_mandant_id(), und der
-- liest den Mandanten aus dem Anmelde-Token. Ein Aufruf ohne Token hat keinen
-- — die Zeile entsteht mit NULL, und die restriktive Richtlinie aus fork_07
-- vergleicht mandant_id mit dem Mandanten des Lesers. NULL ist mit nichts
-- gleich: die Zeile ist fuer JEDEN unsichtbar, ohne eine Fehlermeldung.
--
-- SIEBEN STELLEN sind im Quelltext geschlossen. Fuer den Rest waere das der
-- falsche Weg: es sind achtundzwanzig Aufrufstellen in vierzehn Funktionen,
-- und jede neue Zeile im Quelltext koennte es wieder vergessen. Was hier
-- fehlt, ist keine Angabe, die der Aufrufer treffen MUSS — sie steht schon
-- im Elternsatz. Eine Projektaktivitaet gehoert dem Mandanten ihres
-- Projekts; eine Frage auf der Objektseite dem Mandanten des Objekts. Das
-- ist keine Vermutung, sondern die Definition.
--
-- Deshalb hier: ein BEFORE-INSERT-Wachposten, der mandant_id aus dem
-- Elternsatz fuellt — und NUR DANN, wenn sie leer ist. Wer sie setzt,
-- behaelt sie.
--
-- WARUM DAS KEIN SCHLUPFLOCH IST: Postgres wertet die WITH-CHECK-Bedingung
-- einer Richtlinie NACH den BEFORE-Triggern aus. Traegt ein angemeldeter
-- Nutzer ein Kind eines FREMDEN Elternsatzes ein, setzt der Trigger den
-- fremden Mandanten — und genau daran weist die restriktive Richtlinie die
-- Zeile ab. Der Trigger kann die Grenze also nicht aufweichen, nur
-- vervollstaendigen. Der Test fuehrt beides vor.
--
-- WAS ER NICHT TUT: raten. Ist das Elternfeld leer oder der Elternsatz ohne
-- Mandanten, bleibt die Zeile ohne. Lieber sichtbar unvollstaendig als
-- falsch zugeordnet.
-- ===========================================================================

create or replace function public.mandant_aus_eltern()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  i int;
  kind_spalte text;
  eltern_tabelle text;
  schluessel uuid;
  gefunden uuid;
begin
  if new.mandant_id is not null then
    return new;
  end if;
  -- Die Argumente kommen paarweise: Spalte des Kindes, Tabelle der Eltern.
  -- Mehrere Paare sind erlaubt — vermerke etwa haengen entweder an einer
  -- Immobilie oder an einem Kontakt. Das erste gefuellte Paar gewinnt.
  i := 0;
  while i < TG_NARGS loop
    kind_spalte    := TG_ARGV[i];
    eltern_tabelle := TG_ARGV[i + 1];
    execute format('select ($1).%I', kind_spalte) into schluessel using new;
    if schluessel is not null then
      execute format('select mandant_id from public.%I where id = $1', eltern_tabelle)
        into gefunden using schluessel;
      if gefunden is not null then
        new.mandant_id := gefunden;
        return new;
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end
$function$;

comment on function public.mandant_aus_eltern() is
  'BEFORE INSERT: fuellt mandant_id aus dem Elternsatz, wenn sie leer ist. '
  'Argumente paarweise (Spalte des Kindes, Tabelle der Eltern); das erste '
  'gefuellte Paar gewinnt. Setzt nie um, was schon gesetzt ist, und raet '
  'nicht — ohne Elternsatz bleibt die Zeile ohne Mandanten.';

-- --- Anhaengen ------------------------------------------------------------
do $$
declare
  eintrag text[];
  paare text[][] := array[
    -- Neubauportal: alles haengt am Projekt.
    array['projekt_zugaenge',              'projekt_id',   'projekte'],
    array['projekt_aktivitaeten',          'projekt_id',   'projekte'],
    array['projekt_anfragen',              'projekt_id',   'projekte'],
    array['projekt_maengel',               'projekt_id',   'projekte'],
    array['projekt_nachrichten',           'projekt_id',   'projekte'],
    array['projekt_merkliste',             'projekt_id',   'projekte'],
    array['projekt_kunden_dateien',        'projekt_id',   'projekte'],
    -- Objektseite und Expose-Freigabe: alles haengt an der Immobilie.
    array['expose_freigaben',              'immobilie_id', 'immobilien'],
    array['landing_fragen',                'immobilie_id', 'immobilien'],
    array['landing_besichtigungswuensche', 'immobilie_id', 'immobilien'],
    array['landing_faq',                   'immobilie_id', 'immobilien'],
    -- Newsletter am Kontakt, Bildbearbeitung und Push am Profil.
    array['newsletter_anmeldungen',        'kontakt_id',   'kontakte'],
    array['ki_bildbearbeitung_log',        'user_id',      'profiles'],
    array['push_log',                      'profile_id',   'profiles']
  ];
begin
  foreach eintrag slice 1 in array paare loop
    execute format(
      'drop trigger if exists mandant_aus_eltern on public.%I', eintrag[1]);
    execute format(
      'create trigger mandant_aus_eltern before insert on public.%I '
      'for each row execute function public.mandant_aus_eltern(%L, %L)',
      eintrag[1], eintrag[2], eintrag[3]);
  end loop;
end $$;

-- vermerke haengen entweder an einer Immobilie oder an einem Kontakt.
drop trigger if exists mandant_aus_eltern on public.vermerke;
create trigger mandant_aus_eltern before insert on public.vermerke
  for each row execute function public.mandant_aus_eltern(
    'immobilie_id', 'immobilien', 'kontakt_id', 'kontakte');

-- mail_versendet haengt am Postfach, ersatzweise an der Mietanfrage.
drop trigger if exists mandant_aus_eltern on public.mail_versendet;
create trigger mandant_aus_eltern before insert on public.mail_versendet
  for each row execute function public.mandant_aus_eltern(
    'postfach_id', 'mail_postfaecher', 'mietanfrage_id', 'mietanfragen');

-- --- Wachposten -----------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from pg_trigger
   where tgname = 'mandant_aus_eltern' and not tgisinternal;
  if n <> 16 then
    raise exception 'Es haengen % Wachposten statt 16.', n;
  end if;
end $$;
