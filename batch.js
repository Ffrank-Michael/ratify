// Runs the AI agent against many models, several times each, and prints one table.
// The AI calls are real (NEAR AI Cloud). Veto runs in demo mode, so no real NEAR is spent.
//   node --env-file=.env batch.js
const { spawn } = require("child_process");
const fs = require("fs");

const RUNS = 3;
const MODELS = [
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

// Run one model in its own process, so each has its own fresh Veto
function runModel(model, index) {
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, ["ai-agent.js", "--batch", model, String(RUNS)], {
      env: Object.assign({}, process.env, { VETO_RECORD_FILE: "records-batch-" + index + ".json" })
    });
    let out = "";
    child.stdout.on("data", function (d) { out += d; });
    child.stderr.on("data", function (d) { out += d; });
    child.on("close", function () {
      const lines = out.trim().split("\n");
      try {
        resolve(JSON.parse(lines[lines.length - 1]));
      } catch (err) {
        resolve({ model: model, runs: [{ error: out.slice(0, 300) }] });
      }
    });
  });
}

async function main() {
  console.log("Testing " + MODELS.length + " models, " + RUNS + " runs each. This can take several minutes.");
  console.log("");

  // Three models at a time
  const results = [];
  for (let i = 0; i < MODELS.length; i += 3) {
    const group = MODELS.slice(i, i + 3).map(function (m, j) { return runModel(m, i + j); });
    const done = await Promise.all(group);
    for (const r of done) {
      results.push(r);
      console.log("Finished: " + r.model);
    }
  }

  fs.writeFileSync("ai-results.json", JSON.stringify({ date: new Date().toISOString(), runsPerModel: RUNS, results: results }, null, 2));

  console.log("");
  console.log("Model".padEnd(40) + "Traps AI paid".padEnd(16) + "Stopped by Veto".padEnd(18) + "Honest paid");
  const trapCounts = {};
  for (const r of results) {
    const good = r.runs.filter(function (x) { return !x.error; });
    if (good.length === 0) {
      console.log(r.model.padEnd(40) + "ERROR: " + String(r.runs[0].error).slice(0, 80));
      continue;
    }
    let paid = 0, total = 0, stopped = 0, honest = 0, honestTotal = 0;
    for (const x of good) {
      paid += x.aiPaidTraps.length; total += x.trapsTotal; stopped += x.vetoStopped;
      honest += x.honestPaid; honestTotal += x.honestTotal;
      for (const t of x.aiPaidTraps) trapCounts[t] = (trapCounts[t] || 0) + 1;
    }
    const note = good.length < r.runs.length ? " (" + (r.runs.length - good.length) + " run failed)" : "";
    console.log(r.model.padEnd(40) + (paid + " of " + total).padEnd(16) + (stopped + " of " + paid).padEnd(18) + honest + " of " + honestTotal + note);
  }

  console.log("");
  console.log("Which traps the AIs fell for (all runs together):");
  for (const t of Object.keys(trapCounts)) console.log("   " + t + ": " + trapCounts[t]);
  console.log("");
  console.log("Full results saved to ai-results.json");
}

main();