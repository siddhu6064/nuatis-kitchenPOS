"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { StaffMember } from "@/lib/api/staff";
import { createStaff, updateStaff } from "@/lib/api/staff";
import type { Location } from "@/lib/api/orders";

interface InviteStaffDialogProps {
  open: boolean;
  onClose: () => void;
  posJwt: string;
  locations: Location[];
  staffToEdit: StaffMember | null;
  onSuccess: () => void;
  userRole: "owner" | "manager";
}

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
] as const;

export function InviteStaffDialog({
  open,
  onClose,
  posJwt,
  locations,
  staffToEdit,
  onSuccess,
  userRole,
}: InviteStaffDialogProps) {
  const isEdit = staffToEdit !== null;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "manager" | "cashier">("cashier");
  const [pin, setPin] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (staffToEdit) {
        setFullName(staffToEdit.full_name);
        setEmail(staffToEdit.email ?? "");
        setRole(staffToEdit.role);
        setPin("");
        setSelectedLocations(staffToEdit.location_ids ?? []);
      } else {
        setFullName("");
        setEmail("");
        setRole("cashier");
        setPin("");
        setSelectedLocations(locations.length === 1 ? [locations[0]!.id] : []);
      }
      setError(null);
    }
  }, [open, staffToEdit, locations]);

  function toggleLocation(id: string) {
    setSelectedLocations((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) { setError("Full name is required."); return; }
    if (role === "cashier" && !isEdit && !pin) { setError("PIN is required for cashiers."); return; }
    if (pin && !/^\d{4}$/.test(pin)) { setError("PIN must be exactly 4 digits."); return; }

    setLoading(true);
    try {
      const payload = {
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        role,
        pin: pin || undefined,
        location_ids: selectedLocations.length > 0 ? selectedLocations : undefined,
      };

      if (isEdit && staffToEdit) {
        await updateStaff(posJwt, staffToEdit.id, payload);
      } else {
        await createStaff(posJwt, payload);
      }
      onSuccess();
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      if (e.code === "last_owner") {
        setError("Cannot deactivate the last active owner.");
      } else if (e.code === "cannot_deactivate_self") {
        setError("You cannot deactivate yourself.");
      } else {
        setError(e.message ?? "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-2xl bg-white shadow-xl p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="font-serif text-xl font-bold text-slate-900">
              {isEdit ? "Edit Staff Member" : "Invite Staff"}
            </Dialog.Title>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {/* Full name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email <span className="text-slate-400 text-xs font-normal">(optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@yourcafe.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLES.filter((r) => userRole === "owner" || r.value !== "owner").map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* PIN */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                PIN (4 digits)
                {!isEdit && role === "cashier" && <span className="text-red-500"> *</span>}
                {isEdit && <span className="text-slate-400 text-xs font-normal ml-1">(leave blank to keep current)</span>}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Location assignment */}
            {locations.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Locations
                </label>
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <label key={loc.id} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLocations.includes(loc.id)}
                        onChange={() => toggleLocation(loc.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">{loc.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-[#0047FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Saving…" : isEdit ? "Save Changes" : "Invite"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
