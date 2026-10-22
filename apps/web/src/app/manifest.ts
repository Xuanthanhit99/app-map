import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Reality", short_name: "Reality", lang: "vi", start_url: "/", display: "standalone", background_color: "#F7F8F6", theme_color: "#073B3A", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] };
}
