/**
 * Zwecke der KI-Bildbearbeitung — ohne Server-Abhaengigkeiten, damit die
 * Oberflaeche (Bild-Editor) die Liste anzeigen kann.
 */
export const BILD_ZWECKE = {
  himmel: { bezeichnung: "Himmel ersetzen (blauer Himmel, natürliches Licht)", aktion: "ki_bild_himmel", anweisung: "Ersetze den Himmel auf diesem Immobilienfoto durch einen freundlichen, natürlichen blauen Himmel mit leichten Wolken. Belichtung des Gebäudes passend angleichen. Gebäude, Fenster, Fassade, Grundstück, Perspektive und alle Objekte bleiben exakt erhalten; nichts hinzufügen oder entfernen." },
  retusche: { bezeichnung: "Störendes entfernen (Mülltonnen, Kabel, Autos)", aktion: "ki_bild_retusche", anweisung: "Entferne störende, nicht zum Gebäude gehörende Gegenstände (z. B. Mülltonnen, Kabel, Autos, Schilder, Personen) und fülle den Hintergrund natürlich auf. Architektur, Raumgeometrie, Fenster, Türen, Bodenbeläge und Proportionen bleiben unverändert; keine baulichen Veränderungen erfinden." },
  homestaging: { bezeichnung: "Virtuelles Home Staging (Möblierung)", aktion: "ki_bild_homestaging", anweisung: "Möbliere diesen leeren Raum dezent und realistisch im modernen, hellen Stil (Sofa, Tisch, Teppich, Pflanzen, Leuchten). Wände, Böden, Fenster, Türen, Decken und die Raumgeometrie bleiben exakt erhalten; keine baulichen Veränderungen, keine Verschiebung von Wänden oder Fenstern." },
  optimierung: { bezeichnung: "Belichtung und Farben optimieren", aktion: "ki_bild_optimierung", anweisung: "Optimiere Belichtung, Weißabgleich, Kontrast und Schärfe dieses Immobilienfotos dezent und realistisch. Inhalt, Perspektive, Architektur und alle Objekte bleiben exakt erhalten; nichts hinzufügen oder entfernen." },
} as const;
export type BildZweck = keyof typeof BILD_ZWECKE;
