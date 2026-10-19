import { AbsoluteFill, OffthreadVideo, Sequence } from "remotion";
import type { Project, TextClip, VideoClip } from "../project/types";

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

export const ProjectComposition: React.FC<CompositionProps> = ({ project, mediaBaseUrl }) => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    {project.tracks.map((track) =>
      track.clips.map((clip) => (
        <Sequence key={clip.id} from={clip.from} durationInFrames={clip.durationInFrames}>
          {clip.kind === "video" ? (
            <VideoLayer clip={clip} base={mediaBaseUrl} />
          ) : (
            <TextLayer clip={clip} />
          )}
        </Sequence>
      )),
    )}
  </AbsoluteFill>
);
