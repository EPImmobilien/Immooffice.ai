import { apiFehler, apiZugang, istAntwort, koerperLesen } from "@/lib/schnittstelle/auth";
import { aendern, einzeln } from "@/lib/schnittstelle/ressourcen";
import { TERMIN_FELDER, terminAenderungSchema } from "@/lib/schnittstelle/schemata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const zugang = await apiZugang(request, "termine", "lesen");
  if (istAntwort(zugang)) return zugang;
  const { id } = await params;
  return einzeln(zugang, "termine", TERMIN_FELDER, id, false);
}

export async function PATCH(request: Request, { params }: Params) {
  const zugang = await apiZugang(request, "termine", "schreiben");
  if (istAntwort(zugang)) return zugang;
  const daten = await koerperLesen(request, terminAenderungSchema);
  if (istAntwort(daten)) return daten;
  const { abgesagt, beginnt_am, endet_am, ...rest } = daten;
  const werte: Record<string, unknown> = { ...rest };
  if (beginnt_am) werte["beginnt_am"] = new Date(beginnt_am).toISOString();
  if (endet_am) werte["endet_am"] = new Date(endet_am).toISOString();
  if (beginnt_am && endet_am && new Date(endet_am) <= new Date(beginnt_am)) {
    return apiFehler(422, "endet_am muss nach beginnt_am liegen.");
  }
  if (abgesagt !== undefined) werte["abgesagt_am"] = abgesagt ? new Date().toISOString() : null;
  const { id } = await params;
  return aendern(zugang, "termine", TERMIN_FELDER, id, werte, false);
}

/** Termine werden nicht geloescht, sondern abgesagt. */
export async function DELETE(request: Request, { params }: Params) {
  const zugang = await apiZugang(request, "termine", "schreiben");
  if (istAntwort(zugang)) return zugang;
  const { id } = await params;
  const antwort = await aendern(zugang, "termine", "id", id, { abgesagt_am: new Date().toISOString() }, false);
  return antwort.status === 200 ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) : antwort;
}
