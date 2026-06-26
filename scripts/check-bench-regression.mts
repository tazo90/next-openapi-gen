#!/usr/bin/env node
/**
 * Compare a vitest bench --outputJson run against a committed baseline and
 * fail when any benchmark regresses beyond the allowed threshold.
 *
 * Usage:
 *   node scripts/check-bench-regression.mts \
 *     --current tests/bench/schema/current.json \
 *     --baseline tests/bench/schema/baseline.json \
 *     [--threshold 0.25]
 *
 * Threshold is the maximum tolerated relative slowdown, expressed as a
 * fraction of the baseline mean time. Default is 50 % (0.5), chosen to
 * be permissive of microbenchmark jitter while still flagging real
 * regressions. Use --threshold to tighten locally.
 *
 * Benchmarks are keyed by their suite + benchmark name. Duplicate entries
 * (e.g. from .pnpm-store mirrors) are deduplicated using the fastest `hz`.
 * Root `test:bench:schema` uses `vitest bench --dir tests/bench/schema` so
 * discovery does not pull mirrored paths under `.pnpm-store/`; otherwise the
 * baseline can reflect cherry-picked fast runs while CI only executes once.
 * New benchmarks that aren't present in the baseline are reported but do
 * not fail the run.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type BenchmarkRecord = {
  name: string;
  hz: number;
  mean: number;
};

type BenchmarkGroup = {
  fullName: string;
  benchmarks: BenchmarkRecord[];
};

type BenchmarkFile = {
  filepath: string;
  groups: BenchmarkGroup[];
};

type BenchmarkReport = {
  files: BenchmarkFile[];
};

type CliArgs = {
  current: string;
  baseline: string;
  threshold: number;
  writeBaseline: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    current: "",
    baseline: "",
    threshold: 0.5,
    writeBaseline: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--current":
        args.current = argv[++i] ?? "";
        break;
      case "--baseline":
        args.baseline = argv[++i] ?? "";
        break;
      case "--threshold":
        args.threshold = Number(argv[++i] ?? "0.5");
        break;
      case "--write-baseline":
        args.writeBaseline = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(2);
    }
  }

  if (!args.current || !args.baseline) {
    console.error("Both --current and --baseline are required.");
    printHelp();
    process.exit(2);
  }

  if (Number.isNaN(args.threshold) || args.threshold < 0) {
    console.error("--threshold must be a non-negative number.");
    process.exit(2);
  }

  return args;
}

function printHelp(): void {
  console.log(
    "Usage: check-bench-regression.mts --current <file> --baseline <file> [--threshold 0.25] [--write-baseline]",
  );
}

function readReport(filePath: string): BenchmarkReport {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw) as BenchmarkReport;
}

type BenchKey = string;

/**
 * Collapse a vitest bench JSON report into `"suite > name"` -> record, taking
 * the fastest observation when the same bench runs multiple times (e.g. from
 * pnpm-store mirrors).
 */
function collectBenchmarks(report: BenchmarkReport): Map<BenchKey, BenchmarkRecord> {
  const map = new Map<BenchKey, BenchmarkRecord>();

  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      const suiteName = stripFilepathPrefix(group.fullName, file.filepath);
      for (const bench of group.benchmarks ?? []) {
        const key = `${suiteName} > ${bench.name}`;
        const existing = map.get(key);
        if (!existing || bench.hz > existing.hz) {
          map.set(key, { name: bench.name, hz: bench.hz, mean: bench.mean });
        }
      }
    }
  }

  return map;
}

function stripFilepathPrefix(fullName: string, filepath: string): string {
  const cwd = process.cwd();
  const rel = path.relative(cwd, filepath);
  if (fullName.startsWith(`${rel} > `)) return fullName.slice(rel.length + 3);
  if (fullName.startsWith(`${filepath} > `)) return fullName.slice(filepath.length + 3);
  return fullName;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const currentReport = readReport(args.current);
  const currentMap = collectBenchmarks(currentReport);

  if (args.writeBaseline) {
    const baseline = {
      generatedAt: new Date().toISOString(),
      threshold: args.threshold,
      notes:
        "Mean-time ratio threshold for regression detection. Microbenchmarks are noisy; keep this value generous and rely on trend analysis for tighter signals.",
      benchmarks: Object.fromEntries(
        [...currentMap.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
      ),
    };
    fs.writeFileSync(path.resolve(args.baseline), `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(
      `Wrote ${currentMap.size} baseline entries to ${path.relative(process.cwd(), args.baseline)}`,
    );
    return;
  }

  const baselineRaw = JSON.parse(fs.readFileSync(path.resolve(args.baseline), "utf8"));
  const baseline = new Map<BenchKey, BenchmarkRecord>(Object.entries(baselineRaw.benchmarks ?? {}));
  const threshold = Number(baselineRaw.threshold ?? args.threshold);

  const regressions: string[] = [];
  const missing: string[] = [];
  const added: string[] = [];
  const rows: Array<{ key: string; baselineHz: number; currentHz: number; ratio: number }> = [];

  for (const [key, current] of currentMap) {
    const base = baseline.get(key);
    if (!base) {
      added.push(key);
      continue;
    }

    const meanRatio = current.mean / base.mean;
    rows.push({
      key,
      baselineHz: base.hz,
      currentHz: current.hz,
      ratio: meanRatio,
    });

    if (meanRatio > 1 + threshold) {
      regressions.push(
        `  ${key}\n    baseline mean: ${base.mean.toFixed(4)} ms (hz=${base.hz.toFixed(2)})\n    current  mean: ${current.mean.toFixed(4)} ms (hz=${current.hz.toFixed(2)})\n    slower by ${((meanRatio - 1) * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)`,
      );
    }
  }

  for (const key of baseline.keys()) {
    if (!currentMap.has(key)) missing.push(key);
  }

  rows.sort((a, b) => b.ratio - a.ratio);

  console.log(`\nBench comparison (threshold: ${(threshold * 100).toFixed(0)}% slowdown)`);
  console.log("=".repeat(80));
  for (const row of rows) {
    const delta = ((row.ratio - 1) * 100).toFixed(1).padStart(6);
    const marker = row.ratio > 1 + threshold ? "FAIL" : row.ratio > 1.1 ? "warn" : "ok  ";
    console.log(
      `${marker} ${delta}%  ${row.key}  (base=${row.baselineHz.toFixed(0)} hz, cur=${row.currentHz.toFixed(0)} hz)`,
    );
  }

  if (added.length) {
    console.log("\nNew benchmarks (not in baseline):");
    for (const key of added) console.log(`  + ${key}`);
  }
  if (missing.length) {
    console.log("\nMissing benchmarks (present in baseline, absent in current run):");
    for (const key of missing) console.log(`  - ${key}`);
  }

  if (regressions.length) {
    console.error(`\nRegressions detected (${regressions.length}):`);
    for (const line of regressions) console.error(line);
    process.exit(1);
  }

  console.log("\nNo regressions beyond threshold.");
}

main();
