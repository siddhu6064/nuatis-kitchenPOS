import { MENU_ITEMS, CATEGORY_COLORS, type MenuItem } from "@/data/menu";

interface Props {
  onTap: (item: MenuItem) => void;
}

export function MenuGrid({ onTap }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-3">
        {MENU_ITEMS.map((item) => {
          const colors = CATEGORY_COLORS[item.category];
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
                  {item.category}
                </span>
              </div>
              <span className="text-slate-900 font-medium text-base leading-snug flex-1">
                {item.name}
              </span>
              <span className="mt-2 text-slate-700 font-bold text-lg tabular-nums">
                ${item.price.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
