import test from "node:test";
import assert from "node:assert/strict";

// Helper simulations matching review.html / build-review-page.mjs logic
function updateQueryStateSim(baseHref, task, t) {
  const u = new URL(baseHref);
  if (t !== undefined && t !== null && !isNaN(t)) u.searchParams.set("t", Number(t).toFixed(2));
  if (task && task.id) u.searchParams.set("task", task.id);
  return u.pathname + u.search + u.hash;
}

function restoreStateFromQuerySim(search, allTasks) {
  const p = new URLSearchParams(search);
  const qTask = p.get("task");
  const qT = p.get("t");
  let foundTask = null;
  let chosenIdx = 0;

  if (qTask) {
    const fIdx = allTasks.findIndex((x) => x.id === qTask || x.alias === qTask);
    if (fIdx >= 0) {
      chosenIdx = fIdx;
      foundTask = allTasks[fIdx];
    }
  }

  let jumpTarget = null;
  if (qT !== null && qT !== "") {
    const sec = parseFloat(qT);
    if (!isNaN(sec)) {
      if (!foundTask) foundTask = allTasks[chosenIdx];
      jumpTarget = (foundTask && typeof foundTask.preRollT === "number") ? foundTask.preRollT : sec;
    }
  }

  return { chosenIdx, foundTask, jumpTarget };
}

test("Review query state serialization & restoration round-trip", () => {
  const sampleTasks = [
    { id: "task-intro", title: "Intro hook", t: 5.0, preRollT: null },
    { id: "fb-1270-38a4", title: "Remove audio bam", t: 42.03, preRollT: 40.0 },
    { id: "task-cta", title: "Outro CTA", t: 230.0, preRollT: 228.0 },
  ];

  // 1. Serialization
  const updatedUrl = updateQueryStateSim("http://localhost:30080/review.html", sampleTasks[1], sampleTasks[1].t);
  assert.equal(updatedUrl, "/review.html?t=42.03&task=fb-1270-38a4");

  // 2. Deserialization & Pre-Roll jump calculation
  const searchPart = "?t=42.03&task=fb-1270-38a4";
  const restored = restoreStateFromQuerySim(searchPart, sampleTasks);

  assert.equal(restored.chosenIdx, 1);
  assert.equal(restored.foundTask.id, "fb-1270-38a4");
  // Critical audition requirement: jumpTarget should use preRollT (40.0) rather than cutting off at 42.03
  assert.equal(restored.jumpTarget, 40.0, "Should use preRollT for audio auditioning");
});

test("Review query state fallback when task not found", () => {
  const sampleTasks = [
    { id: "task-0", title: "First task", t: 10.0 },
  ];
  const searchPart = "?t=15.50&task=non-existent";
  const restored = restoreStateFromQuerySim(searchPart, sampleTasks);

  assert.equal(restored.chosenIdx, 0);
  assert.equal(restored.jumpTarget, 15.5);
});
