import { describe, expect, it, vi } from "vitest";
import { applyApiGuards } from "../apps/api/src/api-guard";
import {
  clientIdentityResolverFromEnv, createClientIdentityResolver, normalizeClientAddress, ClientIdentityConfigError,
} from "../apps/api/src/client-identity";

const req = (peer: string | undefined, headers: Record<string, string | string[]> = {}) =>
  ({ headers, socket: { remoteAddress: peer } }) as never;

describe("client address normalization", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::1", "2001:db8:1:2::/64"],
    ["[2001:db8::1]", "2001:db8:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
  ])("%s -> %s", (input, expected) => expect(normalizeClientAddress(input)).toBe(expected));
  it.each(["", "not-an-ip", "1.2.3.4, 5.6.7.8", "999.1.1.1", "1.2.3.4:80", "x".repeat(80)])("rejects %j", (input) => {
    expect(normalizeClientAddress(input)).toBeNull();
  });
  it("IPv6 rotation inside one /64 shares a bucket", () => {
    const resolve = createClientIdentityResolver({ mode: "none" });
    expect(resolve(req("2001:db8:1:2::a")).key).toBe(resolve(req("2001:db8:1:2::b")).key);
    expect(resolve(req("2001:db8:1:2::a")).key).not.toBe(resolve(req("2001:db8:1:3::a")).key);
  });
});

describe("default mode never trusts forwarded headers", () => {
  const resolve = createClientIdentityResolver({ mode: "none" });
  it("ignores spoofed X-Forwarded-For and X-Real-IP", () => {
    const a = resolve(req("198.51.100.1", { "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }));
    const b = resolve(req("198.51.100.1", { "x-forwarded-for": "3.3.3.3", "x-real-ip": "4.4.4.4" }));
    expect(a).toEqual({ key: "peer:198.51.100.1", basis: "SOCKET_PEER" });
    expect(b.key).toBe(a.key);
  });
  it("distinct peers get distinct buckets", () => {
    expect(resolve(req("198.51.100.1")).key).not.toBe(resolve(req("198.51.100.2")).key);
  });
});

describe("railway mode", () => {
  const resolve = createClientIdentityResolver({ mode: "railway" });
  it("separates clients behind the same edge peer", () => {
    const edge = "10.0.0.5";
    expect(resolve(req(edge, { "x-real-ip": "203.0.113.1" }))).toEqual({ key: "client:203.0.113.1", basis: "TRUSTED_HEADER" });
    expect(resolve(req(edge, { "x-real-ip": "203.0.113.2" })).key).toBe("client:203.0.113.2");
  });
  it("does not read X-Forwarded-For in railway mode", () => {
    expect(resolve(req("10.0.0.5", { "x-forwarded-for": "203.0.113.9" })).basis).toBe("UNATTRIBUTED");
  });
  it.each([
    [{}],
    [{ "x-real-ip": "" }],
    [{ "x-real-ip": "garbage" }],
    [{ "x-real-ip": "1.2.3.4, 5.6.7.8" }],
    [{ "x-real-ip": ["1.2.3.4", "5.6.7.8"] }],
  ])("missing/malformed/duplicated header %j falls into one unattributed bucket per peer", (headers) => {
    const id = resolve(req("10.0.0.5", headers as Record<string, string>));
    expect(id).toEqual({ key: "unattributed:10.0.0.5", basis: "UNATTRIBUTED" });
  });
  it("pinned proxy CIDR: a direct (non-proxy) peer cannot spoof X-Real-IP", () => {
    const pinned = createClientIdentityResolver({ mode: "railway", trustedProxyCidrs: "10.0.0.0/8, fd00::/8" });
    expect(pinned(req("10.1.2.3", { "x-real-ip": "203.0.113.1" })).key).toBe("client:203.0.113.1");
    expect(pinned(req("::ffff:10.1.2.3", { "x-real-ip": "203.0.113.1" })).key).toBe("client:203.0.113.1");
    expect(pinned(req("198.51.100.66", { "x-real-ip": "203.0.113.1" }))).toEqual({ key: "peer:198.51.100.66", basis: "SOCKET_PEER" });
    expect(pinned(req(undefined, { "x-real-ip": "203.0.113.1" })).basis).toBe("SOCKET_PEER");
  });
});

describe("xff mode uses only proxy-appended entries", () => {
  it("one trusted hop takes the right-most entry, never the client-written left side", () => {
    const resolve = createClientIdentityResolver({ mode: "xff", hops: 1 });
    expect(resolve(req("10.0.0.1", { "x-forwarded-for": "6.6.6.6, 203.0.113.4" })).key).toBe("client:203.0.113.4");
    expect(resolve(req("10.0.0.1", { "x-forwarded-for": "7.7.7.7, 203.0.113.4" })).key).toBe("client:203.0.113.4");
  });
  it("two trusted hops (CDN + LB)", () => {
    const resolve = createClientIdentityResolver({ mode: "xff", hops: 2 });
    expect(resolve(req("10.0.0.1", { "x-forwarded-for": "6.6.6.6, 203.0.113.4, 172.16.0.9" })).key).toBe("client:203.0.113.4");
    expect(resolve(req("10.0.0.1", { "x-forwarded-for": "203.0.113.4" })).basis).toBe("UNATTRIBUTED");
  });
  it("empty chain elements are rejected", () => {
    const resolve = createClientIdentityResolver({ mode: "xff", hops: 1 });
    expect(resolve(req("10.0.0.1", { "x-forwarded-for": "1.1.1.1, " })).basis).toBe("UNATTRIBUTED");
  });
});

describe("configuration fails closed", () => {
  it.each([
    [{ TRUST_PROXY: "all" }, "INVALID_TRUST_PROXY"],
    [{ TRUST_PROXY: "xff", TRUSTED_PROXY_HOPS: "0" }, "INVALID_TRUSTED_PROXY_HOPS"],
    [{ TRUST_PROXY: "xff", TRUSTED_PROXY_HOPS: "abc" }, "INVALID_TRUSTED_PROXY_HOPS"],
    [{ TRUST_PROXY: "railway", TRUSTED_PROXY_CIDRS: "10.0.0.0/33" }, "INVALID_TRUSTED_PROXY_CIDRS"],
    [{ TRUST_PROXY: "railway", TRUSTED_PROXY_CIDRS: "nope" }, "INVALID_TRUSTED_PROXY_CIDRS"],
  ])("%j -> %s", (env, message) => {
    expect(() => clientIdentityResolverFromEnv(env as unknown as NodeJS.ProcessEnv)).toThrow(new ClientIdentityConfigError(message));
  });
  it("unset TRUST_PROXY defaults to socket peer", () => {
    expect(clientIdentityResolverFromEnv({} as unknown as NodeJS.ProcessEnv)(req("198.51.100.3", { "x-real-ip": "1.1.1.1" })).basis).toBe("SOCKET_PEER");
  });
});

describe("guard integration", () => {
  function response() {
    const state = { status: 0 };
    return { state, res: { setHeader: vi.fn(), writeHead: vi.fn((c: number) => { state.status = c; }), end: vi.fn() } };
  }
  it("behind one proxy peer, a flooding client does not rate-limit a second client (railway mode)", () => {
    const resolve = createClientIdentityResolver({ mode: "railway" });
    const call = (ip: string) => {
      const { state, res } = response();
      const ok = applyApiGuards({ method: "GET", headers: { "x-real-ip": ip }, socket: { remoteAddress: "10.9.9.9" } } as never, res as never, [], resolve);
      return ok ? 200 : state.status;
    };
    const flood = Array.from({ length: 95 }, () => call("203.0.113.50"));
    expect(flood.filter((c) => c === 429).length).toBe(5);
    expect(call("203.0.113.51")).toBe(200);
  });
  it("in default mode, rotating spoofed headers does not reset the limit", () => {
    const codes = Array.from({ length: 95 }, (_, i) => {
      const { state, res } = response();
      const ok = applyApiGuards({ method: "GET", headers: { "x-forwarded-for": `9.9.9.${i}`, "x-real-ip": `8.8.8.${i}` }, socket: { remoteAddress: "198.51.100.77" } } as never, res as never, []);
      return ok ? 200 : state.status;
    });
    expect(codes.filter((c) => c === 429).length).toBe(5);
  });
});

describe("authenticated internal hop (web BFF -> API)", () => {
  const SECRET = "s".repeat(40);
  const resolve = createClientIdentityResolver({ mode: "railway", internalProxySecret: SECRET });

  it("keys on X-Reality-Client-IP only when the proxy token matches", () => {
    expect(resolve(req("fd12::5", { "x-reality-proxy-token": SECRET, "x-reality-client-ip": "198.51.100.9" }))).toEqual({ key: "client:198.51.100.9", basis: "TRUSTED_HEADER" });
  });

  it("ignores the client-IP header with a wrong, missing or duplicated token and falls back to the edge mode", () => {
    for (const token of ["wrong", undefined, [SECRET, SECRET]] as const) {
      const headers: Record<string, string | string[]> = { "x-reality-client-ip": "198.51.100.9", "x-real-ip": "203.0.113.4" };
      if (token !== undefined) headers["x-reality-proxy-token"] = token as string | string[];
      expect(resolve(req("10.0.0.1", headers))).toEqual({ key: "client:203.0.113.4", basis: "TRUSTED_HEADER" });
    }
  });

  it("a valid token without a usable client address shares one internal bucket", () => {
    expect(resolve(req("fd12::5", { "x-reality-proxy-token": SECRET, "x-reality-client-ip": "nonsense" })).basis).toBe("UNATTRIBUTED");
  });

  it("refuses short secrets and reads INTERNAL_PROXY_SECRET from env", () => {
    expect(() => createClientIdentityResolver({ mode: "none", internalProxySecret: "short" })).toThrow(ClientIdentityConfigError);
    const fromEnv = clientIdentityResolverFromEnv({ TRUST_PROXY: "none", INTERNAL_PROXY_SECRET: SECRET } as unknown as NodeJS.ProcessEnv);
    expect(fromEnv(req("10.0.0.1", { "x-reality-proxy-token": SECRET, "x-reality-client-ip": "198.51.100.9" })).key).toBe("client:198.51.100.9");
  });
});
