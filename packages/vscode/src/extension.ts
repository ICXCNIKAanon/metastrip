import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { detectFormat } from '@metastrip/hooks/dist/detect';
import { validateOutput } from '@metastrip/hooks/dist/safety';
import { stripJpeg } from '@metastrip/hooks/dist/strip-jpeg';
import { stripPng } from '@metastrip/hooks/dist/strip-png';
import { stripWebp } from '@metastrip/hooks/dist/strip-webp';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function isSupported(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

interface StripResult {
  success: boolean;
  metadataRemoved: boolean;
  savedBytes: number;
  error?: string;
}

/**
 * Strips metadata from a single image file.
 * Uses the low-level strippers from @metastrip/hooks directly,
 * bypassing the git-hook path restriction in stripFile().
 */
async function stripImageFile(filePath: string): Promise<StripResult> {
  try {
    const resolved = path.resolve(filePath);
    const input = fs.readFileSync(resolved);
    const format = detectFormat(input);

    if (format === null) {
      return { success: false, metadataRemoved: false, savedBytes: 0, error: 'unsupported format' };
    }

    let output: Buffer;

    if (format === 'jpeg') {
      output = stripJpeg(input).output;
    } else if (format === 'png') {
      output = stripPng(input).output;
    } else {
      output = stripWebp(input).output;
    }

    if (!validateOutput(output, format)) {
      return { success: false, metadataRemoved: false, savedBytes: 0, error: 'output validation failed' };
    }

    const metadataRemoved = !input.equals(output);

    if (metadataRemoved) {
      const savedBytes = input.byteLength - output.byteLength;
      fs.writeFileSync(resolved, output);
      return { success: true, metadataRemoved: true, savedBytes };
    }

    return { success: true, metadataRemoved: false, savedBytes: 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, metadataRemoved: false, savedBytes: 0, error: message };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function activate(context: vscode.ExtensionContext) {
  // Command: Strip single file
  const stripFileCmd = vscode.commands.registerCommand('metastrip.stripFile', async (uri: vscode.Uri) => {
    if (!uri) {
      vscode.window.showErrorMessage('MetaStrip: No file selected');
      return;
    }

    const filePath = uri.fsPath;
    const fileName = path.basename(filePath);

    if (!isSupported(filePath)) {
      vscode.window.showWarningMessage(
        `MetaStrip: ${fileName} is not a supported format (JPEG, PNG, WebP)`
      );
      return;
    }

    try {
      const result = await stripImageFile(filePath);

      if (result.success && result.metadataRemoved) {
        vscode.window.showInformationMessage(
          `MetaStrip: ${fileName} — metadata stripped (saved ${formatBytes(result.savedBytes)})`
        );
      } else if (result.success && !result.metadataRemoved) {
        vscode.window.showInformationMessage(
          `MetaStrip: ${fileName} — already clean, no metadata found`
        );
      } else {
        vscode.window.showWarningMessage(
          `MetaStrip: ${fileName} — ${result.error || 'failed to strip'}`
        );
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `MetaStrip: Error — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  // Command: Strip all images in folder
  const stripFolderCmd = vscode.commands.registerCommand('metastrip.stripFolder', async (uri: vscode.Uri) => {
    if (!uri) {
      vscode.window.showErrorMessage('MetaStrip: No folder selected');
      return;
    }

    const folderPath = uri.fsPath;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'MetaStrip: Stripping metadata...',
        cancellable: false,
      },
      async (progress) => {
        const pattern = new vscode.RelativePattern(folderPath, '**/*.{jpg,jpeg,png,webp}');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');

        if (files.length === 0) {
          vscode.window.showInformationMessage('MetaStrip: No image files found in folder');
          return;
        }

        let stripped = 0;
        let clean = 0;
        let totalSaved = 0;

        for (let i = 0; i < files.length; i++) {
          progress.report({
            message: `${i + 1}/${files.length} — ${path.basename(files[i].fsPath)}`,
            increment: (1 / files.length) * 100,
          });

          try {
            const result = await stripImageFile(files[i].fsPath);
            if (result.success && result.metadataRemoved) {
              stripped++;
              totalSaved += result.savedBytes;
            } else if (result.success) {
              clean++;
            }
          } catch {
            // Skip files that error
          }
        }

        vscode.window.showInformationMessage(
          `MetaStrip: ${stripped} files cleaned, ${clean} already clean (saved ${formatBytes(totalSaved)})`
        );
      }
    );
  });

  context.subscriptions.push(stripFileCmd, stripFolderCmd);
}

export function deactivate() {}
