"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MonitorSmartphone, Plus, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  listDevices,
  registerDevice,
  type TerminalReader,
} from "@/lib/api/devices";
import type { Location } from "@/lib/api/orders";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface Props {
  initialDevices: TerminalReader[];
  posJwt: string;
  locations: Location[];
}

export function DevicesList({ initialDevices, posJwt, locations }: Props) {
  const qc = useQueryClient();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [readerId, setReaderId] = useState("");
  const [label, setLabel] = useState("");
  const [locationId, setLocationId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: devices = initialDevices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => listDevices(posJwt),
    initialData: initialDevices,
    staleTime: 30_000,
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      registerDevice(posJwt, {
        stripe_reader_id: readerId.trim(),
        label: label.trim(),
        ...(locationId ? { location_id: locationId } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["devices"] });
      setRegisterOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  function resetForm() {
    setReaderId("");
    setLabel("");
    setLocationId("");
    setFormError(null);
  }

  function handleSubmit() {
    if (!readerId.trim()) { setFormError("Reader ID is required"); return; }
    if (!label.trim()) { setFormError("Label is required"); return; }
    setFormError(null);
    registerMutation.mutate();
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900">
              Devices
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {devices.length} reader{devices.length !== 1 ? "s" : ""} registered
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setRegisterOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0047FF] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-900 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Register new reader
          </button>
        </div>

        {/* Table or empty state */}
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-2xl border-2 border-dashed border-slate-200 text-center">
            <MonitorSmartphone className="h-10 w-10 text-slate-300" />
            <p className="font-serif text-lg font-semibold text-slate-600">
              No readers registered
            </p>
            <p className="text-sm text-slate-400 max-w-xs">
              Register a Stripe Terminal reader to start accepting card-present payments.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Reader ID</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((device) => {
                  const loc = locations.find((l) => l.id === device.location_id);
                  return (
                    <tr key={device.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {device.label}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {device.stripe_reader_id}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {loc?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {fmtDate(device.last_seen_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register dialog */}
      <Dialog.Root
        open={registerOpen}
        onOpenChange={(v) => {
          if (!v) { setRegisterOpen(false); resetForm(); }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-serif text-lg font-semibold text-slate-900">
                Register new reader
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <Dialog.Description className="text-sm text-slate-500 mb-5">
              Enter the Stripe reader ID printed on your device (e.g. <span className="font-mono text-xs">tmr_…</span>).
            </Dialog.Description>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Reader ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={readerId}
                  onChange={(e) => setReaderId(e.target.value)}
                  placeholder="tmr_..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Label <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Counter 1"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
              </div>

              {locations.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Location
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  >
                    <option value="">— Not assigned —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {formError && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setRegisterOpen(false); resetForm(); }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={registerMutation.isPending}
                className="rounded-lg bg-[#0047FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {registerMutation.isPending ? "Registering…" : "Register reader"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
