import narration from "./data/narration.json";
import timeline from "./data/timeline.json";

export type SceneId = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8";
export const TL = timeline;
export const scene = (id: SceneId) => {
  const s = timeline.scenes.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};

const clip = (key: string) => {
  const c = narration.clips.find((x) => x.key === key);
  if (!c) throw new Error(key);
  return c;
};

const norm = (w: string) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Scene time (s) when the narration of `key` says `word` (nth occurrence), so text lands with the voice.
export const say = (id: SceneId, key: string, word: string, nth = 0): number => {
  const a = scene(id).audio.find((x) => x.key === key);
  if (!a) throw new Error(`${key} not in ${id}`);
  const hits = clip(key).words.filter((w) => norm(w.w) === norm(word));
  const w = hits[nth];
  if (!w) throw new Error(`"${word}" not in ${key}`);
  return a.at + w.start;
};

// Scene time when a clip (narration or learner audio) starts / its speech ends.
export const audioAt = (id: SceneId, key: string) => {
  const a = scene(id).audio.find((x) => x.key === key);
  if (!a) throw new Error(`${key} not in ${id}`);
  return a.at;
};
export const speechEnd = (id: SceneId, key: string) => {
  const c = clip(key);
  return audioAt(id, key) + c.words[c.words.length - 1].end;
};

// All narration intervals in absolute seconds (for ducking the music).
export const voiceSpans = (): [number, number][] =>
  timeline.scenes.flatMap((s) =>
    s.audio.map((a) => {
      const c = narration.clips.find((x) => x.key === a.key);
      const len = c ? c.words[c.words.length - 1].end : 4.6; // learner clip ~4.6 s
      return [s.start + a.at, s.start + a.at + len] as [number, number];
    }),
  );
