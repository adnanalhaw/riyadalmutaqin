import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../public/teacher/khutbah-cues.js", import.meta.url), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const Cues = sandbox.KhutbahCues;

test("empty transcript yields no cues and no invented times", () => {
  assert.equal(Cues.buildCues([]).length, 0);
  assert.equal(Cues.buildCues([{ word: "نفع" }]).length, 0);
  assert.equal(Cues.buildCues([{ word: "نفع", start: 1 }]).length, 0);
});

test("word timings are preserved and not resampled", () => {
  const cues = Cues.buildCues([
    { word: "نفع", start: 0.2, end: 0.6 },
    { word: "الناس", start: 0.6, end: 1.1 },
  ]);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 0.2);
  assert.equal(cues[0].end, 0.6);
  assert.equal(cues[1].text, "الناس");
  assert.equal(cues[1].start, 0.6);
});

test("long speech is grouped without moving the outer bounds", () => {
  const words = [];
  for (let i = 0; i < 40; i++) words.push({ word: "كلمة" + i, start: i * 0.4, end: i * 0.4 + 0.3 });
  const cues = Cues.buildCues(words);
  assert.ok(cues.length <= Cues.MAX_CHUNKS);
  assert.ok(cues.length > 1);
  assert.equal(cues[0].start, 0);
  assert.ok(Math.abs(cues[cues.length - 1].end - (39 * 0.4 + 0.3)) < 0.002);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].start);
});

test("manual card without an end time is ignored", () => {
  const cues = Cues.buildCues([{ word: "خير", start: 0, end: 1 }]);
  const same = Cues.applyManual(cues, { text: "وَافْعَلُوا الْخَيْرَ", type: "quran", at: 0 });
  assert.equal(same[0].kind, cues[0].kind);
  assert.equal(same.length, 1);
});

test("manual card uses only the times the manager entered", () => {
  const cues = Cues.applyManual([], { text: "حديث مختصر", type: "hadith", cite: "رواه مسلم", at: 4, end: 7.5 });
  assert.equal(cues.length, 1);
  assert.equal(cues[0].start, 4);
  assert.equal(cues[0].end, 7.5);
  assert.equal(cues[0].kind, "hadith");
  assert.equal(cues[0].display, "حديث مختصر");
});

test("incomplete manual phrase is rejected", () => {
  const cues = [{ start: 0, end: 1, text: "أصل", kind: "caption" }];
  assert.equal(Cues.addPhrase(cues, { text: "ناقص", start: 2 }), cues);
});

test("adjacent words combine into a quran card without new timings", () => {
  const cues = Cues.buildCues([
    { word: "وَافْعَلُوا", start: 8, end: 8.6 },
    { word: "الْخَيْرَ", start: 8.7, end: 9.4 },
  ]);
  assert.equal(cues[1].kind, "quran");
  assert.match(cues[1].cite, /الحج/);
  assert.equal(cues[1].start, 8.7);
  assert.equal(cues[1].end, 9.4);
});

test("quran phrase is detected from vocalized text", () => {
  const cues = Cues.buildCues([{ word: "وَافْعَلُوا الْخَيْرَ", start: 1, end: 2.4 }]);
  assert.equal(cues[0].kind, "quran");
  assert.match(cues[0].cite, /الحج/);
  assert.match(cues[0].display, /الْخَيْرَ/);
});

test("known hadith fragment becomes a hadith card", () => {
  const hit = Cues.detect("أحب الناس إلى الله أنفعهم للناس");
  assert.equal(hit.kind, "hadith");
  assert.match(hit.cite, /الطبراني/);
});

test("keywords stay sparse on long lines", () => {
  const long = Cues.detect("إن الناس في هذه الخطبة الطويلة يحتاجون إلى التذكير بالصبر");
  assert.equal(long.keywords.some((k) => k.id === "people"), false);
  const short = Cues.detect("الوالدين");
  assert.equal(short.keywords[0].id, "parents");
});

test("display windows hold a phrase until the next one and stop before the outro", () => {
  const cues = [
    { start: 0.5, end: 1.2, text: "أ", kind: "caption" },
    { start: 1.5, end: 2.2, text: "ب", kind: "caption" },
  ];
  const wins = Cues.displayWindows(cues, 10, 7);
  assert.equal(wins[0].end, 1.5);
  assert.equal(wins[1].end, 7);
  assert.equal(Cues.windowAt(cues, 1.3, 10).cue.text, "أ");
});

test("overlay enable expressions escape filtergraph commas", () => {
  const graph = Cues.buildFilter({
    w: 1080,
    h: 1920,
    layers: [
      { x: 0, y: 0 },
      { x: 0, y: 1400, start: 0, end: 1.25 },
      { x: 0, y: 0, start: 8, end: null },
    ],
  });
  assert.match(graph, /\[vout\]$/);
  assert.match(graph, /scale=1080:1920/);
  const enables = graph.match(/enable='[^']+'/g) || [];
  assert.ok(enables.length >= 2);
  for (const enable of enables) {
    assert.equal(enable.includes("\\,"), true, enable);
    assert.equal(/(^|[^\\]),/.test(enable), false, enable);
  }
});
