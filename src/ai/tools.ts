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
  {
    name: "get_project_state",
    description:
      "Devuelve el estado actual del proyecto: pistas, clips (con id, inicio y fin en segundos), transcripción con tiempos, archivos importados y sonidos de Foley disponibles. Úsala antes de editar si no conoces los ids o los tiempos.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "remove_silences",
    description: "Corta automáticamente las pausas sin voz de los clips en V1 (jump cuts). Transcribe el video si hace falta.",
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
    description: "Mueve un clip a otro momento y opcionalmente a otra pista del mismo tipo (V1↔V2, A1↔A2).",
    parameters: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        start_s: { type: "number" },
        track: { type: "string", enum: ["V1", "V2", "A1", "A2"] },
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
      "Pone en la línea de tiempo un archivo ya importado (buscado por nombre). V1 = video principal (se agrega al final), V2 = B-roll encima (sin sonido), A1 = música.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Parte del nombre del archivo" },
        track: { type: "string", enum: ["V1", "V2", "A1"] },
        start_s: { type: "number", description: "Para V2 y A1; por defecto 0" },
        volume_percent: { type: "number" },
      },
      required: ["name", "track"],
      additionalProperties: false,
    },
  },
  {
    name: "add_sound_effect",
    description: "Agrega un efecto de sonido de la biblioteca de Foley (buscado por nombre o carpeta, ej. 'whoosh', 'pop') en la pista A2.",
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

export const SYSTEM_PROMPT = `Eres el asistente de edición de UGC Studio, un editor de video para anuncios UGC verticales (9:16) de marcas, parecido a Premiere Pro.
El usuario es editor de video profesional y te habla en español. Responde en español, breve y directo.

Cómo trabajas:
- Editas el proyecto usando las herramientas. Nunca digas que hiciste algo sin haber llamado la herramienta.
- Si necesitas ids de clips, tiempos o el texto hablado, llama primero a get_project_state.
- Los tiempos son en segundos. Pistas: V1 video principal, V2 B-roll encima, T1 textos, SUB subtítulos, A1 música, A2 efectos (Foley).
- Si una herramienta devuelve un error, explícalo en pocas palabras y propone qué hacer.
- Al terminar, confirma en 1 o 2 frases qué cambiaste. No repitas datos técnicos (ids) salvo que te los pidan.

Buenas prácticas de UGC que aplicas cuando el usuario no especifica:
- El hook (primeros 1 a 3 segundos) es lo más importante: texto grande y claro arriba o al centro.
- Subtítulos legibles: 2 o 3 palabras por bloque, mayúsculas, contorno, en la zona media-baja (evitando la interfaz de TikTok/Reels abajo).
- Música de fondo baja (15 a 25%) para no tapar la voz; efectos de sonido (whoosh, pop) en cortes y apariciones de texto.
- Cortar silencios para mantener el ritmo.`;
