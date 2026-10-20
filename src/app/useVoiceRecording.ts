import { useEffect, useRef, useState } from "react";

export type RecordedVoice = { src: string; name: string; durationSeconds: number; kind: "audio"; hasAudio: true };
type Session = { cancelled: boolean; stream?: MediaStream; recorder?: MediaRecorder; abort: AbortController; chunks: Blob[]; timer?: ReturnType<typeof setInterval> };

/** Captura local iniciada únicamente por el botón de micrófono. No escucha fuera de la toma. */
export function useVoiceRecording(onComplete: (voice: RecordedVoice, track: string, frame: number, fps: number) => boolean, onStart: () => void) {
  const current = useRef<Session | null>(null);
  const complete = useRef(onComplete); complete.current = onComplete;
  const [state, setState] = useState<{ track: string; phase: "permission" | "recording" | "saving"; seconds: number } | null>(null);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<string | null>(null);
  useEffect(() => () => { if (recovery) URL.revokeObjectURL(recovery); }, [recovery]);
  const release = (session: Session) => { clearInterval(session.timer); session.stream?.getTracks().forEach((t) => t.stop()); };
  const cancel = () => {
    const session = current.current;
    if (session) {
      session.cancelled = true; session.abort.abort();
      if (session.recorder?.state === "recording") session.recorder.stop();
      release(session); current.current = null;
    }
    setState(null);
  };
  useEffect(() => () => {
    const session = current.current;
    if (session) { session.cancelled = true; session.abort.abort(); if (session.recorder?.state === "recording") session.recorder.stop(); release(session); }
  }, []);
  const stop = () => { const recorder = current.current?.recorder; if (recorder?.state === "recording") recorder.stop(); };
  const start = async (track: string, frame: number, fps: number) => {
    if (current.current) return;
    setError(""); setRecovery(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Este navegador no permite grabar. Abre el editor en Chrome o Edge y permite el micrófono."); return; }
    const session: Session = { cancelled: false, abort: new AbortController(), chunks: [] };
    current.current = session; setState({ track, phase: "permission", seconds: 0 });
    try {
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (session.cancelled) { release(session); return; }
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("No hay un formato de grabación compatible. Prueba Chrome o Edge.");
      const recorder = new MediaRecorder(session.stream, { mimeType }); session.recorder = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onerror = () => { setError("Falló el micrófono. Comprueba que siga conectado y vuelve a intentarlo."); cancel(); };
      recorder.onstop = () => {
        release(session);
        if (session.cancelled) return;
        const blob = new Blob(session.chunks, { type: mimeType });
        setState((s) => s ? { ...s, phase: "saving" } : s);
        void (async () => {
          try {
            if (!blob.size) throw new Error("La grabación quedó vacía. Comprueba el micrófono.");
            const body = new FormData();
            const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
            body.append("file", blob, `Grabacion.${extension}`);
            const response = await fetch("/api/record-voice", { method: "POST", body, signal: session.abort.signal });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la grabación.");
            if (!session.cancelled && !complete.current(result, track, frame, fps)) setError("Grabación guardada en Proyecto. La pista cambió o está bloqueada: arrastra el archivo cuando quieras.");
          } catch (failure) {
            if (!session.cancelled) {
              setError(failure instanceof Error ? failure.message : "No se pudo guardar la grabación.");
              if (blob.size) setRecovery(URL.createObjectURL(blob));
            }
          } finally { if (current.current === session) { current.current = null; setState(null); } }
        })();
      };
      onStart(); recorder.start(1000);
      const started = performance.now();
      setState({ track, phase: "recording", seconds: 0 });
      session.timer = setInterval(() => {
        const seconds = Math.floor((performance.now() - started) / 1000);
        setState((s) => s ? { ...s, seconds } : s);
        if (seconds >= 600) stop();
      }, 250);
    } catch (failure) {
      if (!session.cancelled) {
        const name = failure instanceof Error ? failure.name : "";
        setError(name === "NotAllowedError" ? "Micrófono sin permiso. Permítelo en el navegador y vuelve a pulsar Grabar voz." : name === "NotFoundError" ? "No se encontró un micrófono conectado." : failure instanceof Error ? failure.message : "No se pudo abrir el micrófono.");
        cancel();
      }
    }
  };
  return { state, error, recovery, start, stop, cancel };
}
