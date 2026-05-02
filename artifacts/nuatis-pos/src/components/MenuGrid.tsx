import { useQuery } from "@tanstack/react-query";
import { getMenuTree } from "@/lib/api/menu";
import type { ApiMenuItem } from "@/lib/api/types";

interface Props {
  onTap: (item: ApiMenuItem) => void;
}

// Map API category names to visual styles
function categoryStyle(name: string): { bg: string; text: string; dot: string } {
  const lower = name.toLowerCase();
  if (lower.includes("drink") || lower.includes("coffee") || lower.includes("tea")) {
    return { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-500" };
  }
  if (lower.includes("food") || lower.includes("eat") || lower.includes("bakery")) {
    return { bg: "bg-sky-50", text: "text-sky-800", dot: "bg-sky-500" };
  }
  return { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-400" };
}

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function MenuGrid({ onTap }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["menu-tree"],
    queryFn: getMenuTree,
    retry: 2,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400 text-sm">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading menu…
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-500 text-sm px-6">
          <p className="font-medium mb-1">Could not load menu</p>
          <p className="text-xs text-slate-400">Check that the API is running and Supabase is configured.</p>
        </div>
      </div>
    );
  }

  const allItems: Array<{ item: ApiMenuItem; categoryName: string }> = [];
  for (const cat of data.categories) {
    for (const item of cat.items) {
      allItems.push({ item, categoryName: cat.name });
    }
  }

  if (allItems.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">No menu items found.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-3">
        {allItems.map(({ item, categoryName }) => {
          const colors = categoryStyle(categoryName);
          return (
            <button
              key={item.id}
              onClick={() => onTap(item)}
              className={`
                ${colors.bg}
                flex flex-col items-start justify-between
                rounded-lg p-4 min-h-[140px] w-full text-left
                border border-transparent shadow-sm
                hover:shadow-md hover:-translate-y-0.5 hover:border-slate-200
                active:scale-95 active:shadow-sm active:translate-y-0
                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand
                transition-all duration-100
              `}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`inline-block w-2 h-2 rounded-full ${colors.dot}`} />
                <span className={`text-xs font-medium uppercase tracking-wide ${colors.text} opacity-70`}>
                  {categoryName}
                </span>
              </div>
              <span className="text-slate-900 font-medium text-base leading-snug flex-1">
                {item.name}
              </span>
              <span className="mt-2 text-slate-700 font-bold text-lg tabular-nums">
                ${formatPrice(item.price_cents)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
