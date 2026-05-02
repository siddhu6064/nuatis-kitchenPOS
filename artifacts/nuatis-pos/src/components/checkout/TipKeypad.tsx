import { X, Delete } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

function sanitize(current: string, key: string): string {
  if (key === "del") {
    return current.slice(0, -1);
  }
  if (key === "." && current.includes(".")) return current;
  if (key === "." && current === "") return "0.";
  const next = current + key;
  const num = parseFloat(next);
  if (isNaN(num) && next !== "0.") return current;
  if (num > 999.99) return current;
  const parts = next.split(".");
  if (parts[1] !== undefined && parts[1].length > 2) return current;
  return next;
}

export function TipKeypad({ value, onChange, onConfirm, onCancel }: Props) {
  const amount = parseFloat(value) || 0;
  const isValid = amount > 0 && amount <= 999.99;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-80 rounded-t-2xl sm:rounded-2xl pb-6">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <span className="text-sm font-semibold text-slate-700">Enter custom tip</span>
          <button
            onClick={onCancel}
            aria-label="Cancel custom tip"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-3 text-center">
          <span className="text-4xl font-bold text-slate-900 tabular-nums">
            ${value || "0"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 px-4">
          {KEYS.map((key) => (
            <button
              key={key}
              onClick={() => onChange(sanitize(value, key))}
              aria-label={key === "del" ? "Delete last digit" : key === "." ? "Decimal point" : key}
              className={`
                h-14 rounded-xl text-lg font-semibold transition-colors duration-100
                ${key === "del"
                  ? "bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"
                  : "bg-slate-50 text-slate-800 hover:bg-slate-100 active:bg-slate-200"}
              `}
            >
              {key === "del" ? <Delete size={18} /> : key}
            </button>
          ))}
        </div>

        <div className="px-4 pt-4">
          <button
            onClick={onConfirm}
            disabled={!isValid}
            className="
              w-full py-3.5 rounded-xl text-sm font-semibold
              bg-amber-500 text-white
              hover:bg-amber-600 active:bg-amber-700
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-100
            "
          >
            Confirm tip ${value || "0.00"}
          </button>
        </div>
      </div>
    </div>
  );
}
