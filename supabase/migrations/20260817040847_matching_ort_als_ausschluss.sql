-- Der Ort wird vom weichen zum harten Kriterium.
--
-- Befund aus dem Test: Ein Objekt in Hamburg erhielt fuer ein Suchprofil
-- "Kiel" noch 75 von 100 Punkten und landete damit in der Trefferliste. Fuer
-- den Makler ist das kein schlechterer Treffer, sondern Rauschen — und eine
-- Trefferliste voller Rauschen wird nicht mehr benutzt.
--
-- Wer keinen Ort angibt, sucht bewusst ueberall. Eine echte Umkreissuche ueber
-- Geokoordinaten folgt in Phase 2; bis dahin lassen sich Nachbarorte einfach
-- zusaetzlich eintragen.
create or replace function intern.treffer_punktzahl(
  p_profil public.suchprofile, p_objekt public.objekte)
returns smallint language plpgsql immutable
as $$
declare
  v_preis numeric;
  v_punkte numeric := 0;
  v_moeglich numeric := 0;
  v_flaeche numeric;
begin
  if p_profil.vermarktungsart <> p_objekt.vermarktungsart
     and p_objekt.vermarktungsart <> 'kauf_miete' then
    return null;
  end if;

  if array_length(p_profil.objektkategorien, 1) is not null
     and not (p_objekt.objektkategorie = any(p_profil.objektkategorien)) then
    return null;
  end if;

  -- Ort beziehungsweise Postleitzahlbereich: Ausschlusskriterium, sobald gesetzt.
  if array_length(p_profil.orte, 1) is not null then
    if p_objekt.ort is null or not exists (
      select 1 from unnest(p_profil.orte) o
       where lower(trim(o)) = lower(trim(p_objekt.ort))
    ) then return null; end if;
  elsif array_length(p_profil.plz_praefixe, 1) is not null then
    if p_objekt.plz is null or not exists (
      select 1 from unnest(p_profil.plz_praefixe) p
       where p_objekt.plz like trim(p) || '%'
    ) then return null; end if;
  end if;

  v_preis := case when p_profil.vermarktungsart = 'miete'
                  then p_objekt.kaltmiete else p_objekt.kaufpreis end;

  if p_profil.preis_bis is not null then
    if v_preis is null or v_preis > p_profil.preis_bis then return null; end if;
  end if;
  if p_profil.preis_von is not null and v_preis is not null
     and v_preis < p_profil.preis_von then
    return null;
  end if;

  -- Weiche Kriterien bestimmen nur noch die Reihenfolge.
  if p_profil.preis_bis is not null then
    v_moeglich := v_moeglich + 40;
    v_punkte := v_punkte + 40;
  end if;

  v_flaeche := coalesce(p_objekt.wohnflaeche, p_objekt.nutzflaeche);
  if p_profil.flaeche_von is not null or p_profil.flaeche_bis is not null then
    v_moeglich := v_moeglich + 35;
    if v_flaeche is not null
       and (p_profil.flaeche_von is null or v_flaeche >= p_profil.flaeche_von)
       and (p_profil.flaeche_bis is null or v_flaeche <= p_profil.flaeche_bis)
    then v_punkte := v_punkte + 35; end if;
  end if;

  if p_profil.zimmer_von is not null or p_profil.zimmer_bis is not null then
    v_moeglich := v_moeglich + 25;
    if p_objekt.zimmer is not null
       and (p_profil.zimmer_von is null or p_objekt.zimmer >= p_profil.zimmer_von)
       and (p_profil.zimmer_bis is null or p_objekt.zimmer <= p_profil.zimmer_bis)
    then v_punkte := v_punkte + 25; end if;
  end if;

  if v_moeglich = 0 then return 60; end if;
  return greatest(1, round(v_punkte / v_moeglich * 100))::smallint;
end; $$;
