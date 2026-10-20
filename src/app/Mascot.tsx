import { useId } from "react";

/** Síntesis vectorial de la cara del personaje de Lino; sin fuentes ni servicios externos. */
export function Mascot({ className="" }: { className?:string }) {
  const id=useId().replace(/:/g,"");
  return <svg className={`studio-mascot ${className}`} viewBox="0 0 64 72" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-hat`} x1="17" y1="7" x2="46" y2="32" gradientUnits="userSpaceOnUse"><stop stopColor="#5489c7"/><stop offset="1" stopColor="#1d203d"/></linearGradient>
      <linearGradient id={`${id}-beard`} x1="21" y1="42" x2="44" y2="67" gradientUnits="userSpaceOnUse"><stop stopColor="#dce6f4"/><stop offset="1" stopColor="#5489c7"/></linearGradient>
    </defs>
    <path className="mascot-core" d="M17 31c0-8 30-8 30 0l-2 21H19z" fill="#0c1424" stroke="#5489c7" strokeWidth="2"/>
    <path d="m17 33-2 13 5 6M47 33l2 13-5 6" stroke="#739abb" strokeWidth="3" strokeLinecap="round"/>
    <g className="mascot-eyes" stroke="#f1ce88" strokeWidth="3.3" strokeLinecap="round"><path d="m23 36 6 2m6 0 6-2"/></g>
    <g className="mascot-hat">
      <path d="M17 27C23 22 22 11 30 4c2-2 4 0 5 3l12 24z" fill={`url(#${id}-hat)`} stroke="#7392b5" strokeWidth="1.2"/>
      <path d="M18 26c8-3 18-2 27 3l2 4-31-1z" fill="#bd9255"/>
      <path d="M5 32c2-5 19-8 30-6 13 2 23 6 24 10 1 6-19 1-27-1C20 33 3 38 5 32Z" fill={`url(#${id}-hat)`} stroke="#7392b5" strokeWidth="1.2"/>
      <path d="M12 30c12-4 29-2 43 5" stroke="#f1ce88" strokeWidth="1" strokeLinecap="round" opacity=".8"/>
    </g>
    <path className="mascot-beard" d="M21 43c-1 4-5 4-6 9l5-1c-1 6 2 9 6 9-1 5 3 7 4 8 8-2 16-8 17-17l-3-8-6 3-6-2-6 2z" fill={`url(#${id}-beard)`}/>
    <path d="M32 45c-3-3-7-2-10 3 5 1 8-1 10-3Zm0 0c3-3 7-2 10 3-5 1-8-1-10-3Z" fill="#e5edf5"/>
    <path d="M26 52c0 5 2 8 4 10m6-11c0 4-1 7-3 11" stroke="#5489c7" strokeWidth="1.2" opacity=".65" strokeLinecap="round"/>
  </svg>;
}
