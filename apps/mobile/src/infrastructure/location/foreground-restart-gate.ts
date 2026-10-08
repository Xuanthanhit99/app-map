export function createForegroundRestartGate() {
  let starting = false;
  let pending = false;
  let foreground = true;
  let disposed = false;
  return {
    begin(): "START" | "QUEUED" | "SKIP" {
      if (disposed || !foreground) return "SKIP";
      if (starting) { pending = true; return "QUEUED"; }
      starting = true;
      return "START";
    },
    transition(active: boolean): boolean {
      foreground = active;
      pending = active;
      return active && !starting && !disposed;
    },
    finish(hasWatcher: boolean): boolean {
      starting = false;
      if (disposed || !foreground || !pending || hasWatcher) return false;
      pending = false;
      return true;
    },
    dispose(): void { disposed = true; foreground = false; pending = false; },
  };
}
