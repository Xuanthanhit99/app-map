import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type LocationChoice = "ASK" | "ENABLE" | "SKIP";
type LocationPreference = {
  choice: LocationChoice;
  hydrated: boolean;
  setChoice: (choice: LocationChoice) => void;
};
const STORAGE_KEY = "privacy.location.choice.v1";
const Context = createContext<LocationPreference | null>(null);

function validChoice(value: string | null): LocationChoice {
  return value === "ENABLE" || value === "SKIP" ? value : "ASK";
}

export function LocationPreferenceProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<LocationChoice>("ASK");
  const [hydrated, setHydrated] = useState(false);
  const changedDuringLoad = useRef(false);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const setChoice = (next: LocationChoice) => {
    changedDuringLoad.current = true;
    setChoiceState(next);
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(STORAGE_KEY, next))
      .catch((error: unknown) => {
        if (__DEV__) console.warn("[LocationPreference] save failed", error);
      });
  };

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted || changedDuringLoad.current) return;
        const restored = validChoice(stored);
        setChoiceState(restored);
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn("[LocationPreference] restore failed", error);
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => { mounted = false; };
  }, []);

  const value = useMemo(() => ({ choice, hydrated, setChoice }), [choice, hydrated]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocationPreference() {
  const context = useContext(Context);
  if (!context) throw new Error("LocationPreferenceProvider is required");
  return context;
}
