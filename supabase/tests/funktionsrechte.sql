-- ===========================================================================
-- Nachweis der Ausfuehrungsrechte (Master-Prompt Abschnitt 16)
--
-- Laeuft in einer Transaktion und wird zurueckgerollt.
-- Ausfuehren:  psql "$DATENBANK_URL" -f supabase/tests/funktionsrechte.sql
--
-- Hintergrund: Postgres vergibt das Ausfuehrungsrecht neuer Funktionen an
-- PUBLIC, und die REST-Rolle `anon` erbt davon. Eine security-definer-Funktion
-- umgeht zugleich die Row-Level-Security. Beides zusammen macht jede neue
-- Funktion zu einer potenziell offenen Tuer — dieser Test haelt fest, welche
-- Tuer offen sein soll und welche nicht.
-- ===========================================================================
begin;
create temp table erg (nr int, pruefung text, ist text, ok boolean) on commit drop;
grant all on erg to anon, authenticated;

insert into public.mandanten (id,name,slug)
values ('aaaaaaaa-0000-0000-0000-0000000000ff','Mandant A','mandant-a');

do $$
declare r text; v int;
begin
  set local role anon;

  -- Der schwerwiegende Fall: Die Funktion nimmt die Mandanten-ID entgegen,
  -- prueft den Aufrufer nicht und umgeht die RLS. Ohne Rechtebeschraenkung
  -- koennte sich jeder ohne Anmeldung Credits gutschreiben.
  begin
    perform public.credits_gutschreiben('aaaaaaaa-0000-0000-0000-0000000000ff','gekauft',1000000,null,'Angriff');
    r := 'DURCHGEKOMMEN';
  exception when insufficient_privilege then r := 'abgewiesen'; end;
  insert into erg values (1,'anon darf keine Credits gutschreiben',r,r='abgewiesen');

  begin
    perform public.credits_monat_zuteilen('aaaaaaaa-0000-0000-0000-0000000000ff');
    r := 'DURCHGEKOMMEN';
  exception when insufficient_privilege then r := 'abgewiesen'; end;
  insert into erg values (2,'anon darf kein Monatskontingent zuteilen',r,r='abgewiesen');

  begin
    perform public.credits_verfuegbar();
    r := 'DURCHGEKOMMEN';
  exception when insufficient_privilege then r := 'abgewiesen'; end;
  insert into erg values (3,'anon sieht keinen Kontostand',r,r='abgewiesen');

  begin
    perform public.treffer_fuer_profil('aaaaaaaa-0000-0000-0000-0000000000ff');
    r := 'DURCHGEKOMMEN';
  exception when insufficient_privilege then r := 'abgewiesen'; end;
  insert into erg values (4,'anon darf kein Matching ausloesen',r,r='abgewiesen');

  -- Auch angemeldete Nutzer duerfen sich nichts gutschreiben. Das ist Sache
  -- von Stripe-Webhook und Job-Worker, die mit der Dienstrolle laufen.
  set local role authenticated;
  begin
    perform public.credits_gutschreiben('aaaaaaaa-0000-0000-0000-0000000000ff','gekauft',1000000,null,'Angriff');
    r := 'DURCHGEKOMMEN';
  exception when insufficient_privilege then r := 'abgewiesen'; end;
  insert into erg values (5,'auch Angemeldete duerfen nichts gutschreiben',r,r='abgewiesen');

  -- Gegenproben: Ohne sie waere der Test auch dann gruen, wenn schlicht
  -- gar nichts mehr erlaubt waere.
  begin
    perform public.credits_verfuegbar();
    r := 'erlaubt';
  exception when insufficient_privilege then r := 'ABGEWIESEN'; end;
  insert into erg values (6,'Angemeldete sehen ihren Kontostand',r,r='erlaubt');

  set local role anon;
  begin
    perform public.web_expose_oeffnen('irgendeintoken12345');
    r := 'erlaubt';
  exception when insufficient_privilege then r := 'ABGEWIESEN'; end;
  insert into erg values (7,'anon darf ein Web-Expose oeffnen',r,r='erlaubt');

  reset role;
  select count(*) into v from public.credit_konto
   where mandant_id='aaaaaaaa-0000-0000-0000-0000000000ff';
  insert into erg values (8,'kein Guthaben entstanden',v::text,v=0);
end $$;

select nr,pruefung,ist,case when ok then 'BESTANDEN' else 'FEHLGESCHLAGEN' end as ergebnis
from erg order by nr;
rollback;
