export type MapProviderStatus = "READY" | "UNCONFIGURED";
export type MapProviderKind = "MAPTILER" | "CUSTOM";

export interface MapProviderConfig {
  status: MapProviderStatus;
  provider?: MapProviderKind;
  styleUrl?: string;
  attribution?: string;
}

export function resolveMapProviderConfig(): MapProviderConfig {
  const customStyleUrl = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();
  const mapTilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY?.trim();
  const mapTilerStyle = process.env.EXPO_PUBLIC_MAPTILER_STYLE?.trim() || "streets-v4";

  if (customStyleUrl) {
    return {
      status: "READY",
      provider: "CUSTOM",
      styleUrl: customStyleUrl,
      ...(process.env.EXPO_PUBLIC_MAP_ATTRIBUTION?.trim()
        ? { attribution: process.env.EXPO_PUBLIC_MAP_ATTRIBUTION.trim() }
        : {}),
    };
  }

  if (mapTilerKey) {
    return {
      status: "READY",
      provider: "MAPTILER",
      styleUrl: `https://api.maptiler.com/maps/${encodeURIComponent(mapTilerStyle)}/style.json?key=${encodeURIComponent(mapTilerKey)}`,
      attribution: "© MapTiler © OpenStreetMap contributors",
    };
  }

  return { status: "UNCONFIGURED" };
}
