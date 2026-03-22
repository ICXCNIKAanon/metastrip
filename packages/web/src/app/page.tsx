'use client';

import { useState, useRef, useCallback } from 'react';
import DropZone from '@/components/drop-zone';
import ResultsPanel from '@/components/results-panel';
import BeforeAfter from '@/components/before-after';
import CodeBlock from '@/components/code-block';
import FaqAccordion from '@/components/faq-accordion';
import { analyzeFile } from '@/lib/metadata';
import type { FileAnalysis } from '@/lib/metadata';
import type { CustomMetadata } from '@/lib/fake-metadata';
import ShipSafeBadge from '@/components/shipsafe-badge';
import JsonLd from '@/components/json-ld';
import FeatureRequest from '@/components/feature-request';

type Phase = 'idle' | 'analyzing' | 'results' | 'stripping' | 'done';
type StrippedResult = { buffer: ArrayBuffer; size: number; fileName: string; injectedSummary?: string };

const FAQ_ITEMS = [
  {
    question: 'What is image metadata (EXIF data)?',
    answer:
      'Every digital photo contains hidden data called EXIF (Exchangeable Image File Format) metadata. This can include the exact GPS coordinates where the photo was taken, the make and model of your camera or phone, the date and time, your device serial number, and even software used to edit it. Anyone who downloads your photo can read this data with freely available tools.',
  },
  {
    question: 'Is MetaStrip really free?',
    answer:
      'Yes. The web tool is free forever and always will be. We process everything client-side in your browser, which means there are no server costs for file processing. Our CLI and developer tools have free tiers as well.',
  },
  {
    question: 'Do my files get uploaded to a server?',
    answer:
      'No. All processing happens entirely in your browser using JavaScript and Web Workers. Your files never leave your device. You can verify this by disconnecting from the internet before using the tool — it will still work perfectly.',
  },
  {
    question: 'What file formats are supported?',
    answer:
      'MetaStrip supports 20 formats across images, documents, audio, and video: JPEG, PNG, WebP, GIF, SVG, HEIC/HEIF, AVIF, PDF, DOCX, XLSX, PPTX, EPUB, MP3, WAV, FLAC, M4A, MP4, MOV, AVI, and MKV/WebM. All formats work in the browser and the CLI.',
  },
  {
    question: 'Will stripping metadata reduce image quality?',
    answer:
      'No. MetaStrip performs binary surgery on the file — it removes only metadata segments without touching the image data. There is zero quality loss, zero recompression, and zero pixel changes. The image you download is identical in quality to the original.',
  },
];

export default function Home() {
  const [files, setFiles] = useState<Array<{ file: File; buffer: ArrayBuffer }>>([]);
  const [analyses, setAnalyses] = useState<FileAnalysis[]>([]);
  const [strippedResults, setStrippedResults] = useState<StrippedResult[]>([]);
  const [processingTimeMs, setProcessingTimeMs] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [injectMode, setInjectMode] = useState<'off' | 'random' | 'custom'>('off');
  const [customMetadata, setCustomMetadata] = useState<CustomMetadata | null>(null);

  // Keep refs to the original buffers for the web worker
  const buffersRef = useRef<ArrayBuffer[]>([]);

  const handleFiles = useCallback(async (selectedFiles: Array<{ file: File; buffer: ArrayBuffer }>) => {
    setPhase('analyzing');
    setFiles(selectedFiles);
    setStrippedResults([]);
    setProcessingTimeMs(0);

    // Store copies of all buffers for later worker use
    buffersRef.current = selectedFiles.map((f) => f.buffer.slice(0));

    try {
      // Analyze all files
      const results: FileAnalysis[] = [];
      for (const { file } of selectedFiles) {
        const result = await analyzeFile(file);
        results.push(result);
      }
      setAnalyses(results);
      setPhase('results');
    } catch (err) {
      console.error('Failed to analyze files:', err);
      setPhase('idle');
    }
  }, []);

  const handleStrip = useCallback(() => {
    if (buffersRef.current.length === 0) return;

    setPhase('stripping');
    const startTime = performance.now();

    const results: StrippedResult[] = [];
    let currentIndex = 0;

    function processNext() {
      if (currentIndex >= buffersRef.current.length) {
        // All done
        setStrippedResults(results);
        setProcessingTimeMs(Math.round(performance.now() - startTime));
        setPhase('done');
        return;
      }

      const bufferCopy = buffersRef.current[currentIndex].slice(0);
      const fileName = files[currentIndex]?.file.name ?? `file-${currentIndex}`;

      const worker = new Worker(new URL('../lib/strip-worker.ts', import.meta.url));
      worker.postMessage(
        {
          buffer: bufferCopy,
          inject: injectMode !== 'off',
          injectMode,
          customMetadata,
          fileName,
        },
        { transfer: [bufferCopy] },
      );
      worker.onmessage = (e) => {
        if (e.data.success) {
          results.push({
            buffer: e.data.buffer,
            size: e.data.strippedSize,
            fileName,
            injectedSummary: e.data.injectedSummary,
          });
          currentIndex++;
          processNext();
        } else {
          console.error(`Strip worker error on ${fileName}:`, e.data.error);
          setPhase('results');
        }
        worker.terminate();
      };
      worker.onerror = (err) => {
        console.error('Worker error:', err);
        setPhase('results');
        worker.terminate();
      };
    }

    processNext();
  }, [files, injectMode, customMetadata]);

  const handleReset = useCallback(() => {
    setFiles([]);
    setAnalyses([]);
    setStrippedResults([]);
    setProcessingTimeMs(0);
    setPhase('idle');
    buffersRef.current = [];
  }, []);

  // Build batch results for BeforeAfter
  const batchResults = strippedResults.map((sr, i) => ({
    analysis: analyses[i],
    strippedBuffer: sr.buffer,
    strippedSize: sr.size,
    fileName: sr.fileName,
    injectedSummary: sr.injectedSummary,
  }));

  return (
    <main className="min-h-screen">
      {/* ========== HERO ========== */}
      <section className="max-w-4xl mx-auto px-4 pt-16 pb-8 text-center">
        {/* Privacy badge */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20 mb-6">
          Your files never leave your device
        </span>

        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
          See What Your Photos Reveal About You
        </h1>

        <p className="text-lg text-text-secondary max-w-xl mx-auto">
          GPS coordinates. Device serial numbers. Timestamps.{' '}
          <span className="font-extrabold text-primary">Remove them all.</span>
        </p>
      </section>

      {/* ========== TOOL AREA ========== */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        {(phase === 'idle' || phase === 'analyzing') && (
          <DropZone onFilesSelected={handleFiles} />
        )}

        {phase === 'results' && analyses.length > 0 && (
          <ResultsPanel
            analyses={analyses}
            onStrip={handleStrip}
            injectMode={injectMode}
            onInjectModeChange={setInjectMode}
            customMetadata={customMetadata}
            onCustomMetadataChange={setCustomMetadata}
          />
        )}

        {phase === 'stripping' && (
          <div className="flex flex-col items-center gap-4 py-16">
            {/* Spinner */}
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-lg font-semibold text-text-primary">Removing metadata...</p>
            <p className="text-sm text-text-tertiary">
              {files.length === 1
                ? 'This takes less than a second'
                : `Processing ${files.length} files...`}
            </p>
          </div>
        )}

        {phase === 'done' && batchResults.length > 0 && (
          <BeforeAfter
            results={batchResults}
            processingTimeMs={processingTimeMs}
            onReset={handleReset}
          />
        )}
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="max-w-4xl mx-auto px-4 py-16 md:py-24">
        <h2 className="text-3xl font-bold text-text-primary mb-10 text-center">
          How It Works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface border border-border rounded-card p-6 text-center">
            <span className="text-4xl leading-none block mb-4" aria-hidden="true">📄</span>
            <h3 className="text-lg font-bold text-text-primary mb-2">Drop</h3>
            <p className="text-sm text-text-secondary">
              Drag any JPEG, PNG, or WebP file
            </p>
          </div>

          <div className="bg-surface border border-border rounded-card p-6 text-center">
            <span className="text-4xl leading-none block mb-4" aria-hidden="true">🔍</span>
            <h3 className="text-lg font-bold text-text-primary mb-2">Scan</h3>
            <p className="text-sm text-text-secondary">
              We scan for GPS, device info, timestamps, and more
            </p>
          </div>

          <div className="bg-surface border border-border rounded-card p-6 text-center">
            <span className="text-4xl leading-none block mb-4" aria-hidden="true">🛡️</span>
            <h3 className="text-lg font-bold text-text-primary mb-2">Clean</h3>
            <p className="text-sm text-text-secondary">
              All metadata stripped. Zero quality loss. Download instantly.
            </p>
          </div>
        </div>
      </section>

      {/* ========== DEVELOPER SECTION ========== */}
      <section className="max-w-4xl mx-auto px-4 py-16 md:py-24">
        <h2 className="text-3xl font-bold text-text-primary mb-6">
          Built for developers too
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm font-semibold text-text-tertiary mb-3 uppercase tracking-wider">CLI</p>
            <CodeBlock
              language="bash"
              code={`npm install -g @metastrip/cli
metastrip inspect photo.jpg
metastrip clean photo.jpg`}
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-text-tertiary mb-3 uppercase tracking-wider">MCP Server</p>
            <CodeBlock
              language="json"
              code={`{
  "mcpServers": {
    "metastrip": {
      "command": "npx",
      "args": ["@metastrip/mcp-server"]
    }
  }
}`}
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-text-tertiary mb-3 uppercase tracking-wider">npm</p>
            <CodeBlock
              language="typescript"
              code={`import { MetaStrip } from '@metastrip/core';
const ms = new MetaStrip();
const report = await ms.inspect('photo.jpg');`}
            />
          </div>
        </div>

        <p className="mt-6 text-sm text-text-tertiary">
          Read the full documentation at{' '}
          <a href="/docs" className="text-primary hover:underline font-medium">
            /docs
          </a>
        </p>

        {/* Git hooks callout */}
        <div className="mt-12 bg-surface border border-border rounded-card p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex-1">
            <p className="text-text-primary font-semibold mb-1">
              Auto-strip metadata on every commit
            </p>
            <p className="text-sm text-text-secondary">
              One command. Every image you commit gets stripped automatically — zero quality loss, zero config.
              Built into <ShipSafeBadge size={16} />, the security platform for developers who ship fast.
            </p>
          </div>
          <div className="shrink-0">
            <CodeBlock language="bash" code="npx metastrip-hooks install" />
          </div>
        </div>
      </section>

      {/* ========== SEO CONTENT ========== */}
      <section className="max-w-4xl mx-auto px-4 py-16 md:py-24">
        <h2 className="text-3xl font-bold text-text-primary mb-6">
          What Metadata Does Your Photo Contain?
        </h2>
        <p className="text-text-secondary leading-relaxed mb-4">
          Every digital photo contains hidden metadata — also known as EXIF data. This includes
          the exact GPS coordinates where the photo was taken, the make and model of your camera
          or phone, the date and time down to the second, the software used to edit it, and sometimes
          even your name or copyright information. This data is embedded in the file itself and
          travels with it when you share it online, send it via messaging apps, or post it to
          social media platforms that don&apos;t strip metadata automatically.
        </p>
        <p className="text-text-secondary leading-relaxed mb-12">
          Most people have no idea this data exists. When you take a photo with your smartphone,
          it silently records your precise location, your device&apos;s unique serial number, your
          camera settings, and a timestamp. Anyone who downloads that photo can extract all of this
          information using freely available tools. MetaStrip makes it easy to see exactly what
          your photos reveal and remove it all with a single click.
        </p>

        <h2 className="text-3xl font-bold text-text-primary mb-6">
          Why Should You Remove Metadata?
        </h2>
        <p className="text-text-secondary leading-relaxed mb-4">
          GPS metadata in photos has been used by stalkers to identify people&apos;s home addresses,
          daily routines, and travel patterns. Investigative journalists have been compromised when
          photos they shared contained location data from sensitive meetings. Device serial numbers
          can link multiple photos to the same person, even if posted from different accounts.
          Timestamps reveal exactly when you were at specific locations, creating a detailed
          timeline of your movements.
        </p>
        <p className="text-text-secondary leading-relaxed">
          AI-generated images contain generation parameters that reveal the model and prompt used,
          which can be used for fingerprinting. Even seemingly harmless metadata like camera model
          information can be used for device fingerprinting across platforms. Removing metadata
          before sharing photos online is a fundamental privacy practice. MetaStrip performs
          binary-level surgery on your files — no recompression, no quality loss, no pixels
          touched. Just clean files ready to share safely.
        </p>
      </section>

      {/* ========== FAQ ========== */}
      <section className="max-w-4xl mx-auto px-4 py-16 md:py-24">
        <h2 className="text-3xl font-bold text-text-primary mb-6">
          Frequently Asked Questions
        </h2>
        <FaqAccordion items={FAQ_ITEMS} />
      </section>

      {/* ========== FEATURE REQUEST ========== */}
      <FeatureRequest />

      {/* ========== STRUCTURED DATA ========== */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to Remove Metadata from Photos',
          description:
            'Strip GPS, device info, and hidden metadata from images in 3 steps using MetaStrip.',
          step: [
            {
              '@type': 'HowToStep',
              name: 'Drop',
              text: 'Drag any JPEG, PNG, or WebP file onto the MetaStrip tool.',
            },
            {
              '@type': 'HowToStep',
              name: 'Scan',
              text: 'MetaStrip scans for GPS coordinates, device info, timestamps, and other hidden metadata.',
            },
            {
              '@type': 'HowToStep',
              name: 'Clean',
              text: 'Click Remove All Metadata to strip everything with zero quality loss. Download the clean file.',
            },
          ],
          tool: {
            '@type': 'SoftwareApplication',
            name: 'MetaStrip',
            url: 'https://metastrip.ai',
          },
        }}
      />
    </main>
  );
}
