"use client";

import { useState } from "react";
import type { SettingsData } from "@/lib/api/settings";
import { updateTenantSettings, updateLocationSettings } from "@/lib/api/settings";
import type { StripeStatus } from "@/lib/api/stripe";
import { startStripeOnboarding } from "@/lib/api/stripe";

const TIMEZONES = [
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Phoenix", label: "Arizona (MT no DST)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
] as const;

interface SettingsPageProps {
  data: SettingsData;
  posJwt: string;
  userRole: "owner" | "manager";
  stripeStatus?: StripeStatus | null;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="font-serif text-lg font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function SaveButton({ loading, disabled }: { loading: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="rounded-lg bg-[#0047FF] px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
    >
      {loading ? "Saving…" : "Save"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Stripe Connect section
// ---------------------------------------------------------------------------
function StripeSection({
  stripeStatus,
  posJwt,
  userRole,
}: {
  stripeStatus: StripeStatus | null;
  posJwt: string;
  userRole: "owner" | "manager";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = userRole === "owner";

  const chargesEnabled = stripeStatus?.charges_enabled ?? false;
  const payoutsEnabled = stripeStatus?.payouts_enabled ?? false;
  const hasAccount = Boolean(stripeStatus?.stripe_account_id);
  const requirementsDue = stripeStatus?.requirements_currently_due ?? [];

  const isReady = chargesEnabled && payoutsEnabled;
  const isInProgress = hasAccount && !isReady;

  async function handleConnect() {
    setError(null);
    setLoading(true);
    try {
      const { url } = await startStripeOnboarding(posJwt);
      window.location.href = url;
    } catch (err: unknown) {
      setError((err as Error).message ?? "Failed to start Stripe onboarding");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Payments">
      {/* Status banner */}
      {isReady && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Stripe connected</p>
            <p className="text-xs text-emerald-600">Card payments and payouts are enabled</p>
          </div>
        </div>
      )}

      {isInProgress && (
        <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Stripe onboarding incomplete</p>
            {requirementsDue.length > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                Pending: {requirementsDue.slice(0, 3).join(", ")}
                {requirementsDue.length > 3 && ` +${requirementsDue.length - 3} more`}
              </p>
            )}
          </div>
        </div>
      )}

      {!hasAccount && (
        <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-600">Connect your Stripe account to accept card payments via Stripe Terminal.</p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {!isOwner && (
        <p className="text-xs text-slate-500">Only owners can connect or update the Stripe account.</p>
      )}

      {isOwner && !isReady && (
        <button
          onClick={() => void handleConnect()}
          disabled={loading}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#635BFF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Redirecting…" : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305Z"/>
              </svg>
              {hasAccount ? "Resume Stripe Onboarding" : "Connect Stripe"}
            </>
          )}
        </button>
      )}
    </SectionCard>
  );
}

function TenantSection({
  tenant,
  posJwt,
  userRole,
}: {
  tenant: SettingsData["tenant"];
  posJwt: string;
  userRole: "owner" | "manager";
}) {
  const [name, setName] = useState(tenant.name);
  const [timezone, setTimezone] = useState(tenant.timezone);
  const [emailReport, setEmailReport] = useState(tenant.email_daily_report);
  const [reportEmail, setReportEmail] = useState(tenant.daily_report_recipient_email ?? "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = userRole !== "owner";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await updateTenantSettings(posJwt, {
        name: name.trim(),
        timezone,
        email_daily_report: emailReport,
        daily_report_recipient_email: reportEmail.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError((err as Error).message ?? "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Business Settings">
      {isReadOnly && (
        <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
          Managers can view but not edit business settings. Contact an owner to make changes.
        </div>
      )}
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Business name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isReadOnly}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="Vertical (read-only)">
            <div className="flex items-center gap-2 h-[38px]">
              <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 capitalize">
                {tenant.vertical}
              </span>
              <span className="text-xs text-slate-400">Contact support to change</span>
            </div>
          </Field>

          <Field label="Timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={isReadOnly}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="border-t border-slate-100 pt-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Daily Report Email</h3>
          <div className="flex items-start gap-3">
            <input
              id="email_report"
              type="checkbox"
              checked={emailReport}
              onChange={(e) => setEmailReport(e.target.checked)}
              disabled={isReadOnly}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <label htmlFor="email_report" className="text-sm text-slate-700 leading-snug cursor-pointer">
              Send me a daily end-of-day summary email at midnight
            </label>
          </div>
          {emailReport && (
            <Field label="Report recipient email" hint="Leave blank to use your account email">
              <input
                type="email"
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
                disabled={isReadOnly}
                placeholder="reports@yourcafe.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {saved && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">Settings saved.</div>
        )}

        {!isReadOnly && (
          <div className="flex justify-end pt-1">
            <SaveButton loading={loading} />
          </div>
        )}
      </form>
    </SectionCard>
  );
}

function LocationSection({
  location,
  posJwt,
}: {
  location: SettingsData["locations"][number];
  posJwt: string;
}) {
  const [locName, setLocName] = useState(location.name);
  const [taxPct, setTaxPct] = useState((location.sales_tax_bps / 100).toFixed(2));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const pct = parseFloat(taxPct);
    if (isNaN(pct) || pct < 0 || pct > 20) {
      setError("Tax rate must be between 0% and 20%.");
      return;
    }
    const bps = Math.round(pct * 100);

    setLoading(true);
    try {
      await updateLocationSettings(posJwt, location.id, {
        name: locName.trim(),
        sales_tax_bps: bps,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError((err as Error).message ?? "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title={`Location: ${location.name}`}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Location name">
            <input
              type="text"
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="Sales tax rate" hint="e.g. 8.25 for 8.25%. Range: 0–20%.">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
                min="0"
                max="20"
                step="0.01"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-500 font-medium text-sm shrink-0">%</span>
            </div>
          </Field>

          <Field label="Business hours">
            <div className="flex h-[38px] items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 text-xs text-slate-400">
              Business hours editor coming soon
            </div>
          </Field>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {saved && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">Location saved.</div>
        )}

        <div className="flex justify-end pt-1">
          <SaveButton loading={loading} />
        </div>
      </form>
    </SectionCard>
  );
}

export function SettingsPage({ data, posJwt, userRole, stripeStatus }: SettingsPageProps) {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your business details, locations, and delivery preferences.</p>
      </div>

      <StripeSection stripeStatus={stripeStatus ?? null} posJwt={posJwt} userRole={userRole} />

      <TenantSection tenant={data.tenant} posJwt={posJwt} userRole={userRole} />

      {data.locations.map((loc) => (
        <LocationSection key={loc.id} location={loc} posJwt={posJwt} />
      ))}
    </div>
  );
}
