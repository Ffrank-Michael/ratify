// Runs the AI agent against many models, several times each, and prints one table.
// The AI calls are real (NEAR AI Cloud). Ratify runs in demo mode, so no real NEAR is spent.
//   node --env-file=.env batch.js                     (all models below)
//   node --env-file=.env batch.js moonshotai/kimi-k3  (only the models you name)
// Results are merged into ai-results.json, so rerunning one model keeps the others.
const { spawn } = require("child_process");
const fs = require("fs");

const RUNS = 3;
const ALL_MODELS = [
  "z-ai/glm-5.3-flash",
  "openai/gpt-6-luna",
  "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  "anthropic/claude-haiku-5-5",
  "Qwen/Qwen3.8-27B",
  "google/gemini-3.8-flash",
  "openai/gpt-6.1-sol",
  "moonshotai/kimi-k3",
  "anthropic/claude-opus-5-5"
];
const MODELS = process.argv.length > 2 ? process.argv.slice(2) : ALL_MODELS;
const RESULTS_FILE = "ai-results.json";

// Run one model in its own process, so each has its own fresh Ratify
function runModel(model, index) {
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, ["ai-agent.js", "--batch", model, String(RUNS)], {
      env: Object.assign({}, process.env, { RATIFY_RECORD_FILE: "records-batch-" + index + ".json" })
    });
    let out = "";
    child.stdout.on("data", function (d) { out += d; });
    child.stderr.on("data", function (d) { out += d; });
    child.on("close", function () {
      const lines = out.trim().split("\n");
      try {
        const r = JSON.parse(lines[lines.length - 1]);
        r.date = new Date().toISOString();
        resolve(r);
      } catch (err) {
        resolve({ model: model, date: new Date().toISOString(), runs: [{ error: out.slice(0, 300) }] });
      }
    });
  });
}

function loadResults() {
  if (!fs.existsSync(RESULTS_FILE)) return [];
  const saved = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
  return saved.results.map(function (r) { if (!r.date) r.date = saved.date; return r; });
}

function printTable(results) {
  console.log("Model".padEnd(40) + "Traps AI paid".padEnd(16) + "Stopped by Ratify".padEnd(18) +
    "Honest paid".padEnd(14) + "AI skipped honest".padEnd(20) + "Ratify blocked honest");
  const trapCounts = {};
  for (const r of results) {
    const good = r.runs.filter(function (x) { return !x.error; });
    if (good.length === 0) {
      console.log(r.model.padEnd(40) + "ERROR: " + String(r.runs[0].error).slice(0, 80));
      continue;
    }
    let paid = 0, total = 0, stopped = 0, honest = 0, honestTotal = 0;
    let skipped = 0, blocked = 0, splitKnown = true;
    for (const x of good) {
      paid += x.aiPaidTraps.length; total += x.trapsTotal; stopped += x.ratifyStopped;
      honest += x.honestPaid; honestTotal += x.honestTotal;
      if (x.honestSkippedByAI === undefined) splitKnown = false;
      else { skipped += x.honestSkippedByAI; blocked += x.honestBlockedByRatify; }
      for (const t of x.aiPaidTraps) trapCounts[t] = (trapCounts[t] || 0) + 1;
    }
    const note = good.length < r.runs.length ? " (" + (r.runs.length - good.length) + " run failed)" : "";
    console.log(r.model.padEnd(40) + (paid + " of " + total).padEnd(16) + (stopped + " of " + paid).padEnd(18) +
      (honest + " of " + honestTotal).padEnd(14) +
      (splitKnown ? String(skipped) : "not recorded").padEnd(20) + (splitKnown ? String(blocked) : "not recorded") + note);
  }
  console.log("");
  console.log("Which traps the AIs fell for (all runs together):");
  for (const t of Object.keys(trapCounts)) console.log("   " + t + ": " + trapCounts[t]);
  console.log("");
}

async function main() {
  console.log("Testing " + MODELS.length + " model(s), " + RUNS + " runs each. This can take several minutes.");
  console.log("");

  const fresh = [];
  for (let i = 0; i < MODELS.length; i += 3) {
    const group = MODELS.slice(i, i + 3).map(function (m, j) { return runModel(m, i + j); });
    const done = await Promise.all(group);
    for (const r of done) {
      fresh.push(r);
      console.log("Finished: " + r.model);
    }
  }

  // Merge: new results replace old ones for the same model, others are kept
  const results = loadResults();
  for (const r of fresh) {
    const i = results.findIndex(function (old) { return old.model === r.model; });
    const allFailed = r.runs.every(function (x) { return x.error; }); if (i === -1) results.push(r); else if (allFailed) console.log("Kept the older results for " + r.model + " because this run failed.");
    else results[i] = r;
  }
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ runsPerModel: RUNS, results: results }, null, 2));

  console.log("");
  printTable(results);
  console.log("All results saved in " + RESULTS_FILE);
}

main();