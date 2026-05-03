interface Column<T> {
  key: keyof T;
  label: string;
  format?: (value: T[keyof T], row: T) => string;
  align?: "left" | "right";
}

interface BreakdownTableProps<T extends Record<string, unknown>> {
  title: string;
  columns: Column<T>[];
  rows: T[];
}

export function BreakdownTable<T extends Record<string, unknown>>({
  title,
  columns,
  rows,
}: BreakdownTableProps<T>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-serif text-base font-semibold text-slate-800">
          {title}
        </h3>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-slate-400">
          No data
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className={`px-5 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  {columns.map((col) => {
                    const raw = row[col.key];
                    const display = col.format
                      ? col.format(raw, row)
                      : String(raw ?? "—");
                    return (
                      <td
                        key={String(col.key)}
                        className={`px-5 py-3 text-slate-700 whitespace-nowrap ${
                          col.align === "right"
                            ? "text-right tabular-nums font-mono text-xs"
                            : "text-left"
                        }`}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
