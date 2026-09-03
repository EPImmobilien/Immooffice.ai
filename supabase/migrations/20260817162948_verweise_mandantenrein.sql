-- Verweise duerfen den Mandanten nicht ueberschreiten.
--
-- Bisher pruefte jede Policy nur den eigenen `mandant_id` der Zeile. Ein
-- Datensatz mit dem eigenen Mandanten, aber einem FREMDEN `objekt_id` oder
-- `kontakt_id` kam damit durch: Die Fremdschluessel verweisen auf die Tabelle,
-- nicht auf den Mandanten, und die Policy sieht sich den Verweis nicht an.
--
-- Ein Datenleck entsteht daraus nicht — beim Lesen filtert die
-- Row-Level-Security der Zieltabelle, ein solcher Verweis liefert also nichts.
-- Aber es entstehen Zeilen, die auf Fremdes zeigen: eine Aufgabe zu einem
-- Objekt, das man nicht sehen darf, ein Verlaufseintrag an einem fremden
-- Kontakt, ein Termin mit einem fremden Zustaendigen. Solche Zeilen sind bei
-- jeder spaeteren Auswertung eine Fehlerquelle, und die naechste Policy, die
-- ueber einen dieser Verweise joint, macht daraus ein echtes Problem.
--
-- Die Pruefung steht deshalb einmal zentral und wird je Tabelle mit den zu
-- pruefenden Spalten angehaengt.

create or replace function intern.verweise_mandantenrein()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  zeile jsonb := to_jsonb(new);
  eigener uuid := (zeile->>'mandant_id')::uuid;
  spalte text;
  tabelle text;
  ziel uuid;
  fremder uuid;
begin
  -- Die Argumente kommen paarweise aus der Trigger-Definition: Spaltenname,
  -- dann Zieltabelle. Sie stammen aus dieser Datei und nicht aus einer Eingabe.
  for i in 0 .. (tg_nargs / 2 - 1) loop
    spalte := tg_argv[i * 2];
    tabelle := tg_argv[i * 2 + 1];

    ziel := nullif(zeile->>spalte, '')::uuid;
    -- Ein leerer Verweis ist erlaubt: Nicht jede Aufgabe hat ein Objekt.
    if ziel is null then continue; end if;

    execute format('select mandant_id from public.%I where id = $1', tabelle)
      into fremder
      using ziel;

    if fremder is null or fremder <> eigener then
      raise exception
        'Verweis %.% zeigt auf einen anderen Mandanten oder ins Leere',
        tg_table_name, spalte
        using errcode = 'check_violation';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function intern.verweise_mandantenrein() from public;

comment on function intern.verweise_mandantenrein() is
  'Prueft, dass alle verwiesenen Datensaetze zum selben Mandanten gehoeren. Argumente paarweise: Spalte, Zieltabelle.';

create trigger kontakt_objekt_mandantenrein
  before insert or update on public.kontakt_objekt
  for each row execute function intern.verweise_mandantenrein(
    'objekt_id', 'objekte', 'kontakt_id', 'kontakte');

create trigger objekt_dokumente_mandantenrein
  before insert or update on public.objekt_dokumente
  for each row execute function intern.verweise_mandantenrein(
    'objekt_id', 'objekte');

create trigger aktivitaeten_mandantenrein
  before insert on public.aktivitaeten
  for each row execute function intern.verweise_mandantenrein(
    'objekt_id', 'objekte', 'kontakt_id', 'kontakte');

create trigger aufgaben_mandantenrein
  before insert or update on public.aufgaben
  for each row execute function intern.verweise_mandantenrein(
    'objekt_id', 'objekte', 'kontakt_id', 'kontakte',
    'zustaendig_id', 'benutzer');

create trigger termine_mandantenrein
  before insert or update on public.termine
  for each row execute function intern.verweise_mandantenrein(
    'objekt_id', 'objekte', 'kontakt_id', 'kontakte',
    'zustaendig_id', 'benutzer');

create trigger objekt_bilder_mandantenrein
  before insert or update on public.objekt_bilder
  for each row execute function intern.verweise_mandantenrein(
    'objekt_id', 'objekte');
