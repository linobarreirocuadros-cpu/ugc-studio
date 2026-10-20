import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ProgramMeter, formatDb, meterPercent } from "./programMeter";

export function AudioMeter({ programRef }: { programRef: RefObject<HTMLDivElement | null> }) {
  const [levels, setLevels] = useState([-Infinity, -Infinity]);
  const [peaks, setPeaks] = useState([-Infinity, -Infinity]);
  const [clipped, setClipped] = useState([false, false]);
  const [status, setStatus] = useState("Reproduce el Programa");
  const reset = useRef(false);
  const meterRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 80, height: 200 });
  useLayoutEffect(() => {
    const element = meterRef.current; if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const horizontal = size.width >= 240 && size.width > size.height * 1.5;
  const ticks = (horizontal ? size.width > 400 : size.height > 280) ? [0, -6, -12, -18, -24, -36, -48, -60] : (horizontal || size.height > 180) ? [0, -12, -24, -48, -60] : size.height > 130 ? [0, -24, -60] : [0, -60];
  useEffect(() => {
    let meter: ProgramMeter | null = null, failed = false, animation = 0, last = 0;
    let held = [-Infinity, -Infinity], clip = [false, false], displayed = [-Infinity, -Infinity];
    const activate = () => {
      if (failed) return;
      try { meter ??= new ProgramMeter(); void meter.resume().catch(() => setStatus("Pulsa reproducir para activar")); }
      catch (error) { failed = true; setStatus(error instanceof Error ? error.message : "Medidor no disponible"); }
    };
    const tick = (now: number) => {
      if (now - last >= 33) {
        const seconds = Math.min(0.25, (now - last) / 1000); last = now;
        if (reset.current) { held = [-Infinity, -Infinity]; clip = [false, false]; reset.current = false; }
        if (meter && !failed && programRef.current) {
          try {
            meter.sync(programRef.current);
            const playing = programRef.current.dataset.programMuted !== "true" && [...programRef.current.querySelectorAll<HTMLMediaElement>("audio,video")].some((element) => !element.paused && !element.ended && !element.muted && element.volume > 0 && !element.seeking);
            const values = meter.running && playing ? meter.read() : [-Infinity, -Infinity];
            displayed = values.map((value, i) => playing ? Math.max(value, displayed[i] - 28 * seconds) : -Infinity);
            held = values.map((value, i) => Math.max(held[i], value)); clip = values.map((value, i) => clip[i] || value >= 0);
            setLevels(displayed); setStatus(meter.running ? (playing ? "Programa" : "En pausa / silencio") : "Pulsa reproducir para activar");
          } catch (error) { failed = true; meter.close(); meter = null; setLevels([-Infinity, -Infinity]); setStatus(error instanceof Error ? error.message : "Medidor no disponible"); }
        }
        setPeaks([...held]); setClipped([...clip]);
      }
      animation = requestAnimationFrame(tick);
    };
    document.addEventListener("pointerdown", activate, true); document.addEventListener("keydown", activate, true);
    animation = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animation); document.removeEventListener("pointerdown", activate, true); document.removeEventListener("keydown", activate, true); meter?.close(); };
  }, [programRef]);
  return <aside ref={meterRef} className={`audio-meter ${horizontal ? "horizontal" : "vertical"}`} aria-label="Medidor estéreo del Programa" title={`Pico de muestras dBFS del Programa. ${status}. No mide LUFS, true peak ni el volumen físico de tus altavoces.`}>
    <div className="meter-top">{["L", "R"].map((name, i) => <button key={name} aria-label={`Reiniciar pico ${name}`} className={clipped[i] ? "clipped" : ""} onClick={() => { reset.current = true; }} title="Reiniciar picos y aviso de saturación">{name}</button>)}</div>
    <div className="meter-body"><div className="meter-scale">{ticks.map((db) => <span key={db} style={horizontal ? { left: `${meterPercent(db)}%` } : { bottom: `${meterPercent(db)}%` }}>{db}</span>)}</div>
      {levels.map((db, index) => <div key={index} className="meter-channel" role="meter" aria-label={`Nivel ${index === 0 ? "L" : "R"}`} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, Math.min(0, Number.isFinite(db) ? db : -60))} aria-valuetext={`${formatDb(db)} dBFS`}>
        <div className="meter-fill" style={{ clipPath: horizontal ? `inset(0 ${100 - meterPercent(db)}% 0 0)` : `inset(${100 - meterPercent(db)}% 0 0 0)` }} />
        {Number.isFinite(peaks[index]) && <div className="meter-peak" style={horizontal ? { left: `${Math.min(99, meterPercent(peaks[index]))}%` } : { bottom: `${Math.min(99, meterPercent(peaks[index]))}%` }} />}
      </div>)}
    </div>
    <div className="meter-values">{levels.map((db, index) => <span key={index}>{formatDb(db)}</span>)}</div>
    <button className="meter-reset" onClick={() => { reset.current = true; }} title={`Picos L ${formatDb(peaks[0])} / R ${formatDb(peaks[1])} dBFS`}>Picos</button>
    <small>{status}</small>
  </aside>;
}
