import { apiZugang, istAntwort, koerperLesen } from "@/lib/schnittstelle/auth";
import { anlegen, liste } from "@/lib/schnittstelle/ressourcen";
import { TERMIN_FELDER, terminEnde, terminSchema } from "@/lib/schnittstelle/schemata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const zugang = await apiZugang(request, "termine", "lesen");
  if (istAntwort(zugang)) return zugang;
  return liste(zugang, "termine", TERMIN_FELDER, new URL(request.url), false);
}

export async function POST(request: Request) {
  const zugang = await apiZugang(request, "termine", "schreiben");
  if (istAntwort(zugang)) return zugang;
  const daten = await koerperLesen(request, terminSchema);
  if (istAntwort(daten)) return daten;
  const { endet_am, beginnt_am, ...rest } = daten;
  return anlegen(zugang, "termine", TERMIN_FELDER, {
    ...rest,
    beginnt_am: new Date(beginnt_am).toISOString(),
    endet_am: terminEnde(beginnt_am, endet_am),
  });
}
