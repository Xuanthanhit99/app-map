import { describe, expect, it } from "vitest";
import { createForegroundRestartGate } from "../apps/mobile/src/infrastructure/location/foreground-restart-gate";

describe("foreground location restart behavior", () => {
  it("queues a restart while a native start is pending and resumes once", () => {
    const gate = createForegroundRestartGate();
    expect(gate.begin()).toBe("START");
    expect(gate.transition(false)).toBe(false);
    expect(gate.transition(true)).toBe(false);
    expect(gate.begin()).toBe("QUEUED");
    expect(gate.finish(false)).toBe(true);
    expect(gate.begin()).toBe("START");
    expect(gate.finish(true)).toBe(false);
  });
  it("never restarts when backgrounded or disposed", () => {
    const gate = createForegroundRestartGate();
    expect(gate.begin()).toBe("START");
    gate.transition(false);
    expect(gate.finish(false)).toBe(false);
    expect(gate.begin()).toBe("SKIP");
    gate.transition(true);
    expect(gate.begin()).toBe("START");
    gate.dispose();
    expect(gate.finish(false)).toBe(false);
    expect(gate.begin()).toBe("SKIP");
  });
  it("does not endlessly retry failed starts without a new foreground event", () => {
    const gate = createForegroundRestartGate();
    expect(gate.begin()).toBe("START");
    expect(gate.finish(false)).toBe(false);
    expect(gate.transition(true)).toBe(true);
    expect(gate.begin()).toBe("START");
    expect(gate.finish(false)).toBe(false);
  });
});
