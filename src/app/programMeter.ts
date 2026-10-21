/** Pico de muestras digitales; no es true peak ni medición de sonoridad LUFS. */
export function samplePeakDb(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

export const meterPercent = (db: number) => Math.max(0, Math.min(100, (db + 60) / 60 * 100));
export const formatDb = (db: number) => Number.isFinite(db) ? db.toFixed(1) : "−∞";

type Capturable = HTMLMediaElement & { captureStream?: () => MediaStream };
type Tap = { stream: MediaStream; gain: GainNode; trackGain:GainNode; source?: MediaStreamAudioSourceNode; trackId?: string; busId?:string; wire: () => void };

/** Copia silenciosa de los elementos del Programa. Nunca modifica ni reconecta su salida audible. */
export class ProgramMeter {
  private context: AudioContext;
  private bus: GainNode;
  private taps = new Map<HTMLMediaElement, Tap>();
  private splitter: ChannelSplitterNode;
  private analysers: AnalyserNode[];
  private tracks=new Map<string,{input:GainNode;splitter:ChannelSplitterNode;analysers:AnalyserNode[];samples:Float32Array[]}>();
  private samples = [new Float32Array(2048), new Float32Array(2048)];
  private sink: GainNode;
  constructor() {
    this.context = new AudioContext();
    this.bus = new GainNode(this.context, { channelCount: 2, channelCountMode: "explicit" });
    this.splitter = this.context.createChannelSplitter(2);
    this.sink = new GainNode(this.context, { gain: 0 });
    this.bus.connect(this.splitter);
    this.analysers = [0, 1].map((channel) => {
      const analyser = this.context.createAnalyser(); analyser.fftSize = 2048;
      this.splitter.connect(analyser, channel); analyser.connect(this.sink); return analyser;
    });
    this.sink.connect(this.context.destination);
  }
  resume() { return this.context.resume(); }
  get running() { return this.context.state === "running"; }
  sync(root: HTMLElement) {
    const elements = new Set(root.querySelectorAll<HTMLMediaElement>("audio,video"));
    for (const [element, tap] of this.taps) if (!elements.has(element)) { this.disposeTap(tap); this.taps.delete(element); }
    for (const element of elements) {
      if (!this.taps.has(element) && element.readyState >= 2 && !element.paused && !element.ended) {
        const capture = (element as Capturable).captureStream;
        if (!capture) throw new Error("Este navegador no permite medir el Programa. Usa Chrome o Edge de escritorio.");
        const stream = capture.call(element);
        // No se necesita la copia de imagen para medir sonido.
        for (const track of stream.getVideoTracks()) track.stop();
        const gain = new GainNode(this.context, { gain: 0 }); gain.connect(this.bus);
        const trackGain=this.context.createGain();const tap: Tap = { stream, gain, trackGain, wire: () => {} };
        tap.wire = () => {
          for (const video of stream.getVideoTracks()) if (video.readyState === "live") video.stop();
          const track = stream.getAudioTracks().find((t) => t.readyState === "live");
          if (track?.id === tap.trackId) return;
          tap.source?.disconnect(); tap.source = undefined; tap.trackId = track?.id;
          if (track) { tap.source = this.context.createMediaStreamSource(new MediaStream([track])); tap.source.connect(gain);tap.source.connect(trackGain); }
        };
        stream.addEventListener("addtrack", tap.wire); stream.addEventListener("removetrack", tap.wire);
        this.taps.set(element, tap); tap.wire();
      }
      const tap = this.taps.get(element);
      if (tap) {
        tap.wire();
        const busId=element.dataset.ugcTrack;if(busId!==tap.busId){if(tap.busId){const old=this.tracks.get(tap.busId);if(old)tap.trackGain.disconnect(old.input);}tap.busId=busId;if(busId){let bus=this.tracks.get(busId);if(!bus){const input=this.context.createGain(),splitter=this.context.createChannelSplitter(2);input.connect(splitter);const analysers=[0,1].map(i=>{const a=this.context.createAnalyser();a.fftSize=2048;splitter.connect(a,i);a.connect(this.sink);return a;});bus={input,splitter,analysers,samples:[new Float32Array(2048),new Float32Array(2048)]};this.tracks.set(busId,bus);}tap.trackGain.connect(bus.input);}}
        // captureStream ignora mute/volume: hay que aplicarlos a la copia (W3C).
        tap.trackGain.gain.value=root.dataset.programMuted==="true"||element.paused||element.ended||element.seeking||element.readyState<3||element.muted&&element.dataset.ugcTrackVolume===undefined?0:Number(element.dataset.ugcTrackVolume??element.dataset.ugcVolume??element.volume);
        tap.gain.gain.value = root.dataset.programMuted === "true" || element.muted || element.paused || element.ended || element.seeking || element.readyState < 3 ? 0 : Number(element.dataset.ugcVolume ?? element.volume);
      }
    }
  }
  read(): [number, number] {
    return this.analysers.map((analyser, index) => { analyser.getFloatTimeDomainData(this.samples[index]); return samplePeakDb(this.samples[index]); }) as [number, number];
  }
  readTracks():Record<string,[number,number]>{return Object.fromEntries([...this.tracks].map(([id,b])=>[id,b.analysers.map((a,i)=>{a.getFloatTimeDomainData(b.samples[i] as Float32Array<ArrayBuffer>);return samplePeakDb(b.samples[i]);}) as [number,number]]));}
  private disposeTap(tap: Tap) {
    tap.stream.removeEventListener("addtrack", tap.wire); tap.stream.removeEventListener("removetrack", tap.wire);
    tap.source?.disconnect(); tap.gain.disconnect();tap.trackGain.disconnect(); tap.stream.getTracks().forEach((track) => track.stop());
  }
  close() { this.taps.forEach((tap) => this.disposeTap(tap)); this.taps.clear();this.tracks.forEach(b=>{b.input.disconnect();b.splitter.disconnect();b.analysers.forEach(a=>a.disconnect());});this.tracks.clear(); this.bus.disconnect(); this.splitter.disconnect(); this.analysers.forEach((node) => node.disconnect()); this.sink.disconnect(); void this.context.close(); }
}
