import { Composition } from "remotion";
import { Promo } from "./Promo";
import "./theme";

// 1920x1080, 60 fps. Duration comes from src/data/timeline.json (built from the narration).
import timeline from "./data/timeline.json";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="EnglishBoostPromo"
      component={Promo}
      durationInFrames={timeline.durationInFrames}
      fps={60}
      width={1920}
      height={1080}
    />
  );
};
