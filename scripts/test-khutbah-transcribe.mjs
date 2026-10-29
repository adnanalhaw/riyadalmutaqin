import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const src = fs.readFileSync(new URL("../src/khutbah-transcribe.ts", import.meta.url), "utf8");
const out = await esbuild.transform(src, { loader: "ts", format: "esm" });
const file = path.join(os.tmpdir(), "khutbah-transcribe-test.mjs");
fs.writeFileSync(file, out.code);
const { parseVtt, wordsFromWhisper } = await import(pathToFileURL(file).href);

test("word payloads keep provider timestamps", () => {
  const parsed = wordsFromWhisper({
    text: "نفع الناس",
    words: [
      { word: " نفع", start: 0.1, end: 0.4 },
      { word: "الناس", start: 0.4, end: 0.9 },
    ],
  });
  assert.equal(parsed.granularity, "word");
  assert.equal(parsed.words[0]?.word, "نفع");
  assert.equal(parsed.words[0]?.start, 0.1);
  assert.equal(parsed.words[1]?.end, 0.9);
});

test("segment text is not split into fake word times", () => {
  const parsed = wordsFromWhisper({
    text: "قال رسول الله نفع الناس",
    segments: [{ text: "قال رسول الله نفع الناس", start: 3, end: 6.5 }],
  });
  assert.equal(parsed.granularity, "segment");
  assert.equal(parsed.words.length, 1);
  assert.equal(parsed.words[0]?.start, 3);
  assert.equal(parsed.words[0]?.end, 6.5);
  assert.equal(parsed.words[0]?.word, "قال رسول الله نفع الناس");
});

test("segment word arrays are flattened when present", () => {
  const parsed = wordsFromWhisper({
    text: "نفع الناس",
    segments: [{
      start: 0,
      end: 1,
      text: "نفع الناس",
      words: [
        { word: "نفع", start: 0.05, end: 0.4 },
        { word: "الناس", start: 0.4, end: 0.95 },
      ],
    }],
  });
  assert.equal(parsed.granularity, "word");
  assert.equal(parsed.words.length, 2);
  assert.equal(parsed.words[1]?.start, 0.4);
});

test("text without timings yields no words", () => {
  const parsed = wordsFromWhisper({ text: "نفع الناس فقط" });
  assert.deepEqual(parsed.words, []);
});

test("vtt cues become timed tokens", () => {
  const words = parseVtt("WEBVTT\n\n00:00:01.000 --> 00:00:01.500\nنفع\n\n00:00:01.500 --> 00:00:02.250\nالناس\n");
  assert.equal(words.length, 2);
  assert.equal(words[0]?.word, "نفع");
  assert.equal(words[0]?.start, 1);
  assert.equal(words[1]?.end, 2.25);
});
