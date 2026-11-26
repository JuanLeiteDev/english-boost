import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";

// A short UI sound at scene time `at` (seconds).
export const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 0.5 }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.max(0, Math.round(at * fps))} durationInFrames={Math.round(1.5 * fps)} name={`SFX ${name}`} layout="none">
      <Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
};
