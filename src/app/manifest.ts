import type { MetadataRoute } from "next";

// Lets people add Golden Hour to their home screen like an app, and come back to their case (saved on the phone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golden Hour — help after a crypto scam",
    short_name: "Golden Hour",
    description: "Trace stolen crypto to the exchange that can freeze it, write the police report and freeze letters, and check suspicious messages.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#160c1c",
    theme_color: "#160c1c",
    lang: "en",
    categories: ["utilities", "finance"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Is this a scam?", url: "/check", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Help in simple words", url: "/help", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
