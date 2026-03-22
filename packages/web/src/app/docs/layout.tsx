export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const navLinks = [
    { label: 'Supported Formats', href: '#formats' },
    { label: 'Getting Started', href: '#getting-started' },
    { label: 'CLI Reference', href: '#cli' },
    { label: 'MCP Server', href: '#mcp-server' },
    { label: 'npm Package', href: '#npm' },
    { label: 'Browser Extension', href: '#browser-extension' },
    { label: 'VS Code Extension', href: '#vscode' },
    { label: 'Git Hooks', href: '#hooks' },
    { label: 'REST API', href: '#api' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:flex md:gap-12">
      <aside className="hidden md:block md:w-56 shrink-0">
        <nav className="sticky top-24 space-y-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors py-1"
            >
              {link.label}
              {link.comingSoon && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  Soon
                </span>
              )}
            </a>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
