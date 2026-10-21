/** Prueba real y reproducible: bundle oficial, Chromium de Remotion y fotogramas PNG. */
import {bundle} from "@remotion/bundler";
import {renderStill,selectComposition} from "@remotion/renderer";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import {createEmptyProject,DEFAULT_CAPTION_STYLE,type CaptionClip} from "../src/project/types";
import * as ops from "../src/project/ops";
import {DEFAULT_MOTION} from "../src/project/motion";
const out=path.resolve(process.argv[2]??".qa-motion");await mkdir(out,{recursive:true});
const base={...createEmptyProject(),name:"QA motores editables",width:640,height:360};
const clip:CaptionClip={id:"caption-qa",kind:"caption",from:0,durationInFrames:90,words:[{text:"Todo",start:0,end:25},{text:"sigue",start:25,end:50},{text:"editable",start:50,end:90}],style:{...DEFAULT_CAPTION_STYLE,fontSize:44,y:.55,stroke:false},motion:{...DEFAULT_MOTION,entrance:"rise",exit:"fade",inFrames:12,outFrames:10,keys:[{frame:0,x:0},{frame:60,x:24}]}};
const serveUrl=await bundle({entryPoint:path.resolve("src/remotion/index.ts")});
for(const engine of ["remotion","hyperframes"] as const){
 const project={...base,tracks:base.tracks.map(t=>t.id==="S1"?{...t,clips:[{...clip,renderEngine:engine}]}:t.id==="V1"?{...t,clips:[{id:"qa-blue",kind:"graphic" as const,name:"Fondo azul",shape:"solid" as const,from:0,durationInFrames:90,color:"#123456",x:.5,y:.5,width:1,height:1,opacity:1,brightness:1,contrast:1,saturation:1}]}:t)};
 await writeFile(path.join(out,`${engine}.json`),JSON.stringify({project},null,2));
 const inputProps={project},composition=await selectComposition({serveUrl,id:"Project",inputProps});
 const images:Buffer[]=[];
 for(const frame of [0,4,15,44,88]){
   await renderStill({serveUrl,composition,inputProps,frame,output:path.join(out,`${engine}-${frame}.png`),imageFormat:"png",onBrowserLog:log=>{if(log.type==="error"||log.type==="warn")process.stderr.write(log.text+"\n");}});
   images.push(await readFile(path.join(out,`${engine}-${frame}.png`)));
   process.stdout.write(`${engine}: frame ${frame}\n`);
 }
 if(images[0].equals(images[2])||images[2].equals(images[3]))throw new Error(`${engine}: no cambió el fotograma animado`);
}
// Palabra larga en flujo natural, a 24 fps: no usa una caja fija que cambie su anclaje.
for(const engine of ["remotion","hyperframes"] as const){
 const project={...base,fps:24,tracks:base.tracks.map(t=>t.id==="S1"?{...t,clips:[{...clip,renderEngine:engine,words:[{text:"Extraordinariamente",start:0,end:30},{text:"editable",start:30,end:90}],style:{...clip.style,preset:"palabra" as const,fontSize:64}}]}:t)};
 const inputProps={project},composition=await selectComposition({serveUrl,id:"Project",inputProps});
 for(const frame of [15,44])await renderStill({serveUrl,composition,inputProps,frame,output:path.join(out,`${engine}-palabra24-${frame}.png`),imageFormat:"png"});
}
// El recorte conserva el reloj de la animación y se renderiza en el mismo fotograma global.
const source={...base,tracks:base.tracks.map(t=>t.id==="S1"?{...t,clips:[{...clip,renderEngine:"hyperframes" as const}]}:t)};
const cut=ops.splitAt(source,20,clip.id),composition=await selectComposition({serveUrl,id:"Project",inputProps:{project:cut}});
await renderStill({serveUrl,composition,inputProps:{project:cut},frame:44,output:path.join(out,"hyperframes-cut44.png"),imageFormat:"png"});
const nested=ops.nestClips(source,[clip.id],"Escena HF editable"),nestedComposition=await selectComposition({serveUrl,id:"Project",inputProps:{project:nested}});
await renderStill({serveUrl,composition:nestedComposition,inputProps:{project:nested},frame:44,output:path.join(out,"hyperframes-nested44.png"),imageFormat:"png"});
process.stdout.write(`Pruebas guardadas en ${out}\n`);
