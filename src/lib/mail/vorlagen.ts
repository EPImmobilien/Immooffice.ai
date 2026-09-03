/**
 * Vorlagen der Transaktionsmails — reine Funktionen, ohne Versand.
 *
 * Die Texte sind bewusst nuechtern: keine Drohkulisse, aber klar, was
 * passiert und was zu tun ist (docs/AUTONOMIE.md S2, S3).
 */

export interface Vorlagenkontext {
  unternehmen: string;
  testphaseBis: string | null;
  loeschungAm: string | null;
  aboAdresse: string;
}

export type VorlagenSchluessel = "testphase_tag5" | "testphase_tag7" | "loeschung_tag23" | "loeschung_tag29";

export const VORLAGEN: readonly VorlagenSchluessel[] = ["testphase_tag5", "testphase_tag7", "loeschung_tag23", "loeschung_tag29"];

export function istVorlage(wert: unknown): wert is VorlagenSchluessel {
  return typeof wert === "string" && (VORLAGEN as readonly string[]).includes(wert);
}

function datum(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
}

export function vorlage(schluessel: VorlagenSchluessel, k: Vorlagenkontext): { betreff: string; text: string } {
  switch (schluessel) {
    case "testphase_tag5":
      return {
        betreff: "Ihre Testphase bei ImmoOffice.ai endet in zwei Tagen",
        text: [
          `Guten Tag,`,
          ``,
          `die Testphase für ${k.unternehmen} endet am ${datum(k.testphaseBis)}.`,
          `Bis dahin können Sie weiterarbeiten wie bisher. Danach bleibt Ihr Zugang 30 Tage im Lesemodus — Sie können alles ansehen und exportieren, aber nichts mehr anlegen oder ändern.`,
          ``,
          `Wenn Sie weitermachen möchten, wählen Sie hier einen Tarif: ${k.aboAdresse}`,
          `Alle Preise verstehen sich netto zuzüglich Umsatzsteuer.`,
          ``,
          `Freundliche Grüße`,
          `ImmoOffice.ai`,
        ].join("\n"),
      };
    case "testphase_tag7":
      return {
        betreff: "Ihre Testphase bei ImmoOffice.ai ist beendet",
        text: [
          `Guten Tag,`,
          ``,
          `die Testphase für ${k.unternehmen} ist beendet. Ihr Zugang ist jetzt im Lesemodus: Ansehen und Exportieren funktionieren weiterhin, Anlegen und Ändern nicht mehr.`,
          k.loeschungAm ? `Ohne Tarif werden Ihre Daten am ${datum(k.loeschungAm)} gelöscht. Vorher erinnern wir Sie noch zweimal.` : ``,
          ``,
          `Tarif wählen und sofort weiterarbeiten: ${k.aboAdresse}`,
          ``,
          `Freundliche Grüße`,
          `ImmoOffice.ai`,
        ].join("\n"),
      };
    case "loeschung_tag23":
      return {
        betreff: "In sieben Tagen werden Ihre Daten bei ImmoOffice.ai gelöscht",
        text: [
          `Guten Tag,`,
          ``,
          `die Daten von ${k.unternehmen} werden am ${datum(k.loeschungAm)} gelöscht, weil nach der Testphase kein Tarif gewählt wurde.`,
          `Bis dahin können Sie alles exportieren (OpenImmo-XML, CSV, Dokumente) oder einen Tarif wählen — dann bleibt alles erhalten: ${k.aboAdresse}`,
          ``,
          `Freundliche Grüße`,
          `ImmoOffice.ai`,
        ].join("\n"),
      };
    case "loeschung_tag29":
      return {
        betreff: "Morgen werden Ihre Daten bei ImmoOffice.ai gelöscht",
        text: [
          `Guten Tag,`,
          ``,
          `morgen, am ${datum(k.loeschungAm)}, werden die Daten von ${k.unternehmen} endgültig gelöscht.`,
          `Wenn Sie das nicht möchten, wählen Sie heute einen Tarif oder exportieren Sie Ihre Daten: ${k.aboAdresse}`,
          ``,
          `Freundliche Grüße`,
          `ImmoOffice.ai`,
        ].join("\n"),
      };
  }
}
