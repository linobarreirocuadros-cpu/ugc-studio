import type {ReactNode} from "react";
import {AbsoluteFill,useCurrentFrame} from "remotion";
import type {Clip,Project,Track} from "../project/types";
import {effectStyle,transitionTiming} from "../project/effects";
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export function EffectFrame({clip,track,project,children}:{clip:Clip;track:Track;project:Project;children:ReactNode}){const frame=useCurrentFrame(),t=transitionTiming(track,clip),local=frame-t.pre;let alpha=1,white=0,wipe=1;const incoming=clip.transitionIn;if(incoming){const ratio=clamp((t.pre?frame:local)/Math.max(1,t.pre+t.inPost));if(incoming.type==="wipe")wipe=ratio;else if(incoming.type==="dipWhite")white=1-ratio;else alpha*=ratio;}
const outgoing=t.next?.transitionIn;if(outgoing&&(outgoing.type==="dipBlack"||outgoing.type==="dipWhite")){const ratio=clamp((local-(clip.durationInFrames-t.outPre))/Math.max(1,t.outPre));if(outgoing.type==="dipWhite")white=Math.max(white,ratio);else alpha*=1-ratio;}
if(clip.transitionOut){const ratio=clamp((clip.durationInFrames-1-local)/Math.max(1,Math.min(clip.durationInFrames,clip.transitionOut.frames)));if(clip.transitionOut.type==="dipWhite")white=Math.max(white,1-ratio);else if(clip.transitionOut.type==="wipe")wipe=Math.min(wipe,ratio);else alpha*=ratio;}
const style=clip.effects?effectStyle(clip,project):{opacity:1};return <AbsoluteFill style={{...style,opacity:style.opacity*alpha}}><AbsoluteFill style={wipe<1?{clipPath:`inset(0 ${(1-wipe)*100}% 0 0)`}:undefined}>{children}{white>0&&<AbsoluteFill style={{background:"white",opacity:white}}/>}</AbsoluteFill></AbsoluteFill>;}
