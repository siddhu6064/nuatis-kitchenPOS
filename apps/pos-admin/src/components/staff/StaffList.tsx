"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Pencil, Power } from "lucide-react";
import type { StaffMember } from "@/lib/api/staff";
import { getStaff, updateStaff } from "@/lib/api/staff";
import { InviteStaffDialog } from "./InviteStaffDialog";
import type { Location } from "@/lib/api/orders";

interface StaffListProps {
  initialStaff: StaffMember[];
  posJwt: string;
  locations: Location[];
  userRole: "owner" | "manager";
  userId: string;
}

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-blue-100 text-blue-700 border-blue-200",
  manager: "bg-amber-100 text-amber-700 border-amber-200",
  cashier: "bg-slate-100 text-slate-600 border-slate-200",
};

export function StaffList({ initialStaff, posJwt, locations, userRole, userId }: StaffListProps) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: staff = initialStaff } = useQuery({
    queryKey: ["staff"],
    queryFn: () => getStaff(posJwt),
    initialData: initialStaff,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateStaff(posJwt, id, { active }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff"] });
      setApiError(null);
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "cannot_deactivate_self") {
        setApiError("You cannot deactivate yourself.");
      } else if (err.code === "last_owner") {
        setApiError("Cannot deactivate the last active owner.");
      } else {
        setApiError(err.message);
      }
    },
  });

  function openInvite() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(member: StaffMember) {
    setEditTarget(member);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900">Staff</h1>
            <p className="mt-1 text-sm text-slate-500">
              {staff.length} member{staff.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={openInvite}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0047FF] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-900 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Invite Staff
          </button>
        </div>

        {/* Error banner */}
        {apiError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {apiError}
            <button onClick={() => setApiError(null)} className="text-red-400 hover:text-red-600 ml-4 text-xs underline">Dismiss</button>
          </div>
        )}

        {/* Table */}
        {staff.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 flex flex-col items-center justify-center gap-3 text-center">
            <p className="font-serif text-lg font-semibold text-slate-600">No staff yet</p>
            <p className="text-sm text-slate-400">Invite your first cashier to get started.</p>
            <button
              onClick={openInvite}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#0047FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Invite Staff
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Name", "Role", "Email", "PIN", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((m) => (
                    <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-800 whitespace-nowrap">{m.full_name}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_BADGE[m.role] ?? ""}`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{m.email ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-3.5">
                        {m.has_pin ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700">Set</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-xs text-slate-400">Not set</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => {
                            if (m.id !== userId || !m.active) {
                              toggleActive.mutate({ id: m.id, active: !m.active });
                            } else {
                              setApiError("You cannot deactivate yourself.");
                            }
                          }}
                          disabled={toggleActive.isPending}
                          className="group inline-flex items-center gap-1.5"
                          title={m.active ? "Deactivate" : "Reactivate"}
                        >
                          {m.active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700 group-hover:bg-red-50 group-hover:border-red-200 group-hover:text-red-600 transition-colors">
                              <Power className="h-2.5 w-2.5" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-600 group-hover:bg-emerald-50 group-hover:border-emerald-200 group-hover:text-emerald-700 transition-colors">
                              <Power className="h-2.5 w-2.5" /> Inactive
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => openEdit(m)}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <InviteStaffDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        posJwt={posJwt}
        locations={locations}
        staffToEdit={editTarget}
        onSuccess={() => {
          void qc.invalidateQueries({ queryKey: ["staff"] });
          setDialogOpen(false);
        }}
        userRole={userRole}
      />
    </>
  );
}
