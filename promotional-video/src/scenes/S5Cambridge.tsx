import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Scrim } from "../components/Background";
import { Words } from "../components/Kinetic";
import { at, fit, Focus, mark, Rec, Recording, Screen } from "../components/Screen";
import { Sfx } from "../components/Sfx";
import { clamp } from "../theme";
import { say, scene } from "../timing";
import data from "../../public/recordings/cambridge.json";
import tabData from "../../public/recordings/cambridge-tab.json";
import { Browser } from "../components/Browser";

const rec = data as Rec;
const tabRec = tabData as Rec;

export const S5Cambridge: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const len = scene("s5").duration;
  const send1 = mark(rec, "send-1");
  const pill = mark(rec, "pill");
  const send2 = mark(rec, "send-2");
  const reply2 = mark(rec, "reply-2");
  const tProva = say("s5", "s5", "prova");
  const tChat = say("s5", "s5", "respondo");
  const tKey = say("s5", "s5", "gabarito");
  // A: ask for the listening and click the direct link; TAB: the real Cambridge test opens in a new
  // tab (recorded from the official site, audio blocked); B: answers typed and sent; C: the grading.
  const winAt = tProva - 0.55;
  const until = tChat + 0.35;
  const hover = mark(tabRec, "hover-option-a");
  const a = fit(0, send1.t - 0.9, pill.t + 0.25, winAt + 0.05);
  const tab = fit(winAt, 0.55, Math.min(tabRec.duration, hover.t + 0.9), until + 0.45 - winAt);
  const b = fit(until - 0.1, send2.t - 1.4, send2.t + 0.25, 1.1);
  const cStart = until + 1.0;
  const c = fit(cStart, send2.t + 0.25, Math.min(rec.duration, reply2.t + 2.2), len - cStart);
  const chatX = 1650;
  return (
    <AbsoluteFill>
      <Background glow={0.2} />
      <Screen keys={[
        { t: 0, x: 1280, y: 540, z: 0.9 },
        { t: 0.1, x: 1180, y: 600, z: 1.12, d: 1.4 },
        { t: until - 0.1, x: chatX - 260, y: 780, z: 1.35, d: 0.01 },
        { t: cStart, x: (reply2.x ?? chatX) - 380, y: (reply2.y ?? 600) + 40, z: 1.5, d: 1.0 },
      ]}>
        <Recording name="cambridge" rec={rec} segs={[a, b, c]} />
        {reply2.box ? <Focus box={reply2.box} at={Math.max(at(c, reply2.t), tKey - 0.1)} pad={8} /> : null}
      </Screen>
      <AbsoluteFill style={{ background: "rgba(9,10,8,0.55)", opacity: interpolate(frame, [winAt * fps, (winAt + 0.4) * fps, until * fps, (until + 0.4) * fps], [0, 1, 1, 0], clamp) }} />
      <Browser at={winAt} until={until} from={[1560, 820]} url="ceq.inspera.com/player/?assessmentRunId=539335544" tab="Cambridge English · B1 Listening">
        <Recording name="cambridge-tab" rec={tabRec} segs={[tab]} />
      </Browser>
      <Scrim at={until} />
      <Words text="Corrigido com o gabarito oficial." at={tKey} size={58} accent={["oficial"]}
        style={{ position: "absolute", left: 150, bottom: 110, width: 900 }} />
      <Sfx at={at(a, send1.t)} name="click" volume={0.4} />
      <Sfx at={at(a, pill.t)} name="pop" volume={0.4} />
      <Sfx at={winAt - 0.05} name="whoosh" volume={0.24} />
      <Sfx at={at(tab, mark(tabRec, "start").t)} name="click" volume={0.32} />
      <Sfx at={at(b, send2.t)} name="click" volume={0.4} />
      <Sfx at={Math.max(at(c, reply2.t), tKey - 0.1)} name="success" volume={0.22} />
    </AbsoluteFill>
  );
};
