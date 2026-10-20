import { useEffect, useState } from "react";
import { chordLabel, defaultBindings, normalizeBindings, type Bindings } from "./commands";
import { normalizeGestures, type GesturePreferences } from "./gesturePreferences";
export type ShortcutSettings = { version:1; revision:2; bindings:Bindings; gestures:GesturePreferences; layout:"us"|"es" };
export function normalizeShortcutSettings(value:unknown):ShortcutSettings {
  const v=value&&typeof value==="object"?value as Partial<ShortcutSettings>:{};
  const bindings=normalizeBindings(v.bindings);
  // Corregir los dos valores de fábrica de la primera revisión, conservando los demás cambios.
  if(v.revision!==2){if(JSON.stringify(bindings.linkedSelection)==='["Shift+KeyL"]')bindings.linkedSelection=[];if(JSON.stringify(bindings.maximize)==='["Backquote","Shift+Backquote"]')bindings.maximize=["Backquote"];}
  return {version:1,revision:2,bindings,gestures:normalizeGestures(v.gestures),layout:v.layout==="es"?"es":"us"};
}
export function useShortcuts() {
  const [settings,setSettings]=useState(()=>{try{return normalizeShortcutSettings(JSON.parse(localStorage.getItem("ugc-studio:shortcuts:v1")??"null"));}catch{return normalizeShortcutSettings(null);}});
  useEffect(()=>{if(settings.revision!==2)setSettings(normalizeShortcutSettings(settings));},[settings]);
  useEffect(()=>{try{localStorage.setItem("ugc-studio:shortcuts:v1",JSON.stringify(settings));}catch{/* mantener sesión */}},[settings]);
  const hint=(id:string)=>settings.bindings[id]?.map(key=>chordLabel(key,settings.layout)).join(" / ")||"Sin atajo";
  return {settings,setSettings,hint,reset:()=>setSettings({...settings,bindings:defaultBindings(),gestures:normalizeGestures(null)})};
}
