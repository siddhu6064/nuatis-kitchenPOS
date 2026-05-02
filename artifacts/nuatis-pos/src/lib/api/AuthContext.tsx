import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getJwt } from "./client";
import { signOut as apiSignOut } from "./auth";

interface AuthState {
  isAuthenticated: boolean;
  displayName: string;
  staffId: string | null;
  locationId: string | null;
  signOut: () => void;
}

const AuthCtx = createContext<AuthState>({
  isAuthenticated: false,
  displayName: "Staff",
  staffId: null,
  locationId: null,
  signOut: () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [jwt, setJwtState] = useState<string | null>(() => getJwt());

  const displayName =
    sessionStorage.getItem("pos.staff_name") ?? "Cashier";
  const staffId = sessionStorage.getItem("pos.staff_id");
  const locationId = sessionStorage.getItem("pos.location_id");

  const handleAuthChange = useCallback(() => {
    setJwtState(getJwt());
  }, []);

  useEffect(() => {
    window.addEventListener("pos:auth-changed", handleAuthChange);
    return () =>
      window.removeEventListener("pos:auth-changed", handleAuthChange);
  }, [handleAuthChange]);

  const signOut = useCallback(() => {
    apiSignOut();
    setJwtState(null);
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        isAuthenticated: jwt !== null,
        displayName,
        staffId,
        locationId,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
