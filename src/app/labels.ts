import type {CSSProperties} from "react";

/** El JSON conserva un color hexadecimal; degradado y luz son solo presentación. */
export const LABEL_COLORS = [
  {name:"Rojo",color:"#ee6477",end:"#c34e83"},
  {name:"Naranja",color:"#ed9860",end:"#cf6578"},
  {name:"Amarillo",color:"#dfc765",end:"#b3994c"},
  {name:"Verde",color:"#47d8af",end:"#32b8bc"},
  {name:"Cian",color:"#4bcce5",end:"#518eda"},
  {name:"Azul",color:"#648ff1",end:"#8865dc"},
  {name:"Violeta",color:"#a56ae8",end:"#df65bb"},
] as const;

/** También admite las etiquetas antiguas/personalizadas sin alterar su valor guardado. */
export function labelStyle(color?:string):CSSProperties {
  if(!color||!/^#[0-9a-f]{6}$/i.test(color))return {};
  const preset=LABEL_COLORS.find(c=>c.color.toLowerCase()===color.toLowerCase());
  return {"--clip-color":color,"--clip-end":preset?.end??color} as CSSProperties;
}
