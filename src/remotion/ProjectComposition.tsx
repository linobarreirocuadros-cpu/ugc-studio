import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from "remotion";
import type { CaptionClip, Project, TextClip, VideoClip } from "../project/types";

// Convierte rutas relativas (/media/x.mp4) en absolutas para el render en el servidor.
export type CompositionProps = { project: Project; mediaBaseUrl?: string };

const resolveSrc = (src: string, base?: string) =>
  base && src.startsWith("/") ? base.replace(/\/$/, "") + src : src;

const VideoLayer: React.FC<{ clip: VideoClip; base?: string }> = ({ clip, base }) => (
  <OffthreadVideo
    src={resolveSrc(clip.src, base)}
    startFrom={clip.trimStart}
    volume={clip.volume}
    style={{ width: "100%", height: "100%", objectFit: "cover" }}
  />
);

const TextLayer: React.FC<{ clip: TextClip }> = ({ clip }) => {
  const s = clip.style;
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${s.y * 100}%`,
          transform: "translateY(-50%)",
          maxWidth: "85%",
          textAlign: "center",
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: 800,
          lineHeight: 1.15,
          color: s.color,
          background: s.background ?? undefined,
          padding: s.background ? "0.2em 0.45em" : 0,
          borderRadius: 16,
        }}
      >
        {clip.text}
      </div>
    </AbsoluteFill>
  );
};

const STROKE = "0 0 2px #000, 0 0 2px #000, 3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000";

const CaptionLayer: React.FC<{ clip: CaptionClip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const s = clip.style;
  const activeIndex = clip.words.findIndex((w) => frame >= w.start && frame < w.end);
  // Pequeño "pop" al aparecer el bloque
  const pop = interpolate(frame, [0, 4], [0.85, 1], { extrapolateRight: "clamp" });
  const words =
    s.preset === "palabra"
      ? clip.words.filter((w, i) => i === activeIndex || (activeIndex === -1 && frame >= w.start)).slice(-1)
      : clip.words;

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: `${s.y * 100}%`,
          transform: `translateY(-50%) scale(${pop})`,
          maxWidth: "88%",
          textAlign: "center",
          fontFamily: s.fontFamily,
          fontSize: s.preset === "palabra" ? s.fontSize * 1.25 : s.fontSize,
          fontWeight: 900,
          lineHeight: 1.1,
          color: s.color,
          textTransform: s.uppercase ? "uppercase" : "none",
          textShadow: s.stroke ? STROKE : undefined,
          background: s.preset === "bloque" ? s.background ?? "rgba(0,0,0,0.6)" : s.background ?? undefined,
          padding: s.preset === "bloque" || s.background ? "0.15em 0.4em" : 0,
          borderRadius: 14,
        }}
      >
        {words.map((w, i) => {
          const active = s.preset === "karaoke" && clip.words.indexOf(w) === activeIndex;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: "0 0.18em",
                color: active ? s.highlightColor : undefined,
                transform: active ? "scale(1.08)" : undefined,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const ProjectComposition: React.FC<CompositionProps> = ({ project, mediaBaseUrl }) => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    {project.tracks.map((track) =>
      track.clips.map((clip) => (
        <Sequence key={clip.id} from={clip.from} durationInFrames={clip.durationInFrames}>
          {clip.kind === "video" ? (
            <VideoLayer clip={clip} base={mediaBaseUrl} />
          ) : clip.kind === "text" ? (
            <TextLayer clip={clip} />
          ) : (
            <CaptionLayer clip={clip} />
          )}
        </Sequence>
      )),
    )}
  </AbsoluteFill>
);
