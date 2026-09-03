import "server-only";

import { GoogleAnbieter } from "./google";
import { ImapAnbieter } from "./imap";
import { MicrosoftAnbieter } from "./microsoft";
import type { Adresse, PostfachAnbieter, PostfachZugang } from "./typen";

/** Den passenden Anbieter zu entschluesselten Zugangsdaten bauen. */
export function anbieterErzeugen(
  zugang: PostfachZugang,
  absender: Adresse,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): PostfachAnbieter {
  switch (zugang.art) {
    case "imap":
      return new ImapAnbieter(zugang, absender);
    case "microsoft":
      return new MicrosoftAnbieter(zugang, fetchFn);
    case "google":
      return new GoogleAnbieter(zugang, absender, fetchFn);
  }
}
