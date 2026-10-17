import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Link",
    short_name: "Link",
    description: "Tell Link what you want out of life. It figures out how your money gets you there.",
    start_url: "/home",
    display: "standalone",
    background_color: "#f9f8f5",
    theme_color: "#f9f8f5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
