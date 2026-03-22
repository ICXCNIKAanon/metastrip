#!/usr/bin/env node

/**
 * MetaStrip CLI
 *
 * Usage:
 *   metastrip inspect <file>          Show metadata in a file
 *   metastrip clean <file> [files...] Strip metadata from files
 *   metastrip diff <file>             Preview what would be removed
 *   metastrip batch <glob>            Process multiple files by pattern
 *
 * Examples:
 *   metastrip inspect photo.jpg
 *   metastrip clean photo.jpg --keep author
 *   metastrip clean *.jpg --output ./cleaned/
 *   metastrip diff photo.jpg
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import { glob } from 'glob';
import { MetaStrip } from '@metastrip/core';
import type { InspectionResult, MetadataCategory, StripResult } from '@metastrip/core';

// ============================================================
// .metastriprc Config File
// ============================================================

function loadConfig(): Record<string, unknown> {
  const paths = [
    path.join(process.cwd(), '.metastriprc'),
    path.join(os.homedir(), '.metastriprc'),
  ];

  for (const p of paths) {
    try {
      const content = fsSync.readFileSync(p, 'utf-8');
      return JSON.parse(content);
    } catch {
      // File doesn't exist or invalid JSON — skip
    }
  }
  return {};
}

const config = loadConfig();

// ============================================================
// Shell Completion Scripts
// ============================================================

function generateBashCompletions(): string {
  return `_metastrip_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local commands="inspect clean diff formats completions"

  if [ $COMP_CWORD -eq 1 ]; then
    COMPREPLY=(\$(compgen -W "$commands" -- "$cur"))
  else
    case "\${COMP_WORDS[1]}" in
      inspect)
        COMPREPLY=(\$(compgen -W "--format -f" -- "$cur"))
        ;;
      clean)
        COMPREPLY=(\$(compgen -W "--output -o --keep -k --categories -c --quality -q --no-color-profile --json" -- "$cur"))
        ;;
      diff)
        COMPREPLY=(\$(compgen -W "--keep -k" -- "$cur"))
        ;;
      completions)
        COMPREPLY=(\$(compgen -W "bash zsh fish" -- "$cur"))
        ;;
    esac
    # Fall back to file completion
    COMPREPLY+=(\$(compgen -f -- "$cur"))
  fi
}
complete -F _metastrip_completions metastrip`;
}

function generateZshCompletions(): string {
  return `#compdef metastrip

_metastrip() {
  local -a commands
  commands=(
    'inspect:Show all metadata in a file with privacy risk assessment'
    'clean:Strip metadata from one or more files'
    'diff:Preview what metadata would be removed'
    'formats:List all supported file formats'
    'completions:Generate shell completion script'
  )

  _arguments -C \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      _describe 'command' commands
      ;;
    args)
      case \${words[1]} in
        inspect)
          _arguments '--format[Output format]:format:(table json summary)' '*:file:_files'
          ;;
        clean)
          _arguments '--output[Output path]:path:_files' '--keep[Categories to keep]:category:' '--quality[Output quality]:quality:' '--json[Output as JSON]' '*:file:_files'
          ;;
        diff)
          _arguments '--keep[Categories to keep]:category:' '*:file:_files'
          ;;
        completions)
          _arguments '1:shell:(bash zsh fish)'
          ;;
      esac
      ;;
  esac
}

_metastrip`;
}

function generateFishCompletions(): string {
  return `complete -c metastrip -n '__fish_use_subcommand' -a 'inspect' -d 'Show metadata in a file'
complete -c metastrip -n '__fish_use_subcommand' -a 'clean' -d 'Strip metadata from files'
complete -c metastrip -n '__fish_use_subcommand' -a 'diff' -d 'Preview metadata removal'
complete -c metastrip -n '__fish_use_subcommand' -a 'formats' -d 'List supported formats'
complete -c metastrip -n '__fish_use_subcommand' -a 'completions' -d 'Generate completions'
complete -c metastrip -n '__fish_seen_subcommand_from inspect' -l format -a 'table json summary'
complete -c metastrip -n '__fish_seen_subcommand_from clean' -l output -r
complete -c metastrip -n '__fish_seen_subcommand_from clean' -l keep
complete -c metastrip -n '__fish_seen_subcommand_from clean' -l quality
complete -c metastrip -n '__fish_seen_subcommand_from clean' -l json
complete -c metastrip -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish'`;
}

const ms = new MetaStrip();
const program = new Command();

// ============================================================
// Output Formatters
// ============================================================

function riskColor(level: string): (text: string) => string {
  switch (level) {
    case 'critical': return chalk.bgRed.white.bold;
    case 'high': return chalk.red.bold;
    case 'medium': return chalk.yellow;
    case 'low': return chalk.blue;
    default: return chalk.green;
  }
}

function categoryIcon(category: MetadataCategory): string {
  const icons: Record<string, string> = {
    gps: '📍', device: '📱', timestamps: '🕐', software: '💻',
    author: '👤', ai: '🤖', icc: '🎨', thumbnail: '🖼️',
    xmp: '📋', iptc: '📰', other: '📎',
  };
  return icons[category] ?? '📎';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printInspection(result: InspectionResult, format: 'table' | 'json' | 'summary'): void {
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Header
  console.log();
  console.log(chalk.bold.white(`  File: ${path.basename(result.filePath)}`));
  console.log(chalk.gray(`  Type: ${result.fileType} | Size: ${formatSize(result.fileSize)} | Entries: ${result.totalEntries}`));

  // Risk assessment
  const riskFn = riskColor(result.risk.level);
  console.log(`  Risk: ${riskFn(` ${result.risk.level.toUpperCase()} (${result.risk.score}/100) `)}`);
  if (result.risk.summary) {
    console.log(chalk.gray(`  ${result.risk.summary}`));
  }
  console.log();

  // GPS callout
  if (result.gps) {
    console.log(chalk.bgRed.white.bold('  ⚠ GPS LOCATION FOUND '));
    console.log(chalk.red(`  📍 Latitude:  ${result.gps.latitude.toFixed(6)}`));
    console.log(chalk.red(`  📍 Longitude: ${result.gps.longitude.toFixed(6)}`));
    if (result.gps.altitude) {
      console.log(chalk.red(`  📍 Altitude:  ${result.gps.altitude.toFixed(1)}m`));
    }
    console.log(chalk.red(`  🗺️  https://www.google.com/maps?q=${result.gps.latitude},${result.gps.longitude}`));
    console.log();
  }

  // AI detection
  if (result.isAIGenerated) {
    console.log(chalk.magenta.bold('  🤖 AI-GENERATED IMAGE DETECTED'));
    if (result.aiDetails?.model) console.log(chalk.magenta(`  Model: ${result.aiDetails.model}`));
    console.log();
  }

  if (format === 'summary') return;

  // Metadata table grouped by category
  const categories = Object.entries(result.byCategory)
    .filter(([, entries]) => entries.length > 0)
    .sort(([a], [b]) => {
      const order: MetadataCategory[] = ['gps', 'device', 'author', 'timestamps', 'software', 'ai', 'thumbnail', 'icc', 'xmp', 'iptc', 'other'];
      return order.indexOf(a as MetadataCategory) - order.indexOf(b as MetadataCategory);
    });

  for (const [category, entries] of categories) {
    console.log(chalk.bold(`  ${categoryIcon(category as MetadataCategory)} ${category.toUpperCase()} (${entries.length})`));

    const table = new Table({
      chars: { top: '', 'top-mid': '', 'top-left': '', 'top-right': '', bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '', left: '  ', 'left-mid': '', mid: '', 'mid-mid': '', right: '', 'right-mid': '' },
      style: { 'padding-left': 1, 'padding-right': 1, head: ['cyan'] },
      colWidths: [30, 50],
    });

    for (const entry of entries) {
      const val = entry.displayValue.length > 47 ? entry.displayValue.slice(0, 44) + '...' : entry.displayValue;
      table.push([chalk.gray(entry.label), val]);
    }

    console.log(table.toString());
    console.log();
  }
}

function printStripResult(result: StripResult, inputPath: string): void {
  if (result.success) {
    console.log();
    console.log(chalk.green.bold('  ✓ Metadata removed successfully'));
    console.log(chalk.gray(`  Input:   ${path.basename(inputPath)} (${formatSize(result.originalSize)})`));
    console.log(chalk.gray(`  Output:  ${path.basename(result.outputPath)} (${formatSize(result.cleanedSize)})`));
    console.log(chalk.gray(`  Removed: ${result.entriesRemoved} metadata entries`));
    console.log(chalk.gray(`  Saved:   ${formatSize(result.sizeReduction)} (${result.sizeReductionPercent.toFixed(1)}%)`));
    console.log(chalk.gray(`  Time:    ${result.processingTimeMs}ms`));

    if (result.removed.length > 0) {
      const categories = [...new Set(result.removed.map(e => e.category))];
      console.log(chalk.gray(`  Cleaned: ${categories.map(c => `${categoryIcon(c)} ${c}`).join(', ')}`));
    }
    console.log();
  } else {
    console.log();
    console.log(chalk.red.bold(`  ✗ Failed to strip metadata`));
    console.log(chalk.red(`  Error: ${result.error}`));
    console.log();
  }
}

// ============================================================
// Commands
// ============================================================

program
  .name('metastrip')
  .description('Strip, inspect, and manage file metadata for privacy')
  .version('0.1.0');

// INSPECT
program
  .command('inspect <file>')
  .description('Show all metadata in a file with privacy risk assessment')
  .option('-f, --format <format>', 'Output format: table, json, summary', 'table')
  .action(async (file: string, opts: { format: string }) => {
    const filePath = path.resolve(file);
    const spinner = ora('Reading metadata...').start();

    try {
      const result = await ms.inspect(filePath);
      spinner.stop();
      printInspection(result, opts.format as 'table' | 'json' | 'summary');
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// CLEAN
program
  .command('clean <files...>')
  .description('Strip metadata from one or more files')
  .option('-o, --output <path>', 'Output file path or directory')
  .option('-k, --keep <categories...>', 'Categories to keep (gps, device, timestamps, software, author, icc)')
  .option('-c, --categories <categories...>', 'Specific categories to remove (default: all)')
  .option('-q, --quality <number>', 'Output quality for lossy formats (1-100)', '95')
  .option('--no-color-profile', 'Remove ICC color profile too')
  .option('--json', 'Output results as JSON')
  .action(async (files: string[], opts: {
    output?: string;
    keep?: string[];
    categories?: string[];
    quality: string;
    colorProfile: boolean;
    json: boolean;
  }) => {
    const resolvedFiles: string[] = [];

    // Expand globs
    for (const file of files) {
      if (file.includes('*')) {
        const matches = await glob(file);
        resolvedFiles.push(...matches.map(m => path.resolve(m)));
      } else {
        resolvedFiles.push(path.resolve(file));
      }
    }

    if (resolvedFiles.length === 0) {
      console.log(chalk.red('No files found'));
      process.exit(1);
    }

    // Resolve output from CLI flag or config file default
    const effectiveOutput = opts.output ?? (typeof config.outputDir === 'string' ? config.outputDir : undefined);

    // Determine if output is a directory
    let outputDir: string | undefined;
    let outputPath: string | undefined;
    if (effectiveOutput) {
      try {
        const stat = await fs.stat(effectiveOutput);
        if (stat.isDirectory()) outputDir = effectiveOutput;
        else outputPath = effectiveOutput;
      } catch {
        // Doesn't exist yet — if multiple files, treat as dir; else treat as file
        if (resolvedFiles.length > 1) {
          outputDir = effectiveOutput;
          await fs.mkdir(outputDir, { recursive: true });
        } else {
          outputPath = effectiveOutput;
        }
      }
    }

    const results: StripResult[] = [];

    for (const filePath of resolvedFiles) {
      const spinner = ora(`Cleaning ${path.basename(filePath)}...`).start();

      // Apply config file defaults where CLI flags were not explicitly set
      const effectiveKeep = opts.keep ?? (config.keep as string[] | undefined);
      const effectiveQuality = opts.quality !== '95'
        ? parseInt(opts.quality)
        : typeof config.quality === 'number' ? config.quality : parseInt(opts.quality);
      const effectiveColorProfile = !opts.colorProfile && config.preserveColorProfile === false
        ? false
        : opts.colorProfile;

      const stripOpts = {
        keep: effectiveKeep as MetadataCategory[] | undefined,
        categories: opts.categories as MetadataCategory[] | undefined,
        quality: effectiveQuality,
        preserveColorProfile: effectiveColorProfile,
        outputPath: outputDir
          ? path.join(outputDir, `${path.basename(filePath, path.extname(filePath))}.cleaned${path.extname(filePath)}`)
          : outputPath,
      };

      try {
        const result = await ms.strip(filePath, stripOpts);
        results.push(result);
        if (result.success) {
          spinner.succeed(`${path.basename(filePath)} → ${path.basename(result.outputPath)} (${result.entriesRemoved} entries removed)`);
        } else {
          spinner.fail(`${path.basename(filePath)}: ${result.error}`);
        }
      } catch (err) {
        spinner.fail(`${path.basename(filePath)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else if (results.length === 1) {
      printStripResult(results[0], resolvedFiles[0]);
    } else {
      // Batch summary
      const succeeded = results.filter(r => r.success);
      console.log();
      console.log(chalk.bold(`  Batch complete: ${succeeded.length}/${results.length} files cleaned`));
      console.log(chalk.gray(`  Total metadata removed: ${succeeded.reduce((s, r) => s + r.entriesRemoved, 0)} entries`));
      console.log(chalk.gray(`  Total size saved: ${formatSize(succeeded.reduce((s, r) => s + r.sizeReduction, 0))}`));
      console.log();
    }
  });

// DIFF
program
  .command('diff <file>')
  .description('Preview what metadata would be removed (dry run)')
  .option('-k, --keep <categories...>', 'Categories to keep')
  .action(async (file: string, opts: { keep?: string[] }) => {
    const filePath = path.resolve(file);
    const spinner = ora('Analyzing metadata...').start();

    try {
      const inspection = await ms.inspect(filePath);
      spinner.stop();

      const effectiveKeep = opts.keep ?? (config.keep as string[] | undefined);
      const keepSet = new Set(effectiveKeep ?? []);
      const wouldRemove = inspection.entries.filter(e => !keepSet.has(e.category));
      const wouldKeep = inspection.entries.filter(e => keepSet.has(e.category));

      console.log();
      console.log(chalk.bold.white(`  Dry run: ${path.basename(filePath)}`));
      console.log();

      if (wouldRemove.length > 0) {
        console.log(chalk.red.bold(`  Would REMOVE (${wouldRemove.length} entries):`));
        for (const entry of wouldRemove) {
          const val = entry.displayValue.length > 40 ? entry.displayValue.slice(0, 37) + '...' : entry.displayValue;
          console.log(chalk.red(`    - ${categoryIcon(entry.category)} ${entry.label}: ${val}`));
        }
      }

      if (wouldKeep.length > 0) {
        console.log();
        console.log(chalk.green.bold(`  Would KEEP (${wouldKeep.length} entries):`));
        for (const entry of wouldKeep) {
          const val = entry.displayValue.length > 40 ? entry.displayValue.slice(0, 37) + '...' : entry.displayValue;
          console.log(chalk.green(`    + ${categoryIcon(entry.category)} ${entry.label}: ${val}`));
        }
      }

      console.log();
      console.log(chalk.gray(`  Run ${chalk.bold('metastrip clean ' + path.basename(filePath))} to apply.`));
      console.log();
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// SUPPORTED
program
  .command('formats')
  .description('List all supported file formats')
  .action(() => {
    console.log();
    console.log(chalk.bold.white('  Supported Formats'));
    console.log();
    console.log(chalk.cyan('  Images:  ') + '.jpg .jpeg .png .webp .heic .heif .tiff .tif .gif .avif');
    console.log(chalk.cyan('  Videos:  ') + '.mp4 .mov .mkv .avi .webm .m4v');
    console.log(chalk.gray('  Audio:   ') + chalk.gray('.mp3 .flac .wav .ogg .aac (coming soon)'));
    console.log(chalk.gray('  Docs:    ') + chalk.gray('.pdf .docx .xlsx .pptx (coming soon)'));
    console.log();
  });

// COMPLETIONS
program
  .command('completions <shell>')
  .description('Generate shell completion script (bash, zsh, fish)')
  .action((shell: string) => {
    switch (shell) {
      case 'bash':
        console.log(generateBashCompletions());
        break;
      case 'zsh':
        console.log(generateZshCompletions());
        break;
      case 'fish':
        console.log(generateFishCompletions());
        break;
      default:
        console.error(`Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
        process.exit(1);
    }
  });

program.parse();
