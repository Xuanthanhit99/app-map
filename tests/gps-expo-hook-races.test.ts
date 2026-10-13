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
  useState: (initial: any) => [native.state.value, (next: any) => { native.state.value = next; }],
  useRef: (value: any) => ({ current: value }),
  useEffect: (callback: () => () => void) => { native.state.cleanup = callback(); },
}));
vi.mock("react-native", () => ({ AppState: native.app }));
vi.mock("expo-location", () => native.location);

import { useForegroundLocationLifecycle } from "../apps/mobile/src/infrastructure/location/useForegroundLocationLifecycle";

const position = (timestamp = Date.now(), accuracy: number | null = 8) => ({
  timestamp, coords: { latitude: 21.02, longitude: 105.83, accuracy },
});
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const mount = async () => { useForegroundLocationLifecycle(); await tick(); };
const transition = async (value: string) => {
  native.app.currentState = value;
  for (const listener of [...native.listeners]) listener(value);
  await tick();
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("E-04D mocked Expo hook lifecycle behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
    native.state.value = { status: "IDLE" };
    native.state.cleanup = undefined;
    native.listeners.length = 0;
    native.watchers.length = 0;
    native.app.currentState = "active";
    for (const fn of Object.values(native.location)) if (typeof fn === "function" && "mockReset" in fn) (fn as any).mockReset();
    native.location.hasServicesEnabledAsync.mockResolvedValue(true);
    native.location.getProviderStatusAsync.mockResolvedValue({});
    native.location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    native.location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    native.location.getLastKnownPositionAsync.mockResolvedValue(null);
    native.location.watchPositionAsync.mockImplementation(async (_options: any, callback: any) => {
      const subscription = { callback, remove: vi.fn() };
      native.watchers.push(subscription);
      return subscription;
    });
  });
  afterEach(() => { native.state.cleanup?.(); vi.useRealTimers(); });

  it("ignores a WATCH callback delivered after background", async () => {
    await mount();
    const old = native.watchers[0]!;
    old.callback(position());
    expect(native.state.value.status).toBe("READY");
    await transition("background");
    old.callback(position());
    expect(native.state.value.status).toBe("IDLE");
    expect(old.remove).toHaveBeenCalled();
  });

  it("does not accept permission completion after background", async () => {
    const pending = deferred<any>();
    native.location.getForegroundPermissionsAsync.mockReturnValueOnce(pending.promise);
    await mount();
    await transition("background");
    pending.resolve({ granted: true, canAskAgain: true });
    await tick();
    expect(native.location.watchPositionAsync).not.toHaveBeenCalled();
    expect(native.state.value.status).toBe("IDLE");
  });

  it("removes a late old watcher registration after foreground restart", async () => {
    const pending = deferred<any>();
    native.location.watchPositionAsync.mockImplementationOnce((_options: any, callback: any) => {
      const subscription = { callback, remove: vi.fn() };
      native.watchers.push(subscription);
      return pending.promise.then(() => subscription);
    });
    await mount();
    const old = native.watchers[0];
    await transition("background");
    await transition("active");
    pending.resolve(undefined);
    await tick();
    expect(old.remove).toHaveBeenCalled();
    expect(native.watchers.length).toBeGreaterThanOrEqual(2);
    old.callback(position());
    expect(native.state.value.status).not.toBe("READY");
    native.watchers.at(-1)!.callback(position());
    expect(native.state.value.status).toBe("READY");
  });

  it("does not promote cached location to live READY", async () => {
    native.location.getLastKnownPositionAsync.mockResolvedValueOnce(position());
    await mount();
    expect(native.state.value.status).toBe("REQUESTING");
    native.watchers[0]!.callback(position());
    expect(native.state.value.status).toBe("READY");
  });

  it("ignores late native resolution after unmount", async () => {
    const pending = deferred<boolean>();
    native.location.hasServicesEnabledAsync.mockReturnValueOnce(pending.promise);
    await mount();
    native.state.cleanup?.();
    pending.resolve(true);
    await tick();
    expect(native.location.getProviderStatusAsync).not.toHaveBeenCalled();
    expect(native.state.value.status).toBe("REQUESTING");
  });

  it("rejects invalid or incomplete fixes and reports disabled services", async () => {
    await mount();
    native.watchers[0]!.callback(position(Date.now() - 60_000));
    expect(native.state.value.status).toBe("REQUESTING");
    native.watchers[0]!.callback(position(Date.now(), null));
    expect(native.state.value.status).toBe("REQUESTING");
    native.watchers[0]!.callback(position());
    expect(native.state.value.status).toBe("READY");
    native.state.cleanup?.();

    native.state.value = { status: "IDLE" };
    native.location.hasServicesEnabledAsync.mockResolvedValueOnce(false);
    await mount();
    expect(native.state.value).toEqual({ status: "UNAVAILABLE", reason: "SERVICES_DISABLED" });
  });
});
