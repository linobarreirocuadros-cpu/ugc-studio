// Mapa Windows/QWERTY, contrastado con Adobe Help el 2026-10-20.
// Las teclas se guardan por posición física (KeyboardEvent.code); los rótulos pueden ser ES o US.
export type CommandScope = "app" | "timeline" | "source" | "program" | "bin" | "mixer" | "effects" | "effectControls" | "history" | "browser" | "metadata";
export type Command = { id: string; label: string; category: string; scope: CommandScope; defaults: string[]; pending?: string; repeat?: boolean };
const c = (id: string, label: string, category: string, keys: string, scope: CommandScope = "app", pending?: string, repeat = false): Command => ({ id, label, category, scope, defaults: keys ? keys.split("|") : [], pending, repeat });
const feature = "Esta función todavía no está implementada en UGC Studio.";
export const COMMANDS: Command[] = [
  c("newProject", "Nuevo proyecto", "Archivo", "Ctrl+Alt+KeyN"),
  c("newSequence", "Nueva secuencia", "Archivo", "Ctrl+KeyN", "app"),
  c("open", "Abrir proyecto…", "Archivo", "Ctrl+KeyO"),
  c("closePanel", "Cerrar panel", "Archivo", "Ctrl+KeyW", "app", "El navegador reserva Ctrl+W; cerrar paneles aún no está disponible."),
  c("closeProject", "Cerrar proyecto", "Archivo", "Ctrl+Shift+KeyW", "app", feature),
  c("save", "Guardar proyecto", "Archivo", "Ctrl+KeyS"),
  c("saveAs", "Guardar como…", "Archivo", "Ctrl+Shift+KeyS"),
  c("saveCopy", "Guardar una copia…", "Archivo", "Ctrl+Alt+KeyS"),
  c("importBrowser", "Importar desde explorador de medios", "Archivo", "Ctrl+Alt+KeyI", "app", feature),
  c("import", "Importar medios…", "Archivo", "Ctrl+KeyI"),
  c("export", "Exportar medios…", "Archivo", "Ctrl+KeyM"),
  c("mediaEncoder", "Enviar a Media Encoder", "Archivo", "Alt+Shift+KeyM", "app", "Integración de Adobe externa; no forma parte del flujo local gratuito."),
  c("mediaProperties", "Propiedades del archivo", "Archivo", "Ctrl+Shift+KeyH", "app", feature),
  c("exit", "Salir", "Archivo", "Ctrl+KeyQ", "app", "Cerrar la aplicación corresponde al navegador o a su ventana."),
  c("undo", "Deshacer", "Edición", "Ctrl+KeyZ"), c("redo", "Rehacer", "Edición", "Ctrl+Shift+KeyZ"),
  c("cut", "Cortar selección", "Edición", "Ctrl+KeyX", "timeline"), c("copy", "Copiar selección", "Edición", "Ctrl+KeyC", "timeline"), c("paste", "Pegar en el cabezal", "Edición", "Ctrl+KeyV", "timeline"),
  c("pasteAttributes", "Pegar atributos", "Edición", "Ctrl+Alt+KeyV", "timeline", feature),
  c("delete", "Borrar selección", "Edición", "Delete|Backspace", "timeline"), c("rippleDelete", "Eliminar y cerrar hueco", "Edición", "Shift+Delete|Alt+Backspace", "timeline"),
  c("duplicate", "Duplicar selección", "Edición", "Ctrl+Shift+Slash", "timeline"),
  c("selectAll", "Seleccionar todo", "Edición", "Ctrl+KeyA"), c("deselect", "Deseleccionar todo", "Edición", "Ctrl+Shift+KeyA|Escape"),
  c("find", "Buscar comandos…", "Edición", "Ctrl+KeyF"),
  c("editOriginal", "Editar original", "Edición", "Ctrl+KeyE", "app", feature),
  c("shortcuts", "Atajos de teclado…", "Edición", "Ctrl+Alt+KeyK"),
  c("subclip", "Crear subclip", "Clip", "Ctrl+KeyU", "app", feature), c("channels", "Canales de audio", "Clip", "Shift+KeyG", "app"),
  c("gain", "Ganancia de audio…", "Clip", "KeyG", "timeline"), c("speed", "Velocidad / duración", "Clip", "Ctrl+KeyR", "timeline"),
  c("insert", "Insertar desde Origen", "Clip", "Comma"), c("overwrite", "Sobrescribir desde Origen", "Clip", "Period"),
  c("enable", "Habilitar clip", "Clip", "Shift+KeyE", "timeline", feature), c("link", "Enlazar / desenlazar", "Clip", "Ctrl+KeyL", "timeline"),
  c("group", "Agrupar clips", "Clip", "Ctrl+KeyG", "timeline"), c("ungroup", "Desagrupar clips", "Clip", "Ctrl+Shift+KeyG", "timeline"),
  c("renderEffects", "Renderizar efectos de entrada a salida", "Secuencia", "Enter", "timeline", feature),
  c("matchFrame", "Localizar fotograma en Origen", "Secuencia", "KeyF", "timeline"), c("reverseMatch", "Localizar en secuencia", "Secuencia", "Shift+KeyR", "source", feature),
  c("split", "Añadir corte", "Secuencia", "Ctrl+KeyK", "timeline"), c("splitAll", "Añadir corte en todas las pistas", "Secuencia", "Ctrl+Shift+KeyK", "timeline"),
  c("ripplePrevious", "Recortar inicio hasta el cabezal y cerrar hueco", "Secuencia", "KeyQ", "timeline"), c("rippleNext", "Recortar final desde el cabezal y cerrar hueco", "Secuencia", "KeyW", "timeline"),
  c("trimMode", "Modo de recorte", "Secuencia", "Shift+KeyT", "timeline", feature), c("extend", "Extender edición al cabezal", "Secuencia", "KeyE", "timeline", feature),
  c("videoTransition", "Aplicar transición de video", "Secuencia", "Ctrl+KeyD", "timeline", feature), c("audioTransition", "Aplicar transición de audio", "Secuencia", "Ctrl+Shift+KeyD", "timeline", feature), c("transitions", "Aplicar transiciones predeterminadas", "Secuencia", "Shift+KeyD", "timeline", feature),
  c("lift", "Levantar rango", "Secuencia", "Semicolon", "timeline", feature), c("extract", "Extraer rango", "Secuencia", "Quote", "timeline", feature),
  c("zoomIn", "Acercar timeline", "Secuencia", "Equal|NumpadAdd", "timeline", undefined, true), c("zoomOut", "Alejar timeline", "Secuencia", "Minus|NumpadSubtract", "timeline", undefined, true), c("fit", "Ajustar montaje / volver al zoom anterior", "Secuencia", "Backslash", "timeline"),
  c("nextSequence", "Siguiente secuencia", "Secuencia", "Shift+Semicolon", "timeline", feature), c("prevSequence", "Secuencia anterior", "Secuencia", "Ctrl+Shift+Semicolon", "timeline", feature),
  c("snap", "Imán", "Secuencia", "KeyS", "timeline"), c("subsequence", "Crear subsecuencia de la selección", "Secuencia", "Shift+KeyU", "timeline"),
  c("captionTrack", "Añadir pista de subtítulos", "Secuencia", "Ctrl+Alt+KeyA", "timeline", feature), c("captionAt", "Añadir subtítulo en el cabezal", "Secuencia", "Ctrl+Alt+KeyC", "timeline", feature),
  c("nextCaption", "Siguiente subtítulo", "Secuencia", "Ctrl+Alt+ArrowDown", "timeline", undefined, true), c("prevCaption", "Subtítulo anterior", "Secuencia", "Ctrl+Alt+ArrowUp", "timeline", undefined, true),
  ...[
    ["markIn", "Marcar entrada", "KeyI"], ["markOut", "Marcar salida", "KeyO"], ["markClip", "Marcar clip", "KeyX"], ["markSelection", "Marcar selección", "Slash"],
    ["goIn", "Ir a entrada", "Shift+KeyI"], ["goOut", "Ir a salida", "Shift+KeyO"], ["clearIn", "Borrar entrada", "Ctrl+Shift+KeyI"], ["clearOut", "Borrar salida", "Ctrl+Shift+KeyO"], ["clearMarks", "Borrar entrada y salida", "Ctrl+Shift+KeyX"],
    ["marker", "Añadir marcador", "KeyM"], ["nextMarker", "Siguiente marcador", "Shift+KeyM"], ["prevMarker", "Marcador anterior", "Ctrl+Shift+KeyM"], ["deleteMarker", "Borrar marcador del cabezal", "Ctrl+Alt+KeyM"], ["deleteMarkers", "Borrar todos los marcadores", "Ctrl+Alt+Shift+KeyM"],
  ].map(([id, label, key]) => c(id, label, "Marcadores", key)),
  c("text", "Nueva capa de texto", "Gráficos", "Ctrl+KeyT", "timeline"),
  ...[["rectangle", "Rectángulo", "Ctrl+Alt+KeyR"], ["ellipse", "Elipse", "Ctrl+Alt+KeyE"], ["front", "Traer al frente", "Ctrl+Shift+BracketRight"], ["forward", "Adelantar capa", "Ctrl+BracketRight"], ["backward", "Retrasar capa", "Ctrl+BracketLeft"], ["back", "Enviar al fondo", "Ctrl+Shift+BracketLeft"], ["nextLayer", "Seleccionar capa siguiente", "Ctrl+Alt+BracketRight"], ["prevLayer", "Seleccionar capa anterior", "Ctrl+Alt+BracketLeft"]].map(([id,label,key]) => c(id,label,"Gráficos",key,"program",feature)),
  ...["Todos los paneles", "Ensamblaje", "Audio", "Subtítulos y gráficos", "Color", "Edición", "Efectos", "Esencial", "Aprendizaje"].map((label,i) => c(`workspace${i+1}`, `Espacio: ${label}`, "Ventana", `Alt+Shift+Digit${i+1}`, "app", "Los espacios de trabajo con nombre requieren definir sus distribuciones con Lino.")),
  c("resetWorkspace", "Restablecer distribución", "Ventana", "Alt+Shift+Digit0"), c("maximize", "Ampliar / restaurar panel bajo el mouse", "Ventana", "Backquote"), c("maximizeFocused", "Ampliar / restaurar panel activo", "Ventana", "Shift+Backquote"),
  c("clipMixer", "Mezclador de clips", "Ventana", "Shift+Digit9", "app", feature), c("trackMixer", "Mezclador de pistas", "Ventana", "Shift+Digit6", "app", "El medidor dBFS existe; el mezclador completo aún no."),
  c("properties", "Propiedades (controles disponibles)", "Ventana", "Shift+Digit5"),
  c("effectsPanel", "Efectos", "Ventana", "Shift+Digit7", "app", feature), c("mediaBrowser", "Explorador de medios", "Ventana", "Shift+Digit8", "app", feature),
  c("program", "Monitor Programa", "Ventana", "Shift+Digit4"), c("bin", "Proyecto", "Ventana", "Shift+Digit1"), c("source", "Monitor Origen", "Ventana", "Shift+Digit2"), c("timeline", "Timeline", "Ventana", "Shift+Digit3"),
  c("chat", "Chat IA", "Ventana", ""), c("audioPanel", "Limpieza de audio", "Ventana", ""), c("meter", "Medidor de audio", "Ventana", ""),
  ...[["showMixerTracks", "Mostrar / ocultar pistas", "Ctrl+Alt+KeyT"], ["mixerLoop", "Reproducción en bucle", "Ctrl+KeyL"], ["meterInputs", "Medir solo entradas", "Ctrl+Shift+KeyI"]].map(([id,label,key])=>c(id,label,"Mezclador",key,"mixer",feature)),
  c("removeEffect", "Eliminar efecto seleccionado", "Controles de efectos", "Backspace", "effectControls", feature), c("loopEffects", "Bucle de reproducción solo audio", "Controles de efectos", "Ctrl+KeyL", "effectControls", feature),
  c("effectBin", "Nueva carpeta de efectos", "Efectos", "Ctrl+Slash", "effects", feature), c("effectDelete", "Eliminar elemento personalizado", "Efectos", "Backspace", "effects", feature),
  ...[["historyBack", "Paso atrás", "ArrowLeft"], ["historyForward", "Paso adelante", "ArrowRight"], ["historyDelete", "Eliminar estado", "Backspace"]].map(([id,label,key])=>c(id,label,"Historial",key,"history",feature)),
  ...[["browserSource", "Abrir en Origen", "Shift+KeyO"], ["browserDirectory", "Seleccionar directorios", "Shift+ArrowLeft"], ["browserMedia", "Seleccionar medios", "Shift+ArrowRight"]].map(([id,label,key])=>c(id,label,"Explorador de medios",key,"browser",feature)),
  c("metadataLoop", "Bucle", "Metadatos", "Ctrl+KeyL", "metadata", feature), c("metadataPlay", "Reproducir", "Metadatos", "Space", "metadata", feature),
  ...[["rulers", "Mostrar reglas", "Ctrl+KeyR"], ["guides", "Mostrar guías", "Ctrl+Semicolon"], ["snapProgram", "Ajustar a guías", "Ctrl+Shift+Semicolon"], ["lockGuides", "Bloquear guías", "Ctrl+Alt+Shift+KeyR"]].map(([id,label,key])=>c(id,label,"Monitor Programa",key,"program",feature)),
  ...["Up", "Right", "Left", "Down"].flatMap(direction=>[false,true].map(five=>c(`object${direction}${five?5:1}`, `Mover objeto ${direction === "Up" ? "arriba" : direction === "Down" ? "abajo" : direction === "Left" ? "izquierda" : "derecha"} ${five?5:1} px`, "Monitor Programa", `Ctrl+${five?"Shift+":""}Arrow${direction}`,"program",feature))),
  c("binRename","Renombrar elemento","Proyecto","F2","bin"), c("binProperties","Propiedades del elemento","Proyecto","","bin"),
  c("newBin", "Nueva carpeta", "Proyecto", "Ctrl+KeyB|Ctrl+Slash", "bin"), c("binDelete", "Eliminar de Proyecto", "Proyecto", "Backspace|Delete", "bin"),
  c("binList", "Vista de lista", "Proyecto", "Ctrl+PageUp", "bin"), c("binGrid", "Vista de cuadrícula", "Proyecto", "Ctrl+PageDown", "bin"), c("hoverScrub", "Previsualizar al pasar el mouse", "Proyecto", "Shift+KeyH", "bin"), c("binDeleteOptions", "Eliminar con opciones", "Proyecto", "Ctrl+Delete", "bin"),
  ...["Down", "Left", "Right", "Up", "Home", "End", "PageDown", "PageUp"].flatMap(direction=>[false,...(["Down","Left","Right","Up"].includes(direction)?[true]:[])].map(extend=>c(`bin${extend?"extend":"move"}${direction}`, `${extend?"Extender selección":"Seleccionar"}: ${direction}`, "Proyecto", `${extend?"Shift+":""}${direction.startsWith("Page")||direction==="Home"||direction==="End"?direction:`Arrow${direction}`}`,"bin",undefined,true))),
  c("binNextColumn", "Siguiente campo de columna", "Proyecto", "Tab", "bin", feature), c("binNextRow", "Siguiente campo de fila", "Proyecto", "Enter", "bin", feature), c("binSource", "Abrir selección en Origen", "Proyecto", "Shift+KeyO", "bin"), c("binPrevColumn", "Campo de columna anterior", "Proyecto", "Shift+Tab", "bin", feature), c("binPrevRow", "Campo de fila anterior", "Proyecto", "Shift+Enter", "bin", feature),
  c("thumbLarger", "Miniaturas más grandes", "Proyecto", "Shift+BracketRight|Equal", "bin"), c("thumbSmaller", "Miniaturas más pequeñas", "Proyecto", "Shift+BracketLeft|Minus", "bin"), c("binToggle", "Alternar lista / cuadrícula", "Proyecto", "Shift+Backslash", "bin"),
  ...[["audioHeightDown","Reducir altura de audio","Alt+Minus"], ["videoHeightDown","Reducir altura de video","Ctrl+Minus"], ["audioHeightUp","Aumentar altura de audio","Alt+Equal"], ["videoHeightUp","Aumentar altura de video","Ctrl+Equal"]].map(([id,label,key])=>c(id,label,"Timeline",key,"timeline", "Altura independiente por tipo de pista pendiente; el ajuste actual es común.")),
  ...[-1,1].flatMap(sign=>[1,5].flatMap(step=>[false,true].map(slip=>c(`${slip?"slip":"nudge"}${sign<0?"Left":"Right"}${step}`, `${slip?"Deslizar contenido":"Mover selección"} ${step} frame${step===1?"":"s"} ${sign<0?"izquierda":"derecha"}`, "Timeline", `${slip?"Ctrl+":""}Alt+${step===5?"Shift+":""}Arrow${sign<0?"Left":"Right"}`,"timeline",undefined,true)))),
  c("workIn", "Entrada del área de trabajo", "Timeline", "Alt+BracketLeft", "timeline", feature), c("workOut", "Salida del área de trabajo", "Timeline", "Alt+BracketRight", "timeline", feature), c("pageNext", "Pantalla siguiente", "Timeline", "PageDown", "timeline",undefined,true), c("pagePrev", "Pantalla anterior", "Timeline", "PageUp", "timeline",undefined,true),
  ...[-1,1].flatMap(sign=>[1,5].map(step=>c(`slide${sign<0?"Left":"Right"}${step}`, `Desplazar entre vecinos ${step} frame${step===1?"":"s"} ${sign<0?"izquierda":"derecha"}`, "Timeline", `Alt+${step===5?"Shift+":""}${sign<0?"Comma":"Period"}`,"timeline",feature))),
  ...[["select","Selección","KeyV"],["track","Seleccionar hacia delante","KeyA"],["razor","Cuchilla","KeyC"],["ripple","Recorte ripple","KeyB"],["slip","Deslizar contenido","KeyY"],["hand","Mano","KeyH"],["zoom","Zoom","KeyZ"],["text","Texto","KeyT"]].map(([id,label,key])=>c(`tool.${id}`,label,"Herramientas",key)),
  ...[["rolling","Recorte continuo","KeyN"],["slide","Desplazar entre vecinos","KeyU"],["stretch","Estirar velocidad","KeyR"],["pen","Pluma / keyframes","KeyP"],["trackBack","Seleccionar hacia atrás","Shift+KeyA"]].map(([id,label,key])=>c(`tool.${id}`,label,"Herramientas",key,"app",feature)),
  c("play", "Reproducir / pausar", "Reproducción", "Space"), c("stop", "Detener reproducción", "Reproducción", "KeyK"), c("forwardPlay", "Reproducir adelante (1×, 2×, 4×…)", "Reproducción", "KeyL"), c("reversePlay", "Revisar hacia atrás (sin audio)", "Reproducción", "KeyJ"),
  c("slowForward", "Reproducción lenta hacia delante", "Reproducción", "Shift+KeyL", "app", feature), c("slowReverse", "Reproducción lenta hacia atrás", "Reproducción", "Shift+KeyJ", "app", feature),
  ...[-1,1].flatMap(sign=>[1,5].map(step=>c(`step${sign<0?"Left":"Right"}${step}`, `${sign<0?"Retroceder":"Avanzar"} ${step} frame${step===1?"":"s"}`,"Reproducción", `${step===5?"Shift+":""}Arrow${sign<0?"Left":"Right"}`,"app",undefined,true))),
  c("prevEdit","Edición anterior","Reproducción","ArrowUp","timeline",undefined,true), c("nextEdit","Siguiente edición","Reproducción","ArrowDown","timeline",undefined,true), c("start","Ir al inicio","Reproducción","Home"), c("end","Ir al final","Reproducción","End"),
  c("selectAtPlayhead","Seleccionar clip bajo el cabezal","Timeline","KeyD","timeline"),
  c("expandTracks","Expandir todas las pistas","Timeline","Shift+Equal","timeline"), c("minimizeTracks","Minimizar todas las pistas","Timeline","Shift+Minus","timeline"),
  c("nextEditAll","Siguiente edición en cualquier pista","Timeline","Shift+ArrowDown","timeline",undefined,true), c("prevEditAll","Edición anterior en cualquier pista","Timeline","Shift+ArrowUp","timeline",undefined,true),
  c("trimPrevious","Recortar inicio hasta el cabezal sin ripple","Secuencia","Ctrl+Alt+KeyQ","timeline"), c("trimNext","Recortar final hasta el cabezal sin ripple","Secuencia","Ctrl+Alt+KeyW","timeline"),
  c("pasteInsert","Pegar insertando","Edición","Ctrl+Shift+KeyV","timeline",feature),
  c("linkedSelection","Selección enlazada","Timeline","","timeline"), c("followPlayhead","Selección sigue al cabezal","Timeline","","timeline"),
];
export const SCOPE_LABEL: Record<CommandScope,string> = {app:"Aplicación",timeline:"Timeline",source:"Origen",program:"Programa",bin:"Proyecto",mixer:"Mezclador",effects:"Efectos",effectControls:"Controles de efectos",history:"Historial",browser:"Explorador",metadata:"Metadatos"};
export type Bindings = Record<string,string[]>;
export const defaultBindings = (): Bindings => Object.fromEntries(COMMANDS.map(c=>[c.id,[...c.defaults]]));
export const KEY_ROWS = [
  ["Escape",...Array.from({length:12},(_,i)=>`F${i+1}`),"Delete"],
  ["Backquote",..."1234567890".split("").map(x=>`Digit${x}`),"Minus","Equal","Backspace"],
  ["Tab",..."QWERTYUIOP".split("").map(x=>`Key${x}`),"BracketLeft","BracketRight","Backslash"],
  ["CapsLock",..."ASDFGHJKL".split("").map(x=>`Key${x}`),"Semicolon","Quote","Enter"],
  ["ShiftLeft","IntlBackslash",..."ZXCVBNM".split("").map(x=>`Key${x}`),"Comma","Period","Slash","ShiftRight"],
  ["ControlLeft","MetaLeft","AltLeft","Space","AltRight","ControlRight","ArrowLeft","ArrowUp","ArrowDown","ArrowRight","Home","End","PageUp","PageDown"],
  ["NumLock",...Array.from({length:10},(_,i)=>`Numpad${i}`),"NumpadAdd","NumpadSubtract","NumpadMultiply","NumpadDivide","NumpadDecimal","NumpadEnter"],
];
const validCodes = new Set(KEY_ROWS.flat());
const mods = ["Ctrl","Alt","Shift"];
export function validChord(value: unknown): value is string {
  if(typeof value!=="string") return false;
  const parts=value.split("+"),code=parts.pop()!;
  return validCodes.has(code) && !/^(Control|Alt|Shift|Meta)/.test(code) && parts.every(p=>mods.includes(p)) && new Set(parts).size===parts.length && parts.join("+")===mods.filter(p=>parts.includes(p)).join("+");
}
export function normalizeBindings(value: unknown): Bindings {
  const result=defaultBindings();
  if(!value||typeof value!=="object"||Array.isArray(value)) return result;
  for(const command of COMMANDS) { const entry=(value as Bindings)[command.id]; if(Array.isArray(entry)&&entry.every(validChord)&&entry.length<=8) result[command.id]=[...new Set(entry)]; }
  return result;
}
export function eventChord(e: Pick<KeyboardEvent,"code"|"ctrlKey"|"metaKey"|"altKey"|"shiftKey"|"isComposing"|"getModifierState">): string | null {
  if(e.isComposing||e.getModifierState?.("AltGraph")||/^(Control|Alt|Shift|Meta)/.test(e.code)) return null;
  const code=e.code;
  return validCodes.has(code)?[...(e.ctrlKey||e.metaKey?["Ctrl"]:[]),...(e.altKey?["Alt"]:[]),...(e.shiftKey?["Shift"]:[]),code].join("+"):null;
}
export function resolveCommand(bindings: Bindings, chord: string, scope: CommandScope): Command | undefined {
  // Una reserva pendiente del panel bloquea el atajo general, evitando disparar otra acción.
  return COMMANDS.find(c=>c.scope===scope&&bindings[c.id]?.includes(chord)) ?? COMMANDS.find(c=>c.scope==="app"&&bindings[c.id]?.includes(chord));
}
export function conflicts(bindings: Bindings, id: string, chord: string): Command[] {
  const command=COMMANDS.find(c=>c.id===id)!;
  return COMMANDS.filter(c=>c.id!==id&&bindings[c.id]?.includes(chord)&&(c.scope===command.scope||c.scope==="app"||command.scope==="app"));
}
export function ambiguousBindings(bindings:Bindings):string[] {
  const seen=new Map<string,string>(),errors:string[]=[];
  for(const c of COMMANDS)for(const chord of bindings[c.id]??[]){const key=`${c.scope}:${chord}`,previous=seen.get(key);if(previous)errors.push(`${previous} / ${c.label}: ${chordLabel(chord)}`);else seen.set(key,c.label);}
  return errors;
}
const US: Record<string,string>={Backquote:"`",Minus:"−",Equal:"=",BracketLeft:"[",BracketRight:"]",Backslash:"\\",Semicolon:";",Quote:"'",Comma:",",Period:".",Slash:"/",IntlBackslash:"<",Space:"Espacio",ArrowLeft:"←",ArrowRight:"→",ArrowUp:"↑",ArrowDown:"↓",PageUp:"RePág",PageDown:"AvPág",ControlLeft:"Ctrl",ControlRight:"Ctrl",AltLeft:"Alt",AltRight:"AltGr",ShiftLeft:"Shift",ShiftRight:"Shift",MetaLeft:"Win",Backspace:"⌫",Delete:"Supr",CapsLock:"Bloq",Escape:"Esc",NumpadAdd:"Num +",NumpadSubtract:"Num −",NumpadMultiply:"Num *",NumpadDivide:"Num /",NumpadDecimal:"Num .",NumpadEnter:"Num ↵"};
const ES: Record<string,string>={Backquote:"º",Minus:"'",Equal:"¡",BracketLeft:"`",BracketRight:"+",Backslash:"ç",Semicolon:"ñ",Quote:"´",Slash:"−"};
export function keyLabel(code:string, layout="us"):string { return (layout==="es"?ES[code]:undefined)??US[code]??code.replace(/^Key|^Digit/,"").replace("Numpad","Num "); }
export function chordLabel(chord:string,layout="us"):string { const parts=chord.split("+");return [...parts.slice(0,-1),keyLabel(parts.at(-1)!,layout)].join(" + "); }
export function browserReservation(chord:string):string|undefined {
  if(/^(Ctrl\+(Shift\+)?Key[WNT]|Alt\+F4|F5|Ctrl\+KeyR|Ctrl\+Shift\+KeyI|Ctrl\+KeyL)$/.test(chord)) return "El navegador puede reservar esta combinación. Si no llega al editor, usa el menú o asigna otra tecla.";
}
