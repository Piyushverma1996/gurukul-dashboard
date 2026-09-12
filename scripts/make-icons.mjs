// Builds PWA icons (logo centred on navy). Creates a "GFC" placeholder if public/logo.png is missing.
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

await mkdir("public/icons", { recursive: true });

if (!existsSync("public/logo.png")) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="250" fill="#ffffff"/><text x="50%" y="56%" font-family="Arial, sans-serif" font-size="150" font-weight="700" text-anchor="middle" fill="#0B1F4B">GFC</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile("public/logo.png");
  console.log("public/logo.png missing: generated a placeholder");
}

for (const size of [192, 512]) {
  const inner = Math.round(size * 0.72);
  const logo = await sharp("public/logo.png").resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#0B1F4B" } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
console.log("Icons written to public/icons/");
