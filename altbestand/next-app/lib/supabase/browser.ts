"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabaseUmgebung } from "./umgebung";

/**
 * Supabase-Client fuer Client-Komponenten.
 *
 * Verwendet ausschliesslich den oeffentlichen Schluessel. Der Dienstschluessel
 * darf niemals in dieser Datei landen — er umgeht saemtliche Row-Level-Security.
 */
export function browserClient() {
  const { url, anonKey } = supabaseUmgebung();
  return createBrowserClient(url, anonKey);
}
