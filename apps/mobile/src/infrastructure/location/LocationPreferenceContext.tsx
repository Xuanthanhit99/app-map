import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type LocationChoice = "ASK" | "ENABLE" | "SKIP";
type LocationPreference = { choice: LocationChoice; setChoice: (choice: LocationChoice) => void };
const Context = createContext<LocationPreference | null>(null);

export function LocationPreferenceProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<LocationChoice>("ASK");
  const value = useMemo(() => ({ choice, setChoice }), [choice]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocationPreference() {
  const context = useContext(Context);
  if (!context) throw new Error("LocationPreferenceProvider is required");
  return context;
}
