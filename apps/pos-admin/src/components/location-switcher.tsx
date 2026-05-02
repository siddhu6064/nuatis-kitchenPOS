"use client";

import { useState, useEffect } from "react";
import { ChevronDown, MapPin } from "lucide-react";

const STORAGE_KEY = "pos.active_location_id";

export interface LocationOption {
  id: string;
  name: string;
}

interface Props {
  locations: LocationOption[];
}

export function LocationSwitcher({ locations }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Read saved selection from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved && locations.some((l) => l.id === saved)) {
      setActiveId(saved);
    } else if (locations.length > 0) {
      setActiveId(locations[0]!.id);
    }
  }, [locations]);

  function select(id: string) {
    setActiveId(id);
    sessionStorage.setItem(STORAGE_KEY, id);
    setOpen(false);
    // Reload so server components re-fetch with the new location
    window.location.reload();
  }

  const active = locations.find((l) => l.id === activeId) ?? locations[0];

  if (locations.length === 0) {
    return (
      <span className="text-sm text-slate-500 flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-medium text-slate-700">Main Location</span>
      </span>
    );
  }

  if (locations.length === 1) {
    return (
      <span className="text-sm text-slate-500 flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-medium text-slate-700">{active?.name ?? "Location"}</span>
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <MapPin className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-medium text-slate-700">{active?.name ?? "Select location"}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-lg py-1">
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => select(loc.id)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  loc.id === activeId
                    ? "text-brand font-medium bg-brand/5"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
