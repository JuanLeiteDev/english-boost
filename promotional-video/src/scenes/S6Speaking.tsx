import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Scrim } from "../components/Background";
import { Eyebrow, Words } from "../components/Kinetic";
import { at, fit, Focus, mark, Rec, Recording, Screen } from "../components/Screen";
import { Sfx } from "../components/Sfx";
import { C, clamp, EASE_IO, EASE_OUT, MONO } from "../theme";
import { audioAt, say, scene } from "../timing";
import data from "../../public/recordings/speaking.json";
import envData from "../data/learner-env.json";

const rec = data as Rec;

// Live waveform driven by the real loudness of the English sentence.
const Wave: React.FC<{ startAt: number; inAt: number; outAt: number }> = ({ startAt, inAt, outAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [inAt * fps, (inAt + 0.4) * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  const q = interpolate(frame, [outAt * fps, (outAt + 0.4) * fps], [0, 1], { ...clamp, easing: EASE_IO });
  const i0 = Math.round(frame - startAt * fps);
  const bars = 36;
  return (
    <div style={{
      position: "absolute", left: 150, top: 560, width: 760, opacity: p * (1 - q), translate: `0 ${(1 - p) * 24}px`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, height: 230 }}>
        {Array.from({ length: bars }, (_, i) => {
          const k = i0 - (bars - 1 - i) * 2;
          const v = k >= 0 && k < envData.env.length ? envData.env[k] : 0;
          return <span key={i} style={{ flex: 1, height: `${6 + v * 94}%`, borderRadius: 6, background: i > bars - 6 ? C.signal : C.fg, opacity: 0.35 + 0.65 * (i / bars) }} />;
        })}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 26, color: C.muted, marginTop: 26, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 14, height: 14, background: C.signal, opacity: 0.5 + 0.5 * Math.abs(Math.sin(frame / 12)) }} />
        a gravar em inglês…
      </div>
    </div>
  );
};

export const S6Speaking: React.FC = () => {
  const len = scene("s6").duration;
  const micOn = mark(rec, "mic-on");
  const micOff = mark(rec, "mic-off");
  const transcript = mark(rec, "transcript");
  const send = mark(rec, "send");
  const correction = mark(rec, "correction");
  const tLearner = audioAt("s6", "learner");
  const tVoz = say("s6", "s6b", "voz");
  const tProf = say("s6", "s6b", "professor");
  // A: press the mic, speak (the learner audio plays here), stop. B: real transcript, send, correction.
  const a = fit(0, micOn.t - (tLearner - 0.25), micOff.t + 0.15, tLearner - 0.25 + (micOff.t + 0.15 - micOn.t));
  const bFrom = a.from + (a.end - a.start) / (a.rate ?? 1);
  const b = fit(bFrom, transcript.t - 0.35, Math.min(rec.duration, correction.t + 2.0), len - bFrom);
  const tCorr = at(b, correction.t);
  return (
    <AbsoluteFill>
      <Background glow={0.24} />
      <Screen keys={[
        { t: 0, x: 1500, y: 640, z: 1.0 },
        { t: 0.1, x: 1460, y: 830, z: 1.4, d: 1.6 },
        { t: bFrom, x: 1460, y: 860, z: 1.45, d: 0.5 },
        { t: tCorr - 0.3, x: (correction.x ?? 1600) - 380, y: (correction.y ?? 600) + 30, z: 1.5, d: 1.0 },
      ]}>
        <Recording name="speaking" rec={rec} segs={[a, b]} />
        {correction.box ? <Focus box={correction.box} at={tCorr + 0.4} pad={8} /> : null}
      </Screen>
      <Scrim at={tLearner - 0.7} />
      <Eyebrow text="Speaking · pela voz" at={tLearner - 0.5} style={{ position: "absolute", left: 150, top: 160 }} />
      <Wave startAt={tLearner} inAt={tLearner - 0.3} outAt={bFrom - 0.2} />
      <div style={{ position: "absolute", left: 150, top: 330, width: 760 }}>
        <Words text="Transcrito no meu computador." at={tVoz} size={68} out={tProf - 0.2} accent={["computador"]} />
      </div>
      <div style={{ position: "absolute", left: 150, top: 330, width: 760 }}>
        <Words text="Corrigido como por um professor." at={tProf} size={68} accent={["professor"]} />
      </div>
      <Sfx at={at(a, micOn.t)} name="rec" volume={0.4} />
      <Sfx at={at(a, micOff.t)} name="click" volume={0.4} />
      <Sfx at={at(b, transcript.t)} name="pop" volume={0.35} />
      <Sfx at={at(b, send.t)} name="click" volume={0.4} />
      <Sfx at={tCorr + 0.4} name="success" volume={0.22} />
    </AbsoluteFill>
  );
};
