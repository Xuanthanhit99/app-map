export type MapProviderStatus = "READY" | "UNCONFIGURED";

export interface MapProviderConfig {
  status: MapProviderStatus;
  styleUrl?: string;
  attribution?: string;
}

export function resolveMapProviderConfig(): MapProviderConfig {
  const styleUrl = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();
  const attribution = process.env.EXPO_PUBLIC_MAP_ATTRIBUTION?.trim();

  if (!styleUrl) return { status: "UNCONFIGURED" };

  return {
    status: "READY",
    styleUrl,
    ...(attribution ? { attribution } : {}),
  };
}
