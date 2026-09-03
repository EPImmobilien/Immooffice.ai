import { apiZugang, istAntwort, koerperLesen } from "@/lib/schnittstelle/auth";
import { anlegen, liste } from "@/lib/schnittstelle/ressourcen";
import { OBJEKT_FELDER, objektSchema } from "@/lib/schnittstelle/schemata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const zugang = await apiZugang(request, "objekte", "lesen");
  if (istAntwort(zugang)) return zugang;
  return liste(zugang, "objekte", OBJEKT_FELDER, new URL(request.url), true);
}

export async function POST(request: Request) {
  const zugang = await apiZugang(request, "objekte", "schreiben");
  if (istAntwort(zugang)) return zugang;
  const daten = await koerperLesen(request, objektSchema);
  if (istAntwort(daten)) return daten;
  return anlegen(zugang, "objekte", OBJEKT_FELDER, daten);
}
