import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

// The app's own identity (app/static/style.css, dark theme): same fonts, colours and marks.
export const C = {
  bg: "#0d0e0c",
  raised: "#141512",
  sunken: "#090a08",
  fg: "#ece9e1",
  muted: "#a6a398",
  subtle: "#8d8b81",
  line: "#262723",
  lineStrong: "#3a3b36",
  signal: "#ff6b2c",
  good: "#5cc489",
  bad: "#ff7a6b",
  grid: "rgba(236,233,225,0.05)",
};

export const FONT = "Schibsted Grotesk";
export const MONO = "JetBrains Mono";

export const fontsReady = Promise.all([
  loadFont({ family: FONT, url: staticFile("fonts/schibsted-grotesk-latin-wght-normal.woff2"), weight: "400 900" }),
  loadFont({ family: MONO, url: staticFile("fonts/jetbrains-mono-latin-wght-normal.woff2"), weight: "100 800" }),
]);

// Motion language: calm ease-out for entrances, smooth in-out for camera moves.
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IO = Easing.bezier(0.7, 0, 0.2, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
