import { useAuth } from "@workspace/replit-auth-web";

export function Login() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-10 py-12 w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center mx-auto mb-5">
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 .994.89l.006.11v3a3 3 0 0 1-3 3H6A3 3 0 0 1 3 7V4Zm0 7a5.002 5.002 0 0 0 4.472 4.972L8 16H7a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-1l.528-.028A5.002 5.002 0 0 0 17 11H3Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">Nuatis POS</h1>
        <p className="text-slate-500 text-sm mb-8">Sign in to access the cafe terminal.</p>
        <button
          onClick={login}
          className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold text-sm transition-colors duration-100"
        >
          Log in
        </button>
      </div>
    </div>
  );
}
