import { createContext, useContext, useState, useEffect, useRef } from "react";
import { getConnectionToken } from "@/lib/api/stripe";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface TerminalContextValue {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  terminal: any | null;
  isReady: boolean;
  stripeConfigured: boolean;
}

const TerminalContext = createContext<TerminalContextValue>({
  terminal: null,
  isReady: false,
  stripeConfigured: false,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function StripeTerminalProvider({ children }: { children: React.ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [terminal, setTerminal] = useState<any | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void initTerminal();
  }, []);

  async function initTerminal() {
    try {
      // Dynamic import to avoid SSR / build-time errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { loadStripeTerminal } = await import("@stripe/terminal-js" as any);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const StripeTerminalModule = await (loadStripeTerminal as () => Promise<unknown>)();
      if (!StripeTerminalModule) {
        console.warn("[StripeTerminal] loadStripeTerminal returned null — check Stripe Terminal JS");
        return;
      }

      setStripeConfigured(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (StripeTerminalModule as any).create({
        onFetchConnectionToken: async (): Promise<string> => {
          const data = await getConnectionToken();
          return data.secret;
        },
        onUnexpectedReaderDisconnect: () => {
          console.warn("[StripeTerminal] unexpected reader disconnect");
          setIsReady(false);
        },
      });

      // Discover simulated reader (dev mode)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const discoverResult = await t.discoverReaders({ simulated: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((discoverResult as any).error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.warn("[StripeTerminal] discoverReaders error:", (discoverResult as any).error);
        setTerminal(t); // still provide terminal — user can retry
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readers = (discoverResult as any).discoveredReaders ?? [];
      if (!readers.length) {
        console.warn("[StripeTerminal] no simulated readers found");
        setTerminal(t);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const connectResult = await t.connectReader(readers[0]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((connectResult as any).error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.warn("[StripeTerminal] connectReader error:", (connectResult as any).error);
        setTerminal(t);
        return;
      }

      setTerminal(t);
      setIsReady(true);
      console.info("[StripeTerminal] simulated reader connected — ready");
    } catch (err) {
      console.warn("[StripeTerminal] init failed:", err);
    }
  }

  return (
    <TerminalContext.Provider value={{ terminal, isReady, stripeConfigured }}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useStripeTerminal(): TerminalContextValue {
  return useContext(TerminalContext);
}
