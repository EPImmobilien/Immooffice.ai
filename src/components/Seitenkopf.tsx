/** Einheitlicher Seitenkopf mit Titel, Beschreibung und Aktionen. */
export function Seitenkopf({
  titel,
  beschreibung,
  children,
}: {
  titel: string;
  beschreibung?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-titel text-xl font-semibold text-text">{titel}</h1>
        {beschreibung && (
          <p className="mt-1 text-[13px] text-gedaempft">{beschreibung}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
