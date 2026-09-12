import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gurukul FC Dashboard",
    short_name: "Gurukul FC",
    description: "Gurukul Football Academy staff dashboard",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B1F4B",
    theme_color: "#0B1F4B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
