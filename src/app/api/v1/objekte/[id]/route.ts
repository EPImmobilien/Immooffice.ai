import { apiZugang, istAntwort, koerperLesen } from "@/lib/schnittstelle/auth";
import { aendern, einzeln, weichLoeschen } from "@/lib/schnittstelle/ressourcen";
import { OBJEKT_FELDER, objektAenderungSchema } from "@/lib/schnittstelle/schemata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const zugang = await apiZugang(request, "objekte", "lesen");
  if (istAntwort(zugang)) return zugang;
  const { id } = await params;
  return einzeln(zugang, "objekte", OBJEKT_FELDER, id, true);
}

export async function PATCH(request: Request, { params }: Params) {
  const zugang = await apiZugang(request, "objekte", "schreiben");
  if (istAntwort(zugang)) return zugang;
  const daten = await koerperLesen(request, objektAenderungSchema);
  if (istAntwort(daten)) return daten;
  const { id } = await params;
  return aendern(zugang, "objekte", OBJEKT_FELDER, id, daten, true);
}

export async function DELETE(request: Request, { params }: Params) {
  const zugang = await apiZugang(request, "objekte", "schreiben");
  if (istAntwort(zugang)) return zugang;
  const { id } = await params;
  return weichLoeschen(zugang, "objekte", id);
}
