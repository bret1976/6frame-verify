import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function ipToLong(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function isPrivateOrReservedIPv4(ip: string): boolean {
  const n = ipToLong(ip);
  if (n === null) return true;
  // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10, 224+/4
  if ((n & 0xff000000) === 0x00000000) return true;
  if ((n & 0xff000000) === 0x0a000000) return true;
  if ((n & 0xff000000) === 0x7f000000) return true;
  if ((n & 0xffff0000) === 0xa9fe0000) return true;
  if ((n & 0xfff00000) === 0xac100000) return true;
  if ((n & 0xffff0000) === 0xc0a80000) return true;
  if ((n & 0xffc00000) === 0x64400000) return true;
  if ((n & 0xf0000000) === 0xe0000000) return true;
  if (n === 0xffffffff) return true;
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;
  // IPv4-mapped
  if (normalized.includes(".")) {
    const mapped = normalized.split(":").pop()!;
    return isPrivateOrReservedIPv4(mapped);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateOrReservedIPv4(ip);
  if (family === 6) return isPrivateOrReservedIPv6(ip);
  return true;
}

export type UrlSafetyResult =
  | { ok: true; url: URL; addresses: string[] }
  | { ok: false; code: string; message: string };

export async function assertSafePublicHttpsUrl(
  raw: string,
): Promise<UrlSafetyResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: "invalid_url", message: "URL is not parseable" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, code: "https_required", message: "Only HTTPS URLs are allowed" };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: "credentials_forbidden",
      message: "Credentialed URLs are not allowed",
    };
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, code: "blocked_host", message: `Host ${host} is blocked` };
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) {
      return { ok: false, code: "private_ip", message: "Private/reserved IPs are blocked" };
    }
    return { ok: true, url, addresses: [host] };
  }
  let records: string[];
  try {
    const looked = await dns.lookup(host, { all: true, verbatim: true });
    records = looked.map((r) => r.address);
  } catch {
    return { ok: false, code: "dns_failed", message: `DNS lookup failed for ${host}` };
  }
  if (records.length === 0) {
    return { ok: false, code: "dns_empty", message: `No DNS records for ${host}` };
  }
  for (const addr of records) {
    if (isBlockedIp(addr)) {
      return {
        ok: false,
        code: "private_ip",
        message: `Resolved address ${addr} is private/reserved`,
      };
    }
  }
  return { ok: true, url, addresses: records };
}
