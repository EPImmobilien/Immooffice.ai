-- ===========================================================================
-- fork_30 — Selbstregistrierung (Phase 3 des Auftrags)
--
-- Bis hierher entsteht ein Mandant nur von Hand. Der Auftrag verlangt, dass
-- ein Makler sich selbst anmelden kann. Was dabei entstehen muss, ist mehr
-- als eine Zeile:
--
--   mandanten          der Mandant selbst, mit eindeutigem Kuerzel
--   profiles           der Anmeldende als chef DIESES Mandanten
--   firma_stammdaten   ein Standort "standard" — sonst haette das erste
--                      Expose kein Impressum und der erste Vertrag keinen
--                      Briefkopf
--   die vier Einstellungszeilen aus fork_28
--
-- WARUM EINE DATENBANKFUNKTION UND KEINE EDGE FUNCTION: Alles davon muss
-- entweder ganz oder gar nicht entstehen. Ein halb angelegter Mandant ist
-- schlimmer als keiner — der Anmeldende kaeme in eine Oberflaeche, die bei
-- jedem zweiten Handgriff abbricht. In einer Funktion ist es eine
-- Transaktion; ueber die Schnittstelle waeren es vier Aufrufe und drei
-- Stellen, an denen es zerreissen kann.
--
-- WARUM KEIN TRIGGER AUF auth.users: Ein Trigger liefe beim ANLEGEN des
-- Kontos, also VOR der Bestaetigung der E-Mail-Adresse. Jede unbestaetigte
-- Anmeldung haette dann einen Mandanten hinterlassen. Angelegt wird deshalb
-- beim ersten Anmelden, und das setzt die Bestaetigung voraus.
--
-- WAS DIE FUNKTION NICHT ZULAESST:
--   - einen zweiten Mandanten fuer dasselbe Konto (ein Profil, ein Mandant)
--   - den Beitritt zu einem vorhandenen Mandanten (der Mandant wird IMMER
--     neu angelegt, die Kennung kommt nie von aussen)
--   - einen Aufruf ohne Anmeldung
-- ===========================================================================

-- --- Aus einem Firmennamen ein Kuerzel machen -----------------------------
create or replace function public.mandant_slug_vorschlag(p_name text)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  basis text;
  kandidat text;
  n int := 1;
begin
  basis := lower(coalesce(p_name, ''));
  basis := translate(basis, 'äöüßáàâéèêíìîóòôúùûñç', 'aoussaaaeeeiiiooouuunc');
  basis := regexp_replace(basis, '[^a-z0-9]+', '-', 'g');
  basis := trim(both '-' from basis);
  basis := left(basis, 40);
  if basis = '' then basis := 'mandant'; end if;

  kandidat := basis;
  while exists (select 1 from public.mandanten m where m.slug = kandidat) loop
    n := n + 1;
    kandidat := left(basis, 36) || '-' || n::text;
  end loop;
  return kandidat;
end
$$;

comment on function public.mandant_slug_vorschlag(text) is
  'Kuerzel aus einem Firmennamen, frei von Umlauten und eindeutig. '
  'Nur als Vorschlag gedacht — die Eindeutigkeit erzwingt der Schluessel.';

-- --- Die Registrierung selbst ---------------------------------------------
create or replace function public.registrierung_abschliessen(
  p_firma text,
  p_name  text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user   uuid := auth.uid();
  v_email  text;
  v_firma  text := trim(coalesce(p_firma, ''));
  v_name   text := trim(coalesce(p_name, ''));
  v_slug   text;
  v_mandant uuid;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;
  if length(v_firma) < 2 then
    raise exception 'Bitte geben Sie einen Firmennamen an.' using errcode = '22023';
  end if;
  if length(v_firma) > 120 then
    v_firma := left(v_firma, 120);
  end if;

  -- Ein Konto, ein Mandant. Wer schon ein Profil hat, ist entweder selbst
  -- Mandant oder eingeladen worden — beides schliesst eine Registrierung
  -- aus. Kein Fehler, sondern die vorhandene Zuordnung.
  select p.mandant_id into v_mandant from public.profiles p where p.id = v_user;
  if found then
    return v_mandant;
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;
  if v_email is null then
    raise exception 'Konto nicht gefunden.' using errcode = '42501';
  end if;

  -- Eine bestaetigte E-Mail-Adresse ist Voraussetzung. Ohne sie waere jede
  -- fremde Adresse ein Mandant.
  -- Geprueft wird email_confirmed_at, nicht confirmed_at: letzteres ist in
  -- Supabase eine abgeleitete Spalte und in einer nachgebauten auth.users
  -- gar nicht vorhanden. email_confirmed_at ist ausserdem das, worauf es
  -- ankommt — die Adresse, nicht die Telefonnummer.
  if not exists (select 1 from auth.users u
                  where u.id = v_user and u.email_confirmed_at is not null) then
    raise exception 'Bitte bestaetigen Sie zuerst Ihre E-Mail-Adresse.'
      using errcode = '42501';
  end if;

  v_slug := public.mandant_slug_vorschlag(v_firma);

  insert into public.mandanten (name, slug, abo_status, testphase_bis)
    values (v_firma, v_slug, 'test', now() + interval '30 days')
    returning id into v_mandant;

  insert into public.profiles (id, name, email, role, mandant_id)
    values (v_user,
            nullif(v_name, ''),
            v_email,
            'chef',
            v_mandant);

  -- Ein Standort, damit Expose, Vertrag und Rechnung einen Briefkopf haben.
  insert into public.firma_stammdaten (firma_name, slug, aktiv, sortierung, mandant_id)
    values (v_firma, 'standard', true, 1, v_mandant);

  perform public.mandant_grundeinstellungen(v_mandant);

  return v_mandant;
end
$$;

comment on function public.registrierung_abschliessen(text, text) is
  'Legt fuer den ANGEMELDETEN Aufrufer einen neuen Mandanten an: Mandant, '
  'Profil als chef, Standort "standard" und die Einstellungszeilen — alles '
  'in einer Transaktion. Wer schon ein Profil hat, bekommt dessen Mandanten '
  'zurueck und nichts Neues. Die Mandantenkennung kommt nie von aussen.';

revoke all on function public.registrierung_abschliessen(text, text) from public, anon;
grant execute on function public.registrierung_abschliessen(text, text) to authenticated;

-- mandant_grundeinstellungen wird aus registrierung_abschliessen heraus
-- gerufen; beide sind SECURITY DEFINER, der Aufruf laeuft also mit den
-- Rechten des Eigentuemers. Ein direkter Aufruf bleibt gesperrt.
