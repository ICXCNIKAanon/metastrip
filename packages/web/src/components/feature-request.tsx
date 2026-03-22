'use client';

export default function FeatureRequest() {
  return (
    <section className="py-20 px-4 border-t border-border">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-xs tracking-[3px] uppercase text-primary font-semibold mb-3">
          Shape the product
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary mb-3">
          What should we build next?
        </h2>
        <p className="text-sm text-text-tertiary max-w-md mx-auto mb-8">
          MetaStrip is built for people who care about privacy. Tell us what&rsquo;s missing.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://github.com/ICXCNIKAanon/metastrip/discussions/new?category=ideas"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-button bg-primary/10 border border-primary/20 px-6 py-3 text-sm font-semibold text-primary transition-all hover:bg-primary/20 hover:border-primary/30 hover:-translate-y-0.5"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            Request a Feature
          </a>
          <a
            href="https://github.com/ICXCNIKAanon/metastrip/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-button bg-surface border border-border px-6 py-3 text-sm font-medium text-text-secondary transition-all hover:bg-border hover:text-text-primary"
          >
            Report a Bug
          </a>
        </div>
      </div>
    </section>
  );
}
