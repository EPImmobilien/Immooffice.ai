"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Eingabe, Feld } from "@/components/ui/Feld";
import { Hinweis } from "@/components/ui/Status";
import { imapVerbinden, oauthStarten, type PostfachErgebnis } from "@/server/postfach-aktionen";

interface Props {
  microsoft: boolean;
  google: boolean;
  darfUnternehmen: boolean;
  verschluesselungFehlt: boolean;
}

/**
 * Postfach verbinden: Microsoft und Google ueber die Anmeldung beim Anbieter,
 * alles andere ueber IMAP/SMTP. Zugangsdaten gehen einmal zum Server, werden
 * dort verschluesselt und kommen nie zurueck.
 */
export function PostfachVerbinden({ microsoft, google, darfUnternehmen, verschluesselungFehlt }: Props) {
  const [unternehmen, setUnternehmen] = useState(false);
  const [imapOffen, setImapOffen] = useState(!microsoft && !google);
  const [zustand, aktion, laeuft] = useActionState<PostfachErgebnis, FormData>(imapVerbinden, {});

  return (
    <div className="space-y-4">
      {verschluesselungFehlt && (
        <Hinweis ton="warnung">Der Verschlüsselungsschlüssel fehlt — Postfächer lassen sich erst verbinden, wenn er gesetzt ist (docs/ANLEITUNG.md, Abschnitt 4).</Hinweis>
      )}
      {darfUnternehmen && (
        <label className="flex items-start gap-2 text-[13px] text-text">
          <input type="checkbox" checked={unternehmen} onChange={(e) => setUnternehmen(e.target.checked)} className="mt-0.5" />
          <span>
            Als <strong>Unternehmenspostfach</strong> verbinden (z. B. info@…) — sichtbar für die Verwaltung und für Kollegen mit Freigabe.
            Ohne Häkchen wird es Ihr persönliches Postfach, das nur Sie sehen.
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={oauthStarten}>
          <input type="hidden" name="art" value="microsoft" />
          <input type="hidden" name="unternehmen" value={unternehmen ? "1" : "0"} />
          <Button type="submit" variante="sekundaer" disabled={!microsoft || verschluesselungFehlt} title={microsoft ? undefined : "Noch nicht eingerichtet — docs/ANLEITUNG.md, Abschnitt 9"}>
            Microsoft 365 verbinden
          </Button>
        </form>
        <form action={oauthStarten}>
          <input type="hidden" name="art" value="google" />
          <input type="hidden" name="unternehmen" value={unternehmen ? "1" : "0"} />
          <Button type="submit" variante="sekundaer" disabled={!google || verschluesselungFehlt} title={google ? undefined : "Noch nicht eingerichtet — docs/ANLEITUNG.md, Abschnitt 9"}>
            Google verbinden
          </Button>
        </form>
        <Button type="button" variante={imapOffen ? "leise" : "sekundaer"} onClick={() => setImapOffen((o) => !o)}>
          Anderer Anbieter (IMAP/SMTP)
        </Button>
      </div>
      {(!microsoft || !google) && (
        <p className="text-[12px] text-gedaempft">
          {!microsoft && !google ? "Microsoft und Google sind noch nicht eingerichtet" : !microsoft ? "Microsoft ist noch nicht eingerichtet" : "Google ist noch nicht eingerichtet"}
          {" "}— dafür braucht es Client-ID und -Geheimnis in der Umgebung (docs/ANLEITUNG.md, Abschnitt 9). IMAP/SMTP geht sofort.
        </p>
      )}

      {imapOffen && (
        <form action={aktion} className="space-y-3 rounded-[var(--radius)] border border-linie p-4">
          <input type="hidden" name="unternehmen" value={unternehmen ? "1" : "0"} />
          {zustand.fehler && <Hinweis ton="fehler">{zustand.fehler}</Hinweis>}
          {zustand.erfolg && <Hinweis ton="erfolg">{zustand.erfolg}</Hinweis>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Feld beschriftung="E-Mail-Adresse" id="imap-adresse" pflicht>
              <Eingabe name="adresse" type="email" required autoComplete="off" />
            </Feld>
            <Feld beschriftung="Anzeigename" id="imap-anzeigename" hinweis="Erscheint als Absender">
              <Eingabe name="anzeigename" maxLength={120} />
            </Feld>
            <Feld beschriftung="Benutzername" id="imap-benutzer" hinweis="Leer lassen, wenn es die E-Mail-Adresse ist">
              <Eingabe name="benutzer" autoComplete="off" />
            </Feld>
            <Feld beschriftung="Passwort" id="imap-passwort" pflicht hinweis="Bei vielen Anbietern ein eigenes App-Passwort">
              <Eingabe name="passwort" type="password" required autoComplete="new-password" />
            </Feld>
            <Feld beschriftung="IMAP-Server" id="imap-host" pflicht>
              <Eingabe name="imap_host" required placeholder="imap.anbieter.de" />
            </Feld>
            <Feld beschriftung="IMAP-Port" id="imap-port" hinweis="993 mit Verschlüsselung">
              <Eingabe name="imap_port" type="number" min={1} max={65535} defaultValue={993} />
            </Feld>
            <Feld beschriftung="SMTP-Server" id="smtp-host" hinweis="Leer = wie IMAP-Server">
              <Eingabe name="smtp_host" placeholder="smtp.anbieter.de" />
            </Feld>
            <Feld beschriftung="SMTP-Port" id="smtp-port" hinweis="465 mit Verschlüsselung, 587 mit STARTTLS">
              <Eingabe name="smtp_port" type="number" min={1} max={65535} defaultValue={465} />
            </Feld>
          </div>
          <div className="flex flex-wrap gap-4 text-[13px] text-text">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" name="imap_tls" value="1" defaultChecked /> IMAP verschlüsselt (TLS)</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" name="smtp_tls" value="1" defaultChecked /> SMTP verschlüsselt (TLS)</label>
          </div>
          <p className="text-[12px] text-gedaempft">Vor dem Speichern wird die Verbindung zu IMAP und SMTP geprüft.</p>
          <Button type="submit" disabled={laeuft || verschluesselungFehlt}>{laeuft ? "Prüft Verbindung …" : "Verbindung prüfen und speichern"}</Button>
        </form>
      )}
    </div>
  );
}
