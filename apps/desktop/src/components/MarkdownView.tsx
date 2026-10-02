import { Fragment, type ReactNode } from 'react';

/**
 * FTS snippet highlight markers. Kept in sync with @contextbridge/core
 * search constants by tests/ipc-contract.test.ts (the renderer must not
 * import core at runtime: core pulls in better-sqlite3, which is main-only).
 */
export const SNIPPET_OPEN = '\u0002';
export const SNIPPET_CLOSE = '\u0003';

/**
 * Renders search snippet highlight markers (\u0002/\u0003) as <mark> spans.
 * The input is plain text from SQLite FTS snippet(); nothing is ever parsed
 * as HTML.
 */
export function HighlightedText({ text }: { text: string }): ReactNode {
  if (!text.includes(SNIPPET_OPEN) && !text.includes(SNIPPET_CLOSE)) {
    return <>{text}</>;
  }
  const parts: ReactNode[] = [];
  let buffer = '';
  let highlighted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === SNIPPET_OPEN) {
      if (buffer) parts.push(<Fragment key={parts.length}>{buffer}</Fragment>);
      buffer = '';
      highlighted = true;
    } else if (ch === SNIPPET_CLOSE) {
      if (buffer) {
        parts.push(
          highlighted ? (
            <mark key={parts.length} className="rounded bg-amber-500/25 px-0.5 text-amber-200">
              {buffer}
            </mark>
          ) : (
            <Fragment key={parts.length}>{buffer}</Fragment>
          ),
        );
      }
      buffer = '';
      highlighted = false;
    } else {
      buffer += ch;
    }
  }
  if (buffer) {
    parts.push(
      highlighted ? (
        <mark key={parts.length} className="rounded bg-amber-500/25 px-0.5 text-amber-200">
          {buffer}
        </mark>
      ) : (
        <Fragment key={parts.length}>{buffer}</Fragment>
      ),
    );
  }
  return <>{parts}</>;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={key}>{text.slice(last, match.index)}</Fragment>);
      key += 1;
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code
          key={key}
          className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 font-mono text-[0.85em] text-sky-300"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    key += 1;
    last = match.index + token.length;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={key}>{text.slice(last)}</Fragment>);
  }
  return nodes;
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-xl font-semibold text-slate-100 mt-6 first:mt-0',
  2: 'text-base font-semibold text-sky-300 mt-6 first:mt-0 border-b border-slate-800 pb-1',
  3: 'text-sm font-semibold uppercase tracking-wide text-slate-300 mt-4',
  4: 'text-sm font-semibold text-slate-300 mt-3',
};

interface Block {
  key: string;
  node: ReactNode;
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({
        key: `b${key}`,
        node: (
          <pre
            key={`b${key}`}
            className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300"
          >
            {code.join('\n')}
          </pre>
        ),
      });
      key += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      blocks.push({
        key: `b${key}`,
        node: (
          <Tag key={`b${key}`} className={HEADING_CLASS[level]}>
            {renderInline(heading[2])}
          </Tag>
        ),
      });
      key += 1;
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({
        key: `b${key}`,
        node: (
          <blockquote
            key={`b${key}`}
            className="border-l-2 border-sky-700 pl-3 text-sm italic text-slate-400"
          >
            {renderInline(quoted.join(' '))}
          </blockquote>
        ),
      });
      key += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({
        key: `b${key}`,
        node: (
          <ul key={`b${key}`} className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            {items.map((item, idx) => (
              <li key={idx}>{renderInline(item)}</li>
            ))}
          </ul>
        ),
      });
      key += 1;
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push({
        key: `b${key}`,
        node: (
          <ol
            key={`b${key}`}
            className="list-decimal space-y-1 pl-5 text-sm text-slate-300"
          >
            {items.map((item, idx) => (
              <li key={idx}>{renderInline(item)}</li>
            ))}
          </ol>
        ),
      });
      key += 1;
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({
      key: `b${key}`,
      node: (
        <p key={`b${key}`} className="text-sm leading-relaxed text-slate-300">
          {renderInline(paragraph.join(' '))}
        </p>
      ),
    });
    key += 1;
  }

  return blocks;
}

/**
 * Structural markdown renderer that maps known syntax to React elements.
 * All text flows through React text nodes (auto-escaped); there is no HTML
 * parsing and no raw-HTML insertion sink anywhere in this file.
 */
export function MarkdownView({ markdown }: { markdown: string }): ReactNode {
  return <div className="space-y-2">{parseBlocks(markdown).map((block) => block.node)}</div>;
}
