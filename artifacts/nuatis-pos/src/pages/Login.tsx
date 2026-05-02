import { useState, type FormEvent } from "react";
import { signInWithPin } from "@/lib/api/auth";

const DEMO_TENANT =
  (import.meta.env["VITE_DEMO_TENANT_ID"] as string | undefined) ??
  "00000000-0000-0000-0000-000000000001";

const DEMO_LOCATION =
  (import.meta.env["VITE_DEMO_LOCATION_ID"] as string | undefined) ??
  "00000000-0000-0000-0000-000000000010";

export function Login() {
  const [tenantId, setTenantId] = useState(DEMO_TENANT);
  const [locationId, setLocationId] = useState(DEMO_LOCATION);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithPin(tenantId, locationId, pin);
      window.dispatchEvent(new Event("pos:auth-changed"));
    } catch {
      setError("Invalid PIN. Please try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-10 py-12 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 .994.89l.006.11v3a3 3 0 0 1-3 3H6A3 3 0 0 1 3 7V4Zm0 7a5.002 5.002 0 0 0 4.472 4.972L8 16H7a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-1l.528-.028A5.002 5.002 0 0 0 17 11H3Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Nuatis POS</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in with your cashier PIN</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          {/* Tenant ID */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Tenant ID
            </label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000001"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-600 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent font-mono"
            />
          </div>

          {/* Location ID */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Location ID
            </label>
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000010"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-600 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent font-mono"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              autoComplete="current-password"
              className="w-full px-3 py-2.5 text-center text-xl tracking-[0.5em] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="
              w-full py-3 rounded-xl bg-brand text-white font-semibold text-sm
              hover:bg-blue-700 active:bg-blue-800
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-100 mt-2
            "
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          Demo PIN: <span className="font-mono font-semibold text-slate-500">1234</span>
        </p>
      </div>
    </div>
  );
}
