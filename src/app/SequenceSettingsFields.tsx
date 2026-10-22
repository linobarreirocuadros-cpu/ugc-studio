import {
  CANVAS_PRESETS,
  FRAME_RATES,
  type SequenceSettings,
} from "../project/sequenceSettings";
export function SequenceSettingsFields({
  value,
  onChange,
}: {
  value: SequenceSettings;
  onChange: (s: SequenceSettings) => void;
}) {
  const update = (s: Partial<SequenceSettings>) => onChange({ ...value, ...s });
  return (
    <div className="sequence-settings-fields">
      <label>
        Formato del lienzo
        <select
          aria-label="Formato del lienzo"
          value={CANVAS_PRESETS.findIndex(
            (p) => p.width === value.width && p.height === value.height,
          )}
          onChange={(e) => {
            const p = CANVAS_PRESETS[Number(e.target.value)];
            if (p) update({ width: p.width, height: p.height });
          }}
        >
          <option value={-1}>Personalizado</option>
          {CANVAS_PRESETS.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name} · {p.width} × {p.height}
            </option>
          ))}
        </select>
      </label>
      <div className="sequence-settings-row">
        <label>
          Ancho (px)
          <input
            aria-label="Ancho del lienzo"
            type="number"
            min={16}
            max={8192}
            step={2}
            value={value.width}
            onChange={(e) => update({ width: Number(e.target.value) })}
          />
        </label>
        <label>
          Alto (px)
          <input
            aria-label="Alto del lienzo"
            type="number"
            min={16}
            max={8192}
            step={2}
            value={value.height}
            onChange={(e) => update({ height: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="sequence-settings-row">
        <label>
          Fotogramas por segundo
          <select
            aria-label="FPS de la secuencia"
            value={
              FRAME_RATES.some((f) => Math.abs(f - value.fps) < 0.0001)
                ? FRAME_RATES.find((f) => Math.abs(f - value.fps) < 0.0001)
                : "custom"
            }
            onChange={(e) => {
              if (e.target.value !== "custom")
                update({ fps: Number(e.target.value) });
            }}
          >
            {FRAME_RATES.map((f) => (
              <option key={f} value={f}>
                {Number(f.toFixed(3))} fps
              </option>
            ))}
            <option value="custom">Personalizado</option>
          </select>
        </label>
        <label>
          FPS personalizado
          <input
            aria-label="FPS personalizado"
            type="number"
            min={1}
            max={120}
            step={0.001}
            value={Number(value.fps.toFixed(6))}
            onChange={(e) => update({ fps: Number(e.target.value) })}
          />
        </label>
      </div>
      <label>
        Audio de la secuencia
        <select
          aria-label="Frecuencia de audio de secuencia"
          value={value.audioSampleRate ?? 48000}
          onChange={(e) => update({ audioSampleRate: Number(e.target.value) })}
        >
          {[44100, 48000, 96000].map((n) => (
            <option key={n} value={n}>
              {n} Hz · estéreo
            </option>
          ))}
        </select>
      </label>
      <small>
        Píxel cuadrado · progresivo · SDR Rec.709. La resolución de
        previsualización es independiente.
      </small>
    </div>
  );
}
