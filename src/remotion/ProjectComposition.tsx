import { useState } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from "remotion";
import type { CaptionClip, Project, TextClip, VideoClip } from "../project/types";

// Convierte rutas relativas (/media/x.mp4) en absolutas para el render en el servidor.
// `preview` = true en el Player de la app: usa proxies livianos para reproducir fluido.
export type CompositionProps = { project: Project; mediaBaseUrl?: string; preview?: boolean };

const resolveSrc = (src: string, base?: string) =>
  base && src.startsWith("/") ? base.replace(/\/$/, "") + src : src;

const VideoLayer: React.FC<{ clip: VideoClip; base?: string; preview?: boolean }> = ({ clip, base, preview }) => {
  // En la vista previa: si el proxy falla se usa el original; si también falla, se avisa en pantalla.
  // En la exportación no hay onError, así un archivo faltante detiene el render con un error claro.
  const [useOriginal, setUseOriginal] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = preview && clip.proxySrc && !useOriginal ? clip.proxySrc : clip.src;

  if (failed) {
    return (
      <AbsoluteFill style={{ background: "#2a1212", alignItems: "center", justifyContent: "center", padding: 60 }}>
        <div style={{ color: "#ffb4b4", fontSize: 44, fontFamily: "sans-serif", textAlign: "center", lineHeight: 1.3 }}>
          ⚠ No se puede reproducir
          <br />
          <b>{clip.name}</b>
          <br />
          <span style={{ fontSize: 34 }}>Vuelve a importar el video y reemplaza este clip.</span>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <OffthreadVideo
      key={src}
      src={resolveSrc(src, base)}
      startFrom={clip.trimStart}
      volume={clip.volume}
      pauseWhenBuffering
      acceptableTimeShiftInSeconds={0.3}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={
        preview
          ? () => {
              if (src === clip.proxySrc) setUseOriginal(true);
              else setFailed(true);
            }
          : undefined
      }
    />
  );
};

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

export const ProjectComposition: React.FC<CompositionProps> = ({ project, mediaBaseUrl, preview }) => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    {project.tracks.map((track) =>
      track.clips.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.from}
          durationInFrames={clip.durationInFrames}
          // Carga el video 1 s antes de que aparezca para que el corte no se trabe
          premountFor={clip.kind === "video" ? project.fps : undefined}
        >
          {clip.kind === "video" ? (
            // key: al reconectar el archivo se reinicia el estado de error
            <VideoLayer key={`${clip.src}|${clip.proxySrc}`} clip={clip} base={mediaBaseUrl} preview={preview} />
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
