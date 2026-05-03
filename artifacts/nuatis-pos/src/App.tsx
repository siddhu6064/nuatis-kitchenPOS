import { useEffect } from "react";
import { useAuth } from "@/lib/api/AuthContext";
import { POS } from "@/pages/POS";
import { Login } from "@/pages/Login";
import { KdsScreen } from "@/components/kds/KdsScreen";
import { StripeTerminalProvider } from "@/components/StripeTerminalProvider";

// Strip trailing slash from Vite's BASE_URL (e.g. "/nuatis-pos/" → "/nuatis-pos")
// so we can do a clean suffix-strip when detecting /kds route.
const basePath = (import.meta.env.BASE_URL as string ?? "/").replace(/\/$/, "");

/**
 * Returns the route segment after the Vite base path.
 * e.g. pathname "/nuatis-pos/kds" with basePath "/nuatis-pos" → "/kds"
 */
function getRouteSegment(): string {
  const pathname = window.location.pathname;
  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}

/**
 * KDS guard: redirects to the POS root if the user is not authenticated.
 * Graceful redirect using useEffect so it doesn't run during SSR-like renders.
 */
function KdsGuard() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.replace(basePath || "/");
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;
  return <KdsScreen />;
}

function App() {
  const { isAuthenticated } = useAuth();
  const route = getRouteSegment();

  // Hash-free /kds route — Vite serves index.html for all paths (historyApiFallback)
  if (route === "/kds") {
    return <KdsGuard />;
  }

  return isAuthenticated ? (
    <StripeTerminalProvider>
      <POS />
    </StripeTerminalProvider>
  ) : (
    <Login />
  );
}

export default App;
