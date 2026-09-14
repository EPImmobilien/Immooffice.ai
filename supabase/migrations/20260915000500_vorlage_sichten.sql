-- Sichten der Vorlage
--
-- Uebernommen aus der Vorlage, erzeugt von scripts/neutralisieren.py aus dem
-- woertlichen Schema-Export. Nicht von Hand aendern: die naechste Ausfuehrung
-- des Skripts wuerde die Aenderung verwerfen. Aenderungen gehoeren in das
-- Skript (mit Grund) oder in eine eigene, spaetere Migration.
--
-- Quelle: 35-sichten.sql
--
-- 4 Sichten.


create or replace view public.akq_mpe_uebersicht as
 SELECT id,
    titel,
    created_at,
    ersteller_id,
    ersteller_name,
    immobilie_id,
    akq_lead_id,
    NULLIF(btrim(daten ->> 'objekt'::text), ''::text) AS objekt,
    NULLIF(btrim(daten ->> 'adresse'::text), ''::text) AS adresse,
    NULLIF(btrim(daten ->> 'plz'::text), ''::text) AS plz,
    NULLIF(btrim(daten ->> 'ort'::text), ''::text) AS ort,
    NULLIF(btrim(daten ->> 'objektart'::text), ''::text) AS objektart,
    NULLIF(btrim(daten ->> 'verfahren'::text), ''::text) AS verfahren,
    NULLIF(btrim(daten ->> 'wohnflaeche'::text), ''::text) AS wohnflaeche,
    NULLIF(btrim(daten ->> 'grundstuecksflaeche'::text), ''::text) AS grundstuecksflaeche,
    NULLIF(btrim(daten ->> 'baujahr'::text), ''::text) AS baujahr,
    NULLIF(btrim(daten ->> 'angebotspreis'::text), ''::text) AS angebotspreis,
    NULLIF(btrim(daten ->> 'realistisches_volumen'::text), ''::text) AS realistisches_volumen,
    NULLIF(btrim(daten ->> 'courtage_verkaeufer'::text), ''::text) AS courtage_verkaeufer,
    NULLIF(btrim(daten ->> 'courtage_kaeufer'::text), ''::text) AS courtage_kaeufer,
    NULLIF(btrim(daten ->> 'vermarktungsdauer_von'::text), ''::text) AS vermarktungsdauer_von,
    NULLIF(btrim(daten ->> 'vermarktungsdauer_bis'::text), ''::text) AS vermarktungsdauer_bis,
    NULLIF(btrim(daten ->> 'kp_praemisse'::text), ''::text) AS kp_praemisse
   FROM bewertungen b;
create or replace view public.mail_ki_kosten_monatlich as
 SELECT date_trunc('month'::text, created_at) AS monat,
    benutzer_id,
    count(*) AS anfragen,
    sum(input_tokens) AS input_tokens_gesamt,
    sum(output_tokens) AS output_tokens_gesamt,
    round(sum(geschaetzte_kosten_eur), 2) AS kosten_eur
   FROM mail_ki_log
  GROUP BY (date_trunc('month'::text, created_at)), benutzer_id
  ORDER BY (date_trunc('month'::text, created_at)) DESC, benutzer_id;
create or replace view public.radar_uebersicht as
 SELECT id,
    fingerprint,
    quelle,
    quelle_url,
    vermarktungsart,
    objektart,
    strasse,
    plz,
    ort,
    ortsteil,
    lat,
    lon,
    wohnflaeche,
    grundstueck,
    zimmer,
    baujahr,
    preis,
    preis_pro_qm,
    anbieter_typ,
    anbieter_name,
    telefon,
    email,
    titel,
    beschreibung,
    merkmale,
    rohtext,
    erstmals_gesehen,
    zuletzt_gesehen,
    aktiv,
    status,
    prioritaet,
    notiz,
    zugeordnet_an,
    erfasst_von,
    created_at,
    updated_at,
    CURRENT_DATE - erstmals_gesehen AS tage_am_markt,
    ( SELECT count(*) AS count
           FROM radar_historie h
          WHERE h.objekt_id = o.id AND h.aenderung ~~ 'Preis%'::text) AS preisaenderungen,
    ( SELECT min(h.preis) AS min
           FROM radar_historie h
          WHERE h.objekt_id = o.id) AS preis_min,
    ( SELECT max(h.preis) AS max
           FROM radar_historie h
          WHERE h.objekt_id = o.id) AS preis_max
   FROM radar_objekte o;
create or replace view public.v_plz_aemter as
 SELECT p.plz,
    p.ort,
    p.region,
    a.unterlagentyp,
    a.behoerdenname,
    a.strasse,
    a.plz AS amt_plz,
    a.ort AS amt_ort,
    a.telefon,
    a.email,
    a.webseite,
    a.online_portal,
    a.zustaendig_fuer,
    a.hinweise
   FROM plz_region p
     JOIN amt_adressen a ON a.region_kanonisch = p.region OR (a.id IN ( SELECT amt_zusaetzliche_regionen.amt_id
           FROM amt_zusaetzliche_regionen
          WHERE amt_zusaetzliche_regionen.region = p.region)) OR a.region_kanonisch = 'GESAMT'::text AND a.unterlagentyp = 'altlasten'::text;
