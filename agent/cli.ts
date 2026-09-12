#!/usr/bin/env npx tsx

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  analyzeTrendSignals,
  DATA_REPORTS_DIR,
  fetchLiveSocialTrends,
  generateCampaignPlaybook,
  TRENDS_CONTRACT_PATH,
} from "./src/index.ts";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  rose: "\x1b[91m",
};

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
MiseEnVue agent CLI

  npx tsx agent/cli.ts --topic "Crispy Smash Falafel"
  npm run pipeline --prefix agent -- --contract
`);
  process.exit(0);
}

if (args.includes("--contract")) {
  if (!fs.existsSync(TRENDS_CONTRACT_PATH)) {
    console.error(`${C.rose}Error:${C.reset} ${TRENDS_CONTRACT_PATH} not found.`);
    process.exit(1);
  }

  const contractData = JSON.parse(fs.readFileSync(TRENDS_CONTRACT_PATH, "utf-8"));
  const dishes = contractData.dishes || [];
  console.log(`\nPart 1 contract: ${dishes.length} dishes in data/out/trends.json`);
  dishes.forEach((dish: { name: string; trend_score?: number }, index: number) => {
    console.log(`  ${index + 1}. ${dish.name}  trend_score=${dish.trend_score ?? "?"}`);
  });
  console.log("\nOpportunity scores live in Supabase, not this file.\n");
  process.exit(0);
}

async function promptInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (query: string) => new Promise<string>((resolve) => rl.question(query, resolve));
  const custom = await question("Trend topic (Enter for default falafel): ");
  rl.close();
  return custom.trim() || "Crispy Smash Falafel with Whipped Feta";
}

async function main() {
  let topic = "Crispy Smash Falafel with Whipped Feta";
  let apiKey: string | undefined;

  if (args.includes("-i") || args.includes("--interactive")) {
    topic = await promptInteractive();
  } else {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--topic" && args[i + 1]) topic = args[i + 1];
      if (args[i] === "--key" && args[i + 1]) apiKey = args[i + 1];
    }
  }

  console.log(`\n${C.bold}Topic:${C.reset} ${topic}`);
  const trendResult = await fetchLiveSocialTrends(topic, apiKey);
  console.log(`Signals: ${trendResult.signals.length}`);

  const analysis = await analyzeTrendSignals(topic, trendResult.signals, { apiKey });
  console.log("\n--- Analysis ---\n");
  console.log(analysis.analysisText);

  const playbook = await generateCampaignPlaybook(topic, analysis.analysisText, { apiKey });
  console.log("\n--- Playbook ---\n");
  console.log(playbook.playbookText);

  fs.mkdirSync(DATA_REPORTS_DIR, { recursive: true });
  const safeTopic = topic.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const filename = path.join(DATA_REPORTS_DIR, `trend_strategy_${safeTopic}_${Date.now()}.md`);
  fs.writeFileSync(
    filename,
    `# ${topic}\n\n## Analysis\n${analysis.analysisText}\n\n## Playbook\n${playbook.playbookText}\n`,
  );
  console.log(`\n${C.green}Saved${C.reset} ${filename}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
