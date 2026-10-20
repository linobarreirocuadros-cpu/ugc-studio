import { normalizeProject, type Project } from "./types";

export type ProjectMedia = {src:string;name:string;durationInFrames:number;proxySrc?:string;kind?:"video"|"audio";hasAudio?:boolean};
export type ProjectFile = {project:Project;media:ProjectMedia[]};
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
const integer=(v:unknown,min=0):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min;
const number=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
function requireValue(ok:unknown,label:string):asserts ok {if(!ok)throw new Error(`Proyecto inválido: ${label}.`);}

/** Validar antes de sustituir un montaje o entregarlo a Remotion. No modifica el JSON. */
export function assertProject(value:unknown):asserts value is Project {
  requireValue(object(value),"falta el proyecto");
  const check=(p:Record<string,unknown>)=>{
    requireValue(p.version===1&&typeof p.name==="string","formato o versión desconocidos");
    requireValue(integer(p.fps,1)&&p.fps<=120&&integer(p.width,1)&&integer(p.height,1),"FPS o dimensiones incorrectos");
    requireValue(Array.isArray(p.tracks),"faltan las pistas");
    const tracks=new Set<string>(),clips=new Set<string>();
    for(const t of p.tracks){
      requireValue(object(t)&&typeof t.id==="string"&&!tracks.has(t.id)&&typeof t.name==="string"&&["video","audio","text","caption","graphic"].includes(String(t.kind))&&Array.isArray(t.clips),"pista incorrecta o duplicada");tracks.add(t.id);
      for(const c of t.clips){
        requireValue(object(c)&&typeof c.id==="string"&&!clips.has(c.id)&&c.kind===t.kind&&integer(c.from)&&integer(c.durationInFrames,1),"clip incorrecto, duplicado o con tiempos inválidos");clips.add(c.id);
        if(c.labelColor!==undefined)requireValue(/^#[0-9a-f]{6}$/i.test(String(c.labelColor)),"etiqueta incorrecta");
        if(c.groupId!==undefined)requireValue(typeof c.groupId==="string","grupo incorrecto");
        if(c.kind==="video"||c.kind==="audio"){
          requireValue(typeof c.src==="string"&&typeof c.name==="string"&&integer(c.trimStart)&&integer(c.sourceDurationInFrames,1)&&number(c.volume)&&c.volume>=0&&c.volume<=4,"medio o nivel de audio incorrecto");
          requireValue(c.playbackRate===undefined || number(c.playbackRate)&&c.playbackRate>=.25&&c.playbackRate<=4,"velocidad incorrecta");
          requireValue(c.freezeFrame===undefined || c.kind==="video"&&integer(c.freezeFrame)&&c.freezeFrame<c.sourceDurationInFrames,"fotograma congelado incorrecto");
          requireValue(c.freezeFrame!==undefined || c.trimStart+Math.max(0,c.durationInFrames-1)*Number(c.playbackRate??1)<c.sourceDurationInFrames,"recorte fuera del archivo de origen");
          if(c.channelMode!==undefined)requireValue(["stereo","mono","left","right"].includes(String(c.channelMode))&&typeof c.channelSource==="string","canales incorrectos");
          if(c.kind==="audio")requireValue(integer(c.fadeIn)&&integer(c.fadeOut),"fundido de audio incorrecto");
          if(c.sequenceId!==undefined)requireValue(typeof c.sequenceId==="string","referencia de secuencia incorrecta");
        }else if(c.kind==="graphic"){
          requireValue(["solid","rectangle","adjustment"].includes(String(c.shape))&&typeof c.name==="string"&&/^#[0-9a-f]{6}$/i.test(String(c.color)),"elemento gráfico incorrecto");
          for(const key of ["x","y","width","height","opacity","brightness","contrast","saturation"])requireValue(number(c[key])&&Number(c[key])>=0&&Number(c[key])<= (['brightness','contrast','saturation'].includes(key)?4:1),"parámetro gráfico incorrecto");
        }else{
          const s=c.style;
          requireValue(object(s)&&typeof s.fontFamily==="string"&&number(s.fontSize)&&s.fontSize>0&&typeof s.color==="string"&&(s.background===null||typeof s.background==="string")&&number(s.y),"estilo de texto incorrecto");
          if(c.kind==="text")requireValue(typeof c.text==="string","texto incorrecto");
          else requireValue(Array.isArray(c.words)&&c.words.every(w=>object(w)&&typeof w.text==="string"&&integer(w.start)&&integer(w.end)&&w.end>=w.start),"palabras de subtítulo incorrectas");
        }
      }
    }
    if(p.markers!==undefined)requireValue(Array.isArray(p.markers)&&p.markers.every(m=>object(m)&&typeof m.id==="string"&&integer(m.frame)&&typeof m.label==="string"&&typeof m.color==="string"),"marcadores incorrectos");
    if(p.transcripts!==undefined)requireValue(object(p.transcripts)&&Object.values(p.transcripts).every(words=>Array.isArray(words)&&words.every(w=>object(w)&&typeof w.text==="string"&&integer(w.start)&&integer(w.end)&&w.end>=w.start)),"transcripción incorrecta");
  };
  check(value);
  if(value.sequences!==undefined){requireValue(object(value.sequences),"secuencias incorrectas");for(const s of Object.values(value.sequences)){requireValue(object(s)&&integer(s.durationInFrames,1),"secuencia incorrecta");check(s);}}
  const sequences=(value.sequences??{}) as Record<string,Record<string,unknown>>;
  const visit=(p:Record<string,unknown>,stack:Set<string>)=>{
    for(const t of p.tracks as {clips:{sequenceId?:string}[]}[])for(const c of t.clips)if(c.sequenceId){
      const s=sequences[c.sequenceId];requireValue(s&&!stack.has(c.sequenceId),"secuencia ausente o circular");visit(s,new Set([...stack,c.sequenceId]));
    }
  };
  visit(value,new Set());for(const [id,s] of Object.entries(sequences))visit(s,new Set([id]));
}

export function parseProjectFile(text:string):ProjectFile {
  let data:unknown;
  try{data=JSON.parse(text);}catch{throw new Error("No se pudo abrir: el archivo no contiene JSON válido.");}
  requireValue(object(data),"archivo incorrecto");assertProject(data.project);
  const media=data.media??[];
  requireValue(Array.isArray(media)&&media.every(m=>object(m)&&typeof m.src==="string"&&typeof m.name==="string"&&integer(m.durationInFrames,1)&&(m.kind===undefined||m.kind==="video"||m.kind==="audio")&&(m.proxySrc===undefined||typeof m.proxySrc==="string")),"biblioteca de medios incorrecta");
  return {project:normalizeProject(data.project),media:media as ProjectMedia[]};
}
