// Arabic speech-to-text for the Friday-sermon reel.
// Workers AI is the default (no secret). OPENAI_API_KEY is an optional upgrade that
// asks Whisper for word timestamps. Neither path invents timings: if the provider
// returns text without word or segment times, the call fails and the studio asks
// the manager to type cue times.

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptResult {
  text: string;
  words: TranscriptWord[];
  granularity: "word" | "segment";
  provider: "workers-ai" | "openai";
}

export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

const TURBO = "@cf/openai/whisper-large-v3-turbo";
const CLASSIC = "@cf/openai/whisper";

type RunAI = (model: string, input: Record<string, unknown>) => Promise<unknown>;

interface TimedToken {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
  no_speech_prob?: number;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function tokenWord(token: TimedToken): TranscriptWord | null {
  const word = String(token.word ?? token.text ?? "").replace(/\s+/g, " ").trim();
  const start = num(token.start);
  const end = num(token.end);
  if (!word || start === null || end === null) return null;
  return { word, start, end: end < start ? start : end };
}

function readTokens(value: unknown): TimedToken[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object") as TimedToken[];
}

/** Keep timed tokens only. Drops entries that have text but no start/end. */
export function wordsFromTokens(tokens: TimedToken[]): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const token of tokens) {
    const word = tokenWord(token);
    if (word) words.push(word);
  }
  words.sort((a, b) => a.start - b.start);
  return words.slice(0, 2500);
}

export function parseVtt(vtt: string): TranscriptWord[] {
  const lines = String(vtt || "").split(/\r?\n/);
  const timeRe = /(\d{2}):(\d{2}):(\d{2}[.,]\d{1,3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}[.,]\d{1,3})/;
  const toSec = (h: string, m: string, s: string) => Number(h) * 3600 + Number(m) * 60 + Number(s.replace(",", "."));
  const words: TranscriptWord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(timeRe);
    if (!match) continue;
    const start = toSec(match[1] ?? "0", match[2] ?? "0", match[3] ?? "0");
    const end = toSec(match[4] ?? "0", match[5] ?? "0", match[6] ?? "0");
    const text: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? "";
      if (!line.trim() || timeRe.test(line)) break;
      text.push(line.trim());
    }
    const word = text.join(" ").trim();
    if (word && Number.isFinite(start) && Number.isFinite(end)) {
      words.push({ word, start, end: end < start ? start : end });
    }
  }
  return words.slice(0, 2500);
}

export function wordsFromWhisper(raw: unknown, depth = 0): { text: string; words: TranscriptWord[]; granularity: "word" | "segment" } {
  const body = asRecord(raw);
  const nested = depth < 2 && body.result && typeof body.result === "object"
    ? wordsFromWhisper(body.result, depth + 1)
    : null;
  if (nested && nested.words.length) return nested;

  const text = typeof body.text === "string" ? body.text : nested?.text ?? "";
  const topWords = wordsFromTokens(readTokens(body.words));
  if (topWords.length) return { text: text || topWords.map((w) => w.word).join(" "), words: topWords, granularity: "word" };

  const segments = readTokens(body.segments);
  const nestedWords: TranscriptWord[] = [];
  const segmentCues: TranscriptWord[] = [];
  for (const segment of segments) {
    const spoken = wordsFromTokens(readTokens((segment as { words?: unknown }).words));
    if (spoken.length) nestedWords.push(...spoken);
    const cue = tokenWord(segment);
    if (cue) segmentCues.push(cue);
  }
  if (nestedWords.length) {
    nestedWords.sort((a, b) => a.start - b.start);
    return { text, words: nestedWords.slice(0, 2500), granularity: "word" };
  }
  if (segmentCues.length) {
    segmentCues.sort((a, b) => a.start - b.start);
    return { text, words: segmentCues.slice(0, 2500), granularity: "segment" };
  }

  const vtt = typeof body.vtt === "string" ? parseVtt(body.vtt) : [];
  if (vtt.length) {
    const granularity = vtt.every((word) => !word.word.includes(" ")) ? "word" : "segment";
    return { text, words: vtt, granularity };
  }
  return { text, words: [], granularity: "word" };
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function runTurbo(run: RunAI, bytes: ArrayBuffer): Promise<TranscriptResult> {
  const raw = await run(TURBO, {
    audio: bytesToBase64(bytes),
    task: "transcribe",
    language: "ar",
    vad_filter: false,
    condition_on_previous_text: false,
    initial_prompt: "بسم الله الرحمن الرحيم. خطبة الجمعة.",
  });
  const parsed = wordsFromWhisper(raw);
  if (!parsed.words.length) throw new Error("Workers AI لم يُرجع توقيتاً");
  return { ...parsed, provider: "workers-ai" };
}

async function runClassic(run: RunAI, bytes: ArrayBuffer): Promise<TranscriptResult> {
  if (bytes.byteLength > 900_000) throw new Error("المقطع أكبر من حد نموذج whisper الكلاسيكي");
  const raw = await run(CLASSIC, { audio: Array.from(new Uint8Array(bytes)) });
  const parsed = wordsFromWhisper(raw);
  if (!parsed.words.length) throw new Error("Workers AI لم يُرجع توقيتاً");
  return { ...parsed, provider: "workers-ai" };
}

export async function transcribeWithWorkersAI(run: RunAI, bytes: ArrayBuffer): Promise<TranscriptResult> {
  try {
    return await runTurbo(run, bytes);
  } catch (turboErr) {
    try {
      return await runClassic(run, bytes);
    } catch (classicErr) {
      const turbo = turboErr instanceof Error ? turboErr.message : "turbo";
      const classic = classicErr instanceof Error ? classicErr.message : "classic";
      throw new Error(`${turbo} / ${classic}`);
    }
  }
}

export async function transcribeWithOpenAI(apiKey: string, bytes: ArrayBuffer, mime: string): Promise<TranscriptResult> {
  const type = mime || "audio/mpeg";
  const name = type.includes("wav") ? "clip.wav" : type.includes("mp4") ? "clip.m4a" : "clip.mp3";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  form.append("model", "whisper-1");
  form.append("language", "ar");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}`);
  }
  const parsed = wordsFromWhisper(await res.json());
  if (!parsed.words.length) throw new Error("OpenAI لم يُرجع توقيتاً");
  return { ...parsed, provider: "openai" };
}

export interface TranscribeEnv {
  workers?: RunAI;
  openAiKey?: string;
}

export async function transcribeAudio(env: TranscribeEnv, bytes: ArrayBuffer, mime: string): Promise<TranscriptResult> {
  const errors: string[] = [];
  if (env.workers) {
    try {
      return await transcribeWithWorkersAI(env.workers, bytes);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "workers-ai");
    }
  } else {
    errors.push("ربط Workers AI غير موجود");
  }
  if (env.openAiKey) {
    try {
      return await transcribeWithOpenAI(env.openAiKey, bytes, mime);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "openai");
    }
  }
  throw new Error(errors.join(" — ") || "لا توقيت");
}

const AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/octet-stream",
]);

export function audioMime(type: string, filename: string): string | null {
  const clean = type.toLowerCase().split(";")[0]?.trim() ?? "";
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (AUDIO_TYPES.has(clean) && clean !== "application/octet-stream") return clean;
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "webm") return "audio/webm";
  if (clean === "application/octet-stream" && ["mp3", "wav", "m4a", "mp4", "webm"].includes(ext)) {
    return ext === "mp3" ? "audio/mpeg" : "audio/wav";
  }
  return null;
}
