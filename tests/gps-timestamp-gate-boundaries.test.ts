/* eslint-disable @typescript-eslint/no-explicit-any -- native Expo module mock mirrors gps-expo-hook-races.test.ts */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Expo defines __DEV__ at runtime; Vitest must provide the same global.
vi.stubGlobal("__DEV__", false);

const native = vi.hoisted(() => {
  const listeners: Array<(value: string) => void> = [];
  const watchers: Array<{ callback: (position: any) => void; remove: ReturnType<typeof vi.fn> }> = [];
  const state = { value: { status: "IDLE" } as any, cleanup: undefined as undefined | (() => void) };
  return {
    listeners, watchers, state,
    app: { currentState: "active", addEventListener: vi.fn((_name: string, cb: (value: string) => void) => {
      listeners.push(cb);
      return { remove: vi.fn() };
    }) },
    location: {
      Accuracy: { Balanced: 3 },
      hasServicesEnabledAsync: vi.fn(async () => true),
      getProviderStatusAsync: vi.fn(async () => ({})),
      getForegroundPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: true })),
      requestForegroundPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: true })),
      getLastKnownPositionAsync: vi.fn(async () => null as any),
      watchPositionAsync: vi.fn(async (_options: any, callback: (position: any) => void) => {
        const subscription = { callback, remove: vi.fn() };
        watchers.push(subscription);
        return subscription;
      }),
    },
  };
});

vi.mock("react", () => ({
  useState: (_initial: unknown) => [native.state.value, (next: any) => { native.state.value = next; }],
  useRef: (value: any) => ({ current: value }),
  useEffect: (callback: () => () => void) => { native.state.cleanup = callback(); },
}));
vi.mock("react-native", () => ({ AppState: native.app }));
vi.mock("expo-location", () => native.location);

import { useForegroundLocationLifecycle } from "../apps/mobile/src/infrastructure/location/useForegroundLocationLifecycle";

const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const mount = async () => { useForegroundLocationLifecycle(); await tick(); };
/**
 * Checkpoint 02 — characterization of the CURRENT display gate (not an approved navigation policy).
 * Native timestamp: Android Location.getTime() (wall clock, GNSS UTC for the gps provider) / iOS CLLocation.timestamp.
 * Evaluated against JS Date.now() at callback time. expo-location exposes no monotonic (elapsedRealtimeNanos) value.
 * Any change to these boundaries is a product-policy change and requires approval (see CHECKPOINT-02 §GPS).
 */
const NOW = new Date("2026-10-13T00:00:00Z").getTime();
const emit = (overrides: { timestamp?: number; accuracy?: number | null; mocked?: boolean } = {}) => {
  const watcher = native.watchers.at(-1);
  if (!watcher) throw new Error("no registered watcher");
  watcher.callback({
    timestamp: overrides.timestamp ?? Date.now(),
    coords: { latitude: 21.02, longitude: 105.83, accuracy: overrides.accuracy === undefined ? 8 : overrides.accuracy },
    ...(overrides.mocked === undefined ? {} : { mocked: overrides.mocked }),
  });
};

describe("GPS display gate timestamp boundaries (owner-approved policy 2026-10-22)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    native.state.value = { status: "IDLE" };
    native.state.cleanup = undefined;
    native.listeners.length = 0;
    native.watchers.length = 0;
    native.app.currentState = "active";
    native.location.hasServicesEnabledAsync.mockResolvedValue(true);
    native.location.getProviderStatusAsync.mockResolvedValue({});
    native.location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    native.location.getLastKnownPositionAsync.mockResolvedValue(null);
    native.location.watchPositionAsync.mockImplementation(async (_options: any, callback: any) => {
      const subscription = { callback, remove: vi.fn() };
      native.watchers.push(subscription);
      return subscription;
    });
  });
  afterEach(() => { native.state.cleanup?.(); vi.useRealTimers(); });

  it("observedAt == evaluatedAt is accepted", async () => {
    await mount(); emit({ timestamp: NOW });
    expect(native.state.value.status).toBe("READY");
  });
  it("+1 ms and +2000 ms future skew are accepted (approved tolerance)", async () => {
    await mount(); emit({ timestamp: NOW + 1 });
    expect(native.state.value.status).toBe("READY");
    emit({ timestamp: NOW + 2000 });
    expect(native.state.value.status).toBe("READY");
  });
  it("+2001 ms future skew is rejected as a clock error", async () => {
    await mount(); emit({ timestamp: NOW + 2001 });
    expect(native.state.value.status).toBe("REQUESTING");
  });
  it("age exactly 30 000 ms is accepted; 30 001 ms is rejected as stale", async () => {
    await mount(); emit({ timestamp: NOW - 30_001 });
    expect(native.state.value.status).toBe("REQUESTING");
    emit({ timestamp: NOW - 30_000 });
    expect(native.state.value.status).toBe("READY");
  });
  it("missing accuracy is rejected; poor accuracy is not filtered for display", async () => {
    await mount(); emit({ accuracy: null });
    expect(native.state.value.status).toBe("REQUESTING");
    emit({ accuracy: 5_000 });
    expect(native.state.value.status).toBe("READY");
  });
  it("a valid fix degrades to STALE after 30 s without a newer fix", async () => {
    await mount(); emit({ timestamp: NOW });
    expect(native.state.value.status).toBe("READY");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(native.state.value).toMatchObject({ status: "DEGRADED", reason: "STALE" });
  });
  it("a fresh LAST_KNOWN cache never becomes READY on its own", async () => {
    native.location.getLastKnownPositionAsync.mockResolvedValue({ timestamp: NOW, coords: { latitude: 21, longitude: 105, accuracy: 5 } });
    await mount();
    expect(native.state.value.status).toBe("REQUESTING");
  });
  it("explicit mocked=true never reaches READY", async () => {
    await mount(); emit({ mocked: true });
    expect(native.state.value.status).toBe("REQUESTING");
  });
  it("missing mock metadata stays UNKNOWN; mocked=false is only 'reported', never 'proven'", async () => {
    await mount(); emit({});
    expect(native.state.value).toMatchObject({ status: "READY", mockStatus: "UNKNOWN" });
    emit({ mocked: false });
    expect(native.state.value).toMatchObject({ status: "READY", mockStatus: "REPORTED_NOT_MOCKED" });
  });
});
