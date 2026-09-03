/** Reservierungen (Referenz-Kachel „Reservierungen“): Statuswerte und Zeilentyp. */
export const RESERVIERUNG_STATUS = { angefragt: "Angefragt", aktiv: "Aktiv", abgelaufen: "Abgelaufen", aufgehoben: "Aufgehoben", abgeschlossen: "Abgeschlossen" } as const;
export type ReservierungStatus = keyof typeof RESERVIERUNG_STATUS;

export interface ReservierungZeile {
  id: string;
  status: ReservierungStatus;
  reserviert_bis: string | null;
  gebuehr: number;
  gebuehr_anrechenbar: boolean;
  gebuehr_bezahlt_am: string | null;
  notizen: string | null;
  aufhebungsgrund: string | null;
  erstellt_am: string;
  vertrag_id: string | null;
  objekt: { id: string; objektnummer: string; bezeichnung: string; status: string } | null;
  kontakt: { id: string; vorname: string | null; nachname: string | null; firma: string | null } | null;
}
