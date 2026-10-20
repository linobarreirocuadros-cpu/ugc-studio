import type { Word } from "./types";

/** Whisper.cpp entrega subtokens: los espacios iniciales delimitan palabras reales. */
export function wordsFromWhisperTokens(tokens: { text: string; startMs: number; endMs: number; confidence?: number | null }[], fps: number): Word[] {
  const words: Word[] = [];
  for (const token of tokens) {
    const text = token.text.trim();
    if (!text || /^\[.*\]$/.test(text) || !Number.isFinite(token.startMs) || !Number.isFinite(token.endMs)) continue;
    const start = Math.max(0, Math.round(token.startMs * fps / 1000)), end = Math.max(start + 1, Math.round(token.endMs * fps / 1000));
    const previous = words.at(-1), punctuation = /^[.,;:!?…'’]+$/.test(text);
    if (previous && ((!/^\s/.test(token.text) && start <= previous.end + Math.round(fps * 0.3)) || punctuation)) {
      previous.text += text; previous.end = Math.max(previous.end, end);
      if (typeof token.confidence === "number") previous.confidence = Math.min(previous.confidence ?? 1, token.confidence);
    } else words.push({ text, start, end, ...(typeof token.confidence === "number" ? { confidence: token.confidence } : {}) });
  }
  return words;
}
