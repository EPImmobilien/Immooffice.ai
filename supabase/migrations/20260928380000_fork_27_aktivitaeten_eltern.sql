-- ===========================================================================
-- Fork-eigene Migration 27 — auch Aktivitaeten und Dateien erben ihren
-- Mandanten
--
-- fork_22 hat sechzehn Tabellen einen Wachposten gegeben, der mandant_id aus
-- dem Elternsatz fuellt. Zwei habe ich damals ausgelassen, und die Begruendung
-- war:
--
--     "aktivitaeten traegt keinen Wachposten: die Zeile haengt wahlweise an
--      einem Eigentuemer oder an einem Vertrag, und ein Wachposten, der
--      zwischen zwei gleichrangigen Eltern waehlen muesste, raet."
--
-- DAS WAR ZU VORSICHTIG. Die Funktion nimmt ihre Argumente PAARWEISE und
-- nimmt das erste gefuellte — das ist eine Reihenfolge, kein Raten. Haengt
-- die Aktivitaet an einem Eigentuemer, gehoert sie dessen Mandanten; haengt
-- sie nur an einem Vertrag, dem des Vertrags. Beides gleichzeitig gesetzt und
-- verschieden waere ein Datenfehler, und dann gewinnt die erste Angabe —
-- nachvollziehbar und immer dieselbe.
--
-- Bei immobilie_datei war es schlicht Unaufmerksamkeit: die Zeile haengt
-- eindeutig an einer Immobilie. Eine Fundstelle in mail-anhaenge-diagnose
-- uebergibt ein vorbereitetes Objekt (`insert(neu)`) und kam deshalb in der
-- Durchsicht nicht vor.
--
-- Damit bleiben von 47 Fundstellen noch vier, und jede braucht wirklich eine
-- eigene Quelle im Quelltext.
-- ===========================================================================

-- Die Aktivitaet gehoert dem Mandanten dessen, worueber sie berichtet.
-- Reihenfolge: Eigentuemer, dann Vertrag, dann der Empfaenger der Glocke.
drop trigger if exists mandant_aus_eltern on public.aktivitaeten;
create trigger mandant_aus_eltern before insert on public.aktivitaeten
  for each row execute function public.mandant_aus_eltern(
    'eigentuemer_id', 'eigentuemer',
    'maklervertrag_id', 'vertraege',
    'empfaenger_user_id', 'profiles');

-- Eine Datei gehoert dem Mandanten ihrer Immobilie.
drop trigger if exists mandant_aus_eltern on public.immobilie_datei;
create trigger mandant_aus_eltern before insert on public.immobilie_datei
  for each row execute function public.mandant_aus_eltern(
    'immobilie_id', 'immobilien');

do $$
declare n int;
begin
  select count(*) into n from pg_trigger
   where tgname = 'mandant_aus_eltern' and not tgisinternal;
  if n <> 19 then
    raise exception 'Es haengen % Wachposten statt 19.', n;
  end if;
end $$;
