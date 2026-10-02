export const FRONT_MATTER_FENCE = '***';

/** Deterministic key order for exported front matter. */
export const FRONT_MATTER_KEYS = [
  'contextbridge',
  'id',
  'title',
  'type',
  'status',
  'tags',
  'project',
  'created',
  'updated',
  'git_head',
  'git_branch',
  'git_snapshot',
] as const;

export type FrontMatterValue = string | number | string[];

function needsQuoting(value: string): boolean {
  return (
    value.length === 0 ||
    /^[\s]|[\s]$/.test(value) ||
    /[:#\-?*|>&!%@`{}[\]"',]/.test(value) ||
    /^(true|false|null|~|-|\d+(\.\d+)?)$/i.test(value)
  );
}

function scalarToYaml(value: string): string {
  if (needsQuoting(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function buildFrontMatter(
  fields: Partial<Record<(typeof FRONT_MATTER_KEYS)[number], FrontMatterValue>>,
): string {
  const lines: string[] = [FRONT_MATTER_FENCE];
  for (const key of FRONT_MATTER_KEYS) {
    const value = fields[key];
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => scalarToYaml(v)).join(', ')}]`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${scalarToYaml(value)}`);
    }
  }
  lines.push(FRONT_MATTER_FENCE);
  return lines.join('\n');
}

export interface ParsedFrontMatter {
  present: boolean;
  fence: string | null;
  fields: Record<string, FrontMatterValue>;
  body: string;
}

function parseScalar(raw: string): FrontMatterValue {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner.length === 0) {
      return [];
    }
    return inner.split(',').map((part) => unquote(part.trim()));
  }
  return unquote(value);
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parses leading YAML-ish front matter. Accepts both the ContextBridge fence
 * (`***`) and the common `---` fence. When no front matter is present the
 * entire text is returned as the body.
 */
export function parseFrontMatter(text: string): ParsedFrontMatter {
  const normalized = text.replace(/\r\n/g, '\n');
  const firstLineEnd = normalized.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? normalized : normalized.slice(0, firstLineEnd);
  const fence = firstLine === '***' || firstLine === '---' ? firstLine : null;
  if (fence === null) {
    return { present: false, fence: null, fields: {}, body: normalized };
  }

  const searchFrom = firstLineEnd + 1;
  let closingIndex = -1;
  let lineStart = searchFrom;
  while (lineStart <= normalized.length) {
    const lineEnd = normalized.indexOf('\n', lineStart);
    const line = (
      lineEnd === -1 ? normalized.slice(lineStart) : normalized.slice(lineStart, lineEnd)
    ).trim();
    if (line === fence) {
      closingIndex = lineStart;
      break;
    }
    if (lineEnd === -1) {
      break;
    }
    lineStart = lineEnd + 1;
  }

  if (closingIndex === -1) {
    return { present: false, fence: null, fields: {}, body: normalized };
  }

  const headerStart = searchFrom;
  const header = normalized.slice(headerStart, closingIndex);
  const bodyStart = normalized.indexOf('\n', closingIndex);
  const body = bodyStart === -1 ? '' : normalized.slice(bodyStart + 1);

  const fields: Record<string, FrontMatterValue> = {};
  for (const line of header.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    fields[key] = parseScalar(value);
  }

  return { present: true, fence, fields, body };
}
