import type { IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";

/**
 * Client identity for rate limiting.
 *
 * Trust boundary: forwarded headers are client-controlled unless they were written by a proxy
 * we explicitly trust. Default mode `none` ignores every forwarded header and keys on the socket
 * peer. A proxy mode must be enabled by configuration, and may additionally be pinned to the
 * proxy's network with TRUSTED_PROXY_CIDRS so a request that bypasses the proxy cannot spoof.
 *
 * - none:     key = socket peer. Safe default; behind a proxy every client shares one bucket.
 * - railway:  key = X-Real-IP, which the Railway edge sets to the client's remote IP
 *             (docs.railway.com/networking/public-networking/specs-and-limits). Only valid when the
 *             service is reachable exclusively through the Railway edge (no TCP proxy / direct port).
 * - xff:      key = the address TRUSTED_PROXY_HOPS entries from the right of X-Forwarded-For.
 *             Left-most entries are client-written and are never used.
 *
 * Requests whose trusted header is missing or malformed are not given their own identity: they
 * fall into a single per-peer "unattributed" bucket, so stripping the header cannot evade limits.
 *
 * Internal hop (web BFF → API): when INTERNAL_PROXY_SECRET is configured, a request carrying
 * `X-Reality-Proxy-Token` equal to the secret (constant-time compare) is keyed on its
 * `X-Reality-Client-IP`. This works over the private network and the public edge alike, without
 * pinning provider-specific address ranges. A wrong or missing token falls back to the mode above,
 * so the header pair cannot be forged without the secret.
 */
export type TrustProxyMode = "none" | "railway" | "xff";
export type ClientIdentity = {
  /** Opaque rate-limit key. Never logged; may contain an IP prefix. */
  key: string;
  basis: "SOCKET_PEER" | "TRUSTED_HEADER" | "UNATTRIBUTED";
};
export type ClientIdentityResolver = (request: Pick<IncomingMessage, "headers" | "socket">) => ClientIdentity;

export class ClientIdentityConfigError extends Error {
  constructor(message: string) { super(message); this.name = "ClientIdentityConfigError"; }
}

/** IPv4-mapped IPv6 collapses to IPv4; IPv6 is keyed per /64 so address rotation inside one allocation shares a bucket. */
export function normalizeClientAddress(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value || value.length > 64) return null;
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mapped?.[1]) value = mapped[1];
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  return `${ipv6Prefix64(value)}::/64`;
}

function ipv6Prefix64(address: string): string {
  const [head = "", tail = ""] = address.toLowerCase().split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  // A trailing embedded IPv4 occupies two groups.
  const groupCount = (parts: string[]) => parts.reduce((n, p) => n + (p.includes(".") ? 2 : 1), 0);
  const missing = 8 - groupCount(headParts) - groupCount(tailParts);
  const full = address.includes("::") ? [...headParts, ...Array<string>(Math.max(0, missing)).fill("0"), ...tailParts] : headParts;
  return full.slice(0, 4).map((g) => (g.replace(/^0+(?=.)/, "") || "0")).join(":");
}

function parseCidrs(value: string | undefined): BlockList | null {
  if (!value?.trim()) return null;
  const list = new BlockList();
  for (const entry of value.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [address, prefixText] = entry.split("/");
    const version = isIP(address ?? "");
    const prefix = prefixText === undefined ? (version === 6 ? 128 : 32) : Number(prefixText);
    const max = version === 6 ? 128 : 32;
    if (!version || !Number.isInteger(prefix) || prefix < 0 || prefix > max) {
      throw new ClientIdentityConfigError("INVALID_TRUSTED_PROXY_CIDRS");
    }
    list.addSubnet(address!, prefix, version === 6 ? "ipv6" : "ipv4");
  }
  return list;
}

function peerInList(list: BlockList, peer: string | undefined): boolean {
  if (!peer) return false;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(peer);
  const address = mapped?.[1] ?? peer;
  const version = isIP(address);
  if (!version) return false;
  return list.check(address, version === 6 ? "ipv6" : "ipv4");
}

function singleHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value.length === 1 ? value[0] ?? null : null; // duplicated header = ambiguous
  return typeof value === "string" ? value : null;
}

function tokenMatches(secret: Buffer, presented: string | null): boolean {
  if (!presented) return false;
  const p = Buffer.from(presented);
  return p.length === secret.length && timingSafeEqual(p, secret);
}

export function createClientIdentityResolver(options: {
  mode: TrustProxyMode; hops?: number; trustedProxyCidrs?: string; internalProxySecret?: string;
}): ClientIdentityResolver {
  const hops = options.hops ?? 1;
  if (options.internalProxySecret !== undefined && options.internalProxySecret.length < 32) {
    throw new ClientIdentityConfigError("INTERNAL_PROXY_SECRET_TOO_SHORT");
  }
  const internalSecret = options.internalProxySecret ? Buffer.from(options.internalProxySecret) : null;
  if (options.mode === "xff" && (!Number.isInteger(hops) || hops < 1 || hops > 5)) {
    throw new ClientIdentityConfigError("INVALID_TRUSTED_PROXY_HOPS");
  }
  const trusted = parseCidrs(options.trustedProxyCidrs);
  const peerKey = (peer: string | undefined) => `peer:${normalizeClientAddress(peer) ?? "unknown"}`;
  return (request) => {
    const peer = request.socket?.remoteAddress;
    if (internalSecret && tokenMatches(internalSecret, singleHeader(request.headers["x-reality-proxy-token"]))) {
      const forwarded = normalizeClientAddress(singleHeader(request.headers["x-reality-client-ip"]));
      return forwarded ? { key: `client:${forwarded}`, basis: "TRUSTED_HEADER" } : { key: `unattributed:internal`, basis: "UNATTRIBUTED" };
    }
    if (options.mode === "none") return { key: peerKey(peer), basis: "SOCKET_PEER" };
    const unattributed: ClientIdentity = { key: `unattributed:${normalizeClientAddress(peer) ?? "unknown"}`, basis: "UNATTRIBUTED" };
    // Request did not arrive from the pinned proxy network: its headers are client-written.
    if (trusted && !peerInList(trusted, peer)) return { key: peerKey(peer), basis: "SOCKET_PEER" };
    let candidate: string | null = null;
    if (options.mode === "railway") {
      candidate = singleHeader(request.headers["x-real-ip"]);
    } else {
      const header = singleHeader(request.headers["x-forwarded-for"]);
      const chain = header?.split(",").map((s) => s.trim()) ?? [];
      if (chain.length >= hops && chain.every(Boolean)) candidate = chain[chain.length - hops] ?? null;
    }
    const client = normalizeClientAddress(candidate);
    return client ? { key: `client:${client}`, basis: "TRUSTED_HEADER" } : unattributed;
  };
}

export function clientIdentityResolverFromEnv(env: NodeJS.ProcessEnv = process.env): ClientIdentityResolver {
  const raw = (env.TRUST_PROXY ?? "none").trim().toLowerCase();
  if (raw !== "none" && raw !== "railway" && raw !== "xff") throw new ClientIdentityConfigError("INVALID_TRUST_PROXY");
  const hopsText = env.TRUSTED_PROXY_HOPS?.trim();
  return createClientIdentityResolver({
    mode: raw,
    ...(hopsText ? { hops: Number(hopsText) } : {}),
    ...(env.TRUSTED_PROXY_CIDRS ? { trustedProxyCidrs: env.TRUSTED_PROXY_CIDRS } : {}),
    ...(env.INTERNAL_PROXY_SECRET !== undefined && env.INTERNAL_PROXY_SECRET !== "" ? { internalProxySecret: env.INTERNAL_PROXY_SECRET } : {}),
  });
}
