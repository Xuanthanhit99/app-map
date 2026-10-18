/**
 * Latest-wins gate for async screen requests. Any request issued after another
 * invalidates the older one, so a slow initial read can never overwrite the
 * result of a later, explicitly consented query.
 */
export function createLatestRequestGate() {
  let epoch = 0;
  return {
    begin(): number { epoch += 1; return epoch; },
    isCurrent(token: number): boolean { return token === epoch; },
    invalidate(): void { epoch += 1; },
  };
}
