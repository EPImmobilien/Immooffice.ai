-- ===========================================================================
-- fork_29 — der Projekt-Slug ist eine oeffentliche Adresse und gehoert
--           deshalb der Plattform, nicht dem Mandanten
--
-- fork_17 hat zehn global eindeutige Regeln auf je Mandant umgestellt, weil
-- sie NAMEN tragen, die ein zweiter Mandant mit demselben Recht fuehren will.
-- Fuer neun davon stimmt das. Fuer projekte.slug nicht.
--
-- Der Slug ist kein interner Name, sondern die oeffentliche Adresse des
-- Neubauportals: /?projekt=am-park, und der Aufruf kommt ohne Anmeldung, ohne
-- Token, ohne irgendeinen Hinweis darauf, wer gemeint ist. Zwei Mandanten mit
-- einem Projekt "am-park" waeren nicht zu unterscheiden — maybeSingle() bricht
-- dann ab, was immerhin laut ist statt falsch, aber eben auch: das Portal
-- beider ist tot.
--
-- Zwei Auswege standen zur Wahl:
--   a) Die Adresse traegt den Mandanten: /?p={mandant}/{slug}.
--   b) Der Slug bleibt plattformweit eindeutig, wie in der Vorlage.
--
-- (b), aus zwei Gruenden. Erstens ist es das Verhalten der Vorlage, und der
-- Auftrag sagt: nichts neu erfinden, keine Verhaltensaenderung. Zweitens ist
-- eine oeffentliche Adresse ihrer Natur nach ein globaler Namensraum — wie
-- eine Subdomain. Ein belegter Slug ist dann eine Meldung beim Anlegen
-- ("diese Adresse ist vergeben"), kein Zufall zur Laufzeit.
--
-- Kein Leck: der Slug benennt genau ein Projekt, und dessen Daten gehoeren
-- dem Mandanten, dem das Projekt gehoert. (a) bleibt spaeter moeglich, ohne
-- dass etwas davon zurueckgebaut werden muesste.
-- ===========================================================================

do $$
declare doppelt text;
begin
  select string_agg(slug || ' (' || n || 'x)', ', ') into doppelt
    from (select slug, count(*) as n from public.projekte
           where slug is not null group by slug having count(*) > 1) x;
  if doppelt is not null then
    raise exception 'Der Projekt-Slug kann nicht plattformweit eindeutig '
                    'werden, solange er doppelt vergeben ist: %', doppelt;
  end if;
end $$;

drop index if exists public.projekte_mandant_slug_idx;

alter table public.projekte drop constraint if exists projekte_slug_key;
alter table public.projekte add constraint projekte_slug_key unique (slug);

comment on constraint projekte_slug_key on public.projekte is
  'Plattformweit eindeutig, mit Absicht: der Slug ist die oeffentliche '
  'Adresse des Neubauportals und wird ohne Anmeldung aufgerufen. Siehe '
  'fork_29.';
