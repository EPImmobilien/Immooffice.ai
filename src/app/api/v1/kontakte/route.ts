import { apiZugang, istAntwort, koerperLesen } from "@/lib/schnittstelle/auth";
import { anlegen, liste } from "@/lib/schnittstelle/ressourcen";
import { KONTAKT_FELDER, kontaktSchema } from "@/lib/schnittstelle/schemata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const zugang = await apiZugang(request, "kontakte", "lesen");
  if (istAntwort(zugang)) return zugang;
  return liste(zugang, "kontakte", KONTAKT_FELDER, new URL(request.url), true);
}

export async function POST(request: Request) {
  const zugang = await apiZugang(request, "kontakte", "schreiben");
  if (istAntwort(zugang)) return zugang;
  const daten = await koerperLesen(request, kontaktSchema);
  if (istAntwort(daten)) return daten;
  return anlegen(zugang, "kontakte", KONTAKT_FELDER, daten);
}
