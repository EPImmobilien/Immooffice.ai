-- Wertermittlung als offenes Rechenblatt.
--
-- Der Master-Prompt ist hier ausdruecklich: keine Blackbox, keine automatisch
-- „ermittelten" Werte. Gespeichert werden deshalb ausschliesslich die ANSAETZE
-- des Nutzers, nicht das Ergebnis. Das Ergebnis entsteht bei jeder Anzeige neu
-- aus diesen Ansaetzen.
--
-- Das ist eine bewusste Entscheidung gegen die naheliegende Redundanz: Ein
-- gespeichertes Ergebnis koennte von seinen Ansaetzen abweichen, sobald an der
-- Rechnung etwas korrigiert wird. Dann stuende eine Zahl im System, die sich
-- aus den daneben stehenden Angaben nicht mehr herleiten laesst — genau das,
-- was eine nachvollziehbare Wertermittlung nicht sein darf.

create type public.wertverfahren as enum (
  'vergleichswert', 'ertragswert', 'sachwert'
);

create table public.wertermittlungen (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references public.mandanten(id) on delete cascade,

  -- Beide Bezuege freiwillig: Eine Wertermittlung entsteht oft VOR dem Objekt,
  -- als Akquiseinstrument beim Eigentuemer.
  objekt_id uuid references public.objekte(id) on delete set null,
  kontakt_id uuid references public.kontakte(id) on delete set null,

  bezeichnung text not null check (length(trim(bezeichnung)) between 1 and 200),
  stichtag date not null default current_date,

  -- Die Ansaetze je Verfahren. Als jsonb, weil die Felder je Verfahren
  -- verschieden sind und sich mit der ImmoWertV aendern koennen — eine Spalte
  -- je Ansatz waere eine Migration bei jeder fachlichen Anpassung.
  vergleich jsonb not null default '{}'::jsonb,
  ertrag jsonb not null default '{}'::jsonb,
  sachwert jsonb not null default '{}'::jsonb,

  -- Welches Verfahren fuehrt, entscheidet der Nutzer. Bei einer selbstgenutzten
  -- Wohnung ist es der Vergleichswert, bei einem Zinshaus der Ertragswert. Eine
  -- Software, die daraus stillschweigend einen Durchschnitt bildet, trifft
  -- diese fachliche Entscheidung anstelle des Nutzers und verdeckt sie.
  fuehrendes_verfahren public.wertverfahren,

  notiz text,

  erstellt_von uuid references public.benutzer(id) on delete set null,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create index wertermittlungen_mandant_idx
  on public.wertermittlungen(mandant_id, stichtag desc);
create index wertermittlungen_objekt_idx on public.wertermittlungen(objekt_id);
create index wertermittlungen_kontakt_idx on public.wertermittlungen(kontakt_id);

comment on table public.wertermittlungen is
  'Offenes Rechenblatt. Gespeichert werden nur die Ansaetze des Nutzers; das Ergebnis wird bei jeder Anzeige neu berechnet.';
comment on column public.wertermittlungen.fuehrendes_verfahren is
  'Fachliche Entscheidung des Nutzers, welches Verfahren traegt. Bewusst kein Durchschnitt ueber die Verfahren.';

create trigger wertermittlungen_geaendert before update on public.wertermittlungen
  for each row execute function intern.setze_geaendert_am();

create trigger wertermittlungen_mandantenrein
  before insert or update on public.wertermittlungen
  for each row execute function intern.verweise_mandantenrein(
    'objekt_id', 'objekte', 'kontakt_id', 'kontakte');

alter table public.wertermittlungen enable row level security;

create policy wertermittlungen_lesen on public.wertermittlungen
  for select using (mandant_id = intern.aktueller_mandant());
create policy wertermittlungen_schreiben on public.wertermittlungen
  for all using (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben())
  with check (mandant_id = intern.aktueller_mandant() and intern.darf_schreiben());
