// Render test frames for visual checks with one bundle (much faster than one CLI call per frame).
// Usage: node scripts/stills.mjs <outDir> <frame,frame,...> [scale]
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const [outDir, list, scale = "0.5"] = process.argv.slice(2);
const frames = list.split(",").map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: "EnglishBoostPromo" });
for (const frame of frames) {
  const output = path.join(outDir, `f${String(frame).padStart(5, "0")}.jpeg`);
  await renderStill({ serveUrl, composition, frame, output, imageFormat: "jpeg", jpegQuality: 85, scale: Number(scale) });
  console.log(output);
}
