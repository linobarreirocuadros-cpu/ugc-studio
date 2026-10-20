// Herramientas que el chat de IA puede usar para editar el proyecto. Se definen una sola vez y el
// servidor las traduce al formato de cada proveedor (Claude, OpenAI/Ollama/Gemini/Groq/OpenRouter).
// Los tiempos para la IA van en SEGUNDOS; el cliente los convierte a frames al ejecutarlas.

export type ToolDef = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

const color = { type: "string", description: "Color en formato hex, ej. #FFE500" };
const font = {
  type: "string",
  description:
    "Tipografía: Montserrat, Inter, Poppins, DM Sans, Roboto, Lato, Raleway, Oswald, Anton, Bebas Neue, Archivo Black, Playfair Display, DM Serif Display",
};
const position = { type: "string", enum: ["arriba", "centro", "abajo"], description: "Posición vertical en pantalla" };

export const TOOLS: ToolDef[] = [
  { name: "set_track_state", description: "Cambia controles de una pista por nombre o ID: locked protege edición, hidden oculta imagen, muted silencia, solo aísla audio, targeted elige destino, sync_lock sigue cambios ripple. No desbloquees una pista sin petición del usuario.", parameters: { type: "object", properties: { track: { type: "string" }, locked: { type: "boolean" }, hidden: { type: "boolean" }, muted: { type: "boolean" }, solo: { type: "boolean" }, targeted: { type: "boolean" }, sync_lock: { type: "boolean" } }, required: ["track"], additionalProperties: false } },
  { name: "add_track", description: "Crea otra pista numerada B (video) o Audio. Devuelve su nombre e ID. Consulta las pistas antes de elegir un destino.", parameters: { type: "object", properties: { kind: { type: "string", enum: ["video", "audio"] } }, required: ["kind"], additionalProperties: false } },
  { name: "read_transcript", description: "Transcribe o lee el diálogo de B1, con palabras y tiempos del timeline. Úsala antes de resumir coherentemente; force vuelve a transcribir si el usuario reporta errores. No hace cortes.", parameters: { type: "object", properties: { force: { type: "boolean" } }, additionalProperties: false } },
  { name: "create_edit_plan", description: "Prepara un resumen conservando rangos del montaje en orden. Los rangos deben sumar exactamente la duración objetivo, sin cortar palabras. Mantiene sonido, textos, subtítulos y B-roll sincronizados. Devuelve propuesta visible, sin aplicar aún.", parameters: { type: "object", properties: {
    target_duration_s: { type: "number" }, summary: { type: "string", description: "Qué historia conserva: gancho, argumento y cierre, según el brief" },
    ranges: { type: "array", items: { type: "object", properties: { start_s: { type: "number" }, end_s: { type: "number" }, reason: { type: "string" } }, required: ["start_s", "end_s", "reason"], additionalProperties: false } },
  }, required: ["target_duration_s", "summary", "ranges"], additionalProperties: false } },
  { name: "apply_edit_plan", description: "Aplica la propuesta de create_edit_plan en un paso de Deshacer. Úsala cuando el usuario pide resumir/editar; si solo pidió proponer, espera a que pida aplicar.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  {
    name: "search_visual",
    description: "Busca acciones u objetos VISIBLEs en un clip mediante visión local, incluso sin diálogo. Devuelve rangos aproximados de 1 s y evidencia. No edita. Máximo 60 s de clip; usa el clip seleccionado si no indicas id.",
    parameters: { type: "object", properties: { clip_id: { type: "string" }, query: { type: "string", description: "Qué se ve, por ejemplo: el plano donde enseña el teléfono" } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "split_clip_range",
    description: "Crea cortes en los dos bordes de un rango de UN clip, sin desplazar otras pistas. Devuelve el id del fragmento para ediciones posteriores. Inicio/fin son tiempos de la línea de tiempo. Un paso de deshacer.",
    parameters: { type: "object", properties: { clip_id: { type: "string" }, start_s: { type: "number" }, end_s: { type: "number" } }, required: ["clip_id", "start_s", "end_s"], additionalProperties: false },
  },
  {
    name: "process_audio",
    description: "Procesa localmente el audio del rango visible del clip: clean reduce ruido y nivela; separate separa voz y acompañamiento; separate-clean separa y limpia voz. Crea pistas editables y silencia el original; Deshacer lo restaura. Música y ambiente no se separan entre sí. Máximo 180 s. Usa la selección si no indicas id.",
    parameters: { type: "object", properties: { clip_id: { type: "string" }, mode: { type: "string", enum: ["clean", "separate", "separate-clean"] } }, required: ["mode"], additionalProperties: false },
  },
  {
    name: "restore_original_audio",
    description: "Restaura el sonido original del clip y retira sus pistas de audio procesado. Usa la selección si no indicas id.",
    parameters: { type: "object", properties: { clip_id: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "get_project_state",
    description:
      "Devuelve el estado actual del proyecto: pistas, clips (con id, inicio y fin en segundos), transcripción con tiempos, archivos importados y sonidos de Foley disponibles. Úsala antes de editar si no conoces los ids o los tiempos.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "remove_silences",
    description: "Corta automáticamente las pausas sin voz de los clips en B1 (jump cuts). Transcribe el video si hace falta.",
    parameters: {
      type: "object",
      properties: { min_silence_s: { type: "number", description: "Pausa mínima a cortar, en segundos (por defecto 0.5)" } },
      additionalProperties: false,
    },
  },
  {
    name: "generate_captions",
    description: "Transcribe el video (si hace falta) y crea subtítulos automáticos en la pista SUB, reemplazando los anteriores.",
    parameters: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["karaoke", "palabra", "bloque"], description: "karaoke = resalta la palabra que se dice; palabra = una palabra a la vez; bloque = texto con fondo" },
        words_per_caption: { type: "number", description: "Palabras por bloque (1 a 5, por defecto 3)" },
        highlight_color: color,
        color,
        font,
        font_size: { type: "number", description: "Tamaño en px sobre un video de 1080x1920 (por defecto 78)" },
        uppercase: { type: "boolean" },
        position,
      },
      additionalProperties: false,
    },
  },
  {
    name: "style_captions",
    description: "Cambia el estilo de TODOS los subtítulos existentes sin regenerarlos.",
    parameters: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["karaoke", "palabra", "bloque"] },
        highlight_color: color,
        color,
        font,
        font_size: { type: "number" },
        uppercase: { type: "boolean" },
        stroke: { type: "boolean", description: "Contorno negro" },
        position,
      },
      additionalProperties: false,
    },
  },
  {
    name: "add_text",
    description: "Agrega un texto (ej. un hook, un precio, un llamado a la acción) en la pista T1.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
        start_s: { type: "number" },
        duration_s: { type: "number" },
        position,
        font,
        font_size: { type: "number", description: "Por defecto 64" },
        color,
        background: { type: "boolean", description: "Caja oscura detrás del texto" },
      },
      required: ["text", "start_s", "duration_s"],
      additionalProperties: false,
    },
  },
  {
    name: "update_text",
    description: "Modifica un texto existente de la pista T1 (por id).",
    parameters: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        text: { type: "string" },
        position,
        font,
        font_size: { type: "number" },
        color,
        background: { type: "boolean" },
      },
      required: ["clip_id"],
      additionalProperties: false,
    },
  },
  {
    name: "split_at",
    description: "Corta (como la cuchilla de Premiere) todos los clips que pasan por ese segundo.",
    parameters: {
      type: "object",
      properties: { time_s: { type: "number" } },
      required: ["time_s"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_clip",
    description: "Borra un clip. Con ripple=true cierra el hueco moviendo los clips siguientes.",
    parameters: {
      type: "object",
      properties: { clip_id: { type: "string" }, ripple: { type: "boolean" } },
      required: ["clip_id"],
      additionalProperties: false,
    },
  },
  {
    name: "move_clip",
    description: "Mueve un clip y su pareja enlazada en el tiempo; opcionalmente cambia la pista del clip indicado a otra del mismo tipo.",
    parameters: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        start_s: { type: "number" },
        track: { type: "string", description: "Nombre visible o ID de una pista existente del mismo tipo" },
      },
      required: ["clip_id", "start_s"],
      additionalProperties: false,
    },
  },
  {
    name: "trim_clip",
    description: "Ajusta dónde empieza y/o termina un clip en la línea de tiempo (segundos).",
    parameters: {
      type: "object",
      properties: { clip_id: { type: "string" }, start_s: { type: "number" }, end_s: { type: "number" } },
      required: ["clip_id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_volume",
    description: "Cambia el volumen de un clip de video o audio, y opcionalmente sus fades (solo audio).",
    parameters: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        volume_percent: { type: "number", description: "0 a 100" },
        fade_in_s: { type: "number" },
        fade_out_s: { type: "number" },
      },
      required: ["clip_id"],
      additionalProperties: false,
    },
  },
  {
    name: "add_media",
    description:
      "Inserta un archivo importado en una pista existente por nombre o ID. Video completo crea también su audio enlazado; una pista Audio recibe solo el sonido. Consulta get_project_state.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Parte del nombre del archivo" },
        track: { type: "string", description: "Ej. B1, B3, Audio 1, Audio 4, o su ID" },
        start_s: { type: "number", description: "Inicio; si se omite, video al final de su pista y audio en cero" },
        volume_percent: { type: "number" },
      },
      required: ["name", "track"],
      additionalProperties: false,
    },
  },
  {
    name: "add_sound_effect",
    description: "Agrega un efecto de sonido de la biblioteca de Foley (buscado por nombre o carpeta, ej. 'whoosh', 'pop') en Audio 3 (ID A2).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        time_s: { type: "number" },
        volume_percent: { type: "number", description: "Por defecto 80" },
      },
      required: ["query", "time_s"],
      additionalProperties: false,
    },
  },
  {
    name: "undo",
    description: "Deshace los últimos cambios.",
    parameters: {
      type: "object",
      properties: { steps: { type: "number", description: "Cuántos pasos (por defecto 1)" } },
      additionalProperties: false,
    },
  },
];

export const SYSTEM_PROMPT = `Eres el asistente de edición de UGC Studio, un editor de video para anuncios UGC verticales (9:16) dirigido por conversación y voz.
El usuario es editor de video profesional y te habla en español. Responde en español, breve y directo.

Cómo trabajas:
- Editas el proyecto usando las herramientas. Nunca digas que hiciste algo sin haber llamado la herramienta.
- Si necesitas ids de clips, tiempos o el texto hablado, llama primero a get_project_state.
- Los tiempos son en segundos. Las pistas visibles son B1, B2... y Audio 1, Audio 2... sin roles prefijados. Consulta nombres e IDs con get_project_state; add_track crea más. V1/V2 y A0/A1/A2 son IDs antiguos internos, no sus nombres visibles. T1 es texto y SUB subtítulos.
- Colocar/mover/extender clips en una pista ocupada SOBRESCRIBE ese tramo, conservando los extremos y el audio enlazado; no superpone clips de una misma pista. Para superponer imagen usa otra pista B. Respeta los candados y no desbloquees sin petición explícita. set_track_state controla bloqueo, salida y destino; estas opciones se guardan y afectan al export.
- Los pares video/audio están enlazados: mover, recortar, cortar o borrar uno modifica su pareja. No repitas la misma edición sobre ambos IDs ni actives el sonido embebido de un video cuyo audio ya está separado.
- Si una herramienta devuelve un error, explícalo en pocas palabras y propone qué hacer.
- Al terminar, confirma en 1 o 2 frases qué cambiaste. No repitas datos técnicos (ids) salvo que te los pidan.
- El estado incluye selección y cabezal: úsalos para resolver referencias como "este clip".
- Para encontrar acciones u objetos visibles usa search_visual. La transcripción no describe lo que se ve. No afirmes haber visto algo sin evidencia de esta herramienta. Los rangos son aproximados; comunica la incertidumbre y permite ajuste manual.
- Usa process_audio para limpiar o separar el sonido, también cuando el usuario lo pide por voz. Con música mezclada, separate-clean aísla primero la voz. Los resultados no garantizan reparar saturación ni eliminar toda reverberación. Música y ambiente quedan juntos.
- Para modificar un fragmento localizado, split_clip_range devuelve su id. No ejecutes cortes ni limpiezas cuando el usuario solo pide buscar o analizar.
- Para resumir a una duración: get_project_state, read_transcript, create_edit_plan y apply_edit_plan. Conserva gancho, argumento y cierre que existan en el material y respeten el brief. Elige frases completas en orden; no inventes diálogo, no aceleres ni te limites a truncar el inicio del video. Comprueba la suma de segundos y aprovecha pausas para ajustar la duración exacta. Si no hay evidencia o no puedes conservar el sentido en ese tiempo, explícalo.
- Los rangos de create_edit_plan son tiempos del montaje original, ordenados y sin solaparse. Solo apply_edit_plan modifica el timeline; aplica si el usuario pidió ejecutar el resumen. Si una validación falla, corrige la propuesta sin hacer cortes sueltos alternativos.

Criterio editorial:
- Respeta el brief, las decisiones de Lino, la tipografía, composición, timing y easing solicitados.
- Conserva pausas y gestos que aporten al relato. Recorta silencios cuando lo pida o cuando el objetivo del montaje lo requiera.
- Propón Foley motivado por la acción y mezcla que preserve la voz. No añadas efectos automáticamente a todos los cortes.
- Mantén subtítulos legibles y considera las zonas tapadas por las interfaces sociales. No impongas un estilo si el usuario no lo pidió.`;
