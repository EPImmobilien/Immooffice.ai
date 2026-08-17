-- Vertrauliche Unterlagen lassen sich nicht freigeben.
--
-- Die Sichtbarkeit einer Unterlage ist eine Auswahl in der Oberflaeche, und
-- eine Auswahl kann falsch getroffen werden. Bei einem Grundbuchauszug ist ein
-- Fehlklick nicht zurueckzuholen: Steht die Datei einmal in einem
-- oeffentlichen Web-Exposé, kann sie in derselben Minute heruntergeladen sein.
--
-- Deshalb steht die Regel hier und nicht nur in der Anwendungsschicht. Sie
-- gilt damit auch fuer Wege, die die Anwendung nicht kennt — ein Import, ein
-- Skript, ein spaeteres Modul.
alter table public.objekt_dokumente
  add constraint dokument_vertraulich_bleibt_intern
  check (
    sichtbarkeit = 'intern'
    or art not in (
      'grundbuchauszug',
      'vollmacht',
      'maklervertrag',
      'kaufvertrag',
      'mietvertrag',
      'reservierungsvereinbarung',
      'nebenkostenabrechnung'
    )
  );

comment on constraint dokument_vertraulich_bleibt_intern on public.objekt_dokumente is
  'Vertrauliche Unterlagenarten koennen nicht an Interessenten freigegeben werden. Deckungsgleich mit NUR_INTERN in src/lib/dokumente.ts.';
