import React from "react";
import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { S1Need } from "./scenes/S1Need";
import { S2Build } from "./scenes/S2Build";
import { S3Research } from "./scenes/S3Research";
import { S4Daily } from "./scenes/S4Daily";
import { S5Cambridge } from "./scenes/S5Cambridge";
import { S6Speaking } from "./scenes/S6Speaking";
import { S7Progress } from "./scenes/S7Progress";
import { S8Goal } from "./scenes/S8Goal";
import { C, clamp } from "./theme";
import { scene, TL, voiceSpans } from "./timing";

// Soft light sweep on top of each cut (does not shorten the timeline, so the narration stays in sync).
const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, durationInFrames / 2, durationInFrames], [0, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(70% 60% at 50% 50%, rgba(255,107,44,${0.10 * p}), transparent 70%)`, backdropFilter: `blur(${p * 6}px)` }} />
  );
};

// Music under the voice: full between lines, ducked while someone speaks.
const Music: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const ramp = 0.3;
  let duck = 0;
  for (const [a, b] of voiceSpans()) {
    duck = Math.max(duck, interpolate(t, [a - ramp, a, b, b + ramp], [0, 1, 1, 0], clamp));
  }
  const fadeOut = interpolate(t, [TL.duration - 1.2, TL.duration], [1, 0], clamp);
  return <Audio src={staticFile("audio/music.wav")} volume={(0.62 - 0.44 * duck) * fadeOut} name="Music" />;
};

export const HAS_MUSIC = true;

const Soundtrack: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      {TL.scenes.flatMap((s) =>
        s.audio.map((a) => (
          <Sequence key={`${s.id}-${a.key}`} from={Math.round((s.start + a.at) * fps)} name={`Voice ${a.key}`} layout="none">
            <Audio src={staticFile(a.file)} volume={a.key === "learner" ? 0.95 : 1} />
          </Sequence>
        )),
      )}
      {HAS_MUSIC ? <Music /> : null}
    </>
  );
};

const CUT = 22;

export const Promo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence name="1 Necessidade" durationInFrames={scene("s1").durationInFrames}><S1Need /></TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={CUT}><Cut /></TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="2 Iniciativa" durationInFrames={scene("s2").durationInFrames}><S2Build /></TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={CUT}><Cut /></TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="3 Fundamentação" durationInFrames={scene("s3").durationInFrames}><S3Research /></TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={CUT}><Cut /></TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="4 Plano diário" durationInFrames={scene("s4").durationInFrames}><S4Daily /></TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={CUT}><Cut /></TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="5 Listening Cambridge" durationInFrames={scene("s5").durationInFrames}><S5Cambridge /></TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={CUT}><Cut /></TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="6 Speaking" durationInFrames={scene("s6").durationInFrames}><S6Speaking /></TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={CUT}><Cut /></TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="7 Progresso" durationInFrames={scene("s7").durationInFrames}><S7Progress /></TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={CUT}><Cut /></TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="8 Objetivo" durationInFrames={scene("s8").durationInFrames}><S8Goal /></TransitionSeries.Sequence>
      </TransitionSeries>
      <Soundtrack />
    </AbsoluteFill>
  );
};
