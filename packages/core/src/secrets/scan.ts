export type SecretSeverity = 'high' | 'medium';

export interface SecretRule {
  id: string;
  description: string;
  severity: SecretSeverity;
  pattern: RegExp;
}

/**
 * Deterministic, local, offline rules. High-confidence credential formats
 * only; no network access, no external services.
 */
export const SECRET_RULES: SecretRule[] = [
  {
    id: 'private-key-block',
    description: 'PEM/OpenSSH private key block',
    severity: 'high',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'aws-access-key-id',
    description: 'AWS access key id',
    severity: 'high',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'github-token',
    description: 'GitHub token',
    severity: 'high',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: 'github-fine-grained-pat',
    description: 'GitHub fine-grained personal access token',
    severity: 'high',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    id: 'slack-token',
    description: 'Slack token',
    severity: 'high',
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: 'jwt',
    description: 'JSON Web Token',
    severity: 'high',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    id: 'url-credentials',
    description: 'Credentials embedded in a URL',
    severity: 'medium',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@]{1,}@/gi,
  },
  {
    id: 'credential-assignment',
    description: 'Credential assigned to a variable',
    severity: 'medium',
    pattern: /\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[^\s"'`]{8,}/gi,
  },
];

export interface SecretFinding {
  ruleId: string;
  description: string;
  severity: SecretSeverity;
  line: number;
  column: number;
  redacted: string;
}

/** Never returns the matched secret; only a short masked prefix. */
export function redactMatch(match: string): string {
  if (match.length <= 4) {
    return '••••';
  }
  return `${match.slice(0, 4)}…`;
}

function positionOf(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

/**
 * Scans text for credential-shaped strings. Pure, synchronous, offline.
 * Matches are reported redacted so secrets never reach logs or UI.
 */
export function scanSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  if (text.length === 0) {
    return findings;
  }
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      const { line, column } = positionOf(text, match.index);
      findings.push({
        ruleId: rule.id,
        description: rule.description,
        severity: rule.severity,
        line,
        column,
        redacted: redactMatch(match[0]),
      });
      if (match[0].length === 0) {
        rule.pattern.lastIndex += 1;
      }
    }
  }
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings;
}
