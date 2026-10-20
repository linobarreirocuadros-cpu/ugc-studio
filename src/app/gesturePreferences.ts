export const GESTURE_ACTIONS = { horizontal:"Desplazar horizontalmente", vertical:"Desplazar entre pistas", zoom:"Zoom bajo el puntero", frame:"Avanzar / retroceder un frame", fiveFrames:"Avanzar / retroceder cinco frames", height:"Cambiar altura común de pistas", none:"Desactivado" };
export type GestureAction = keyof typeof GESTURE_ACTIONS;
export const WHEEL_MODIFIERS = ["", "Shift", "Ctrl", "Alt", "Ctrl+Shift", "Alt+Shift", "Ctrl+Alt", "Ctrl+Alt+Shift"] as const;
export type WheelModifier = typeof WHEEL_MODIFIERS[number];
export type GesturePreferences = Record<WheelModifier,GestureAction>;
export const DEFAULT_GESTURES: GesturePreferences = { "":"horizontal", Shift:"horizontal", Ctrl:"vertical", Alt:"zoom", "Ctrl+Shift":"vertical", "Alt+Shift":"zoom", "Ctrl+Alt":"zoom", "Ctrl+Alt+Shift":"zoom" };
export function normalizeGestures(value:unknown):GesturePreferences { const next={...DEFAULT_GESTURES}; if(value&&typeof value==="object") for(const mod of WHEEL_MODIFIERS) { const action=(value as GesturePreferences)[mod]; if(typeof action==="string"&&Object.hasOwn(GESTURE_ACTIONS,action)) next[mod]=action; } return next; }
export function wheelModifier(e:Pick<WheelEvent,"ctrlKey"|"metaKey"|"altKey"|"shiftKey">):WheelModifier { return [...(e.ctrlKey||e.metaKey?["Ctrl"]:[]),...(e.altKey?["Alt"]:[]),...(e.shiftKey?["Shift"]:[])].join("+") as WheelModifier; }
export function wheelPixels(delta:number,mode:number,page:number):number { return Math.max(-page,Math.min(page,delta*(mode===1?16:mode===2?page:1))); }
export function anchoredZoom(oldScale:number, factor:number, left:number, pointer:number) { const scale=Math.max(.02,Math.min(20,oldScale*factor)); return {scale,left:Math.max(0,(left+pointer)/oldScale*scale-pointer)}; }
