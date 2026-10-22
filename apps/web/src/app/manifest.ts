import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Reality", short_name: "Reality", lang: "vi", start_url: "/", display: "standalone", background_color: "#071C2C", theme_color: "#071C2C", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] };
}
