import { describe, expect, it } from 'vitest';
import { SECRET_RULES, redactMatch, scanSecrets } from '../src/index';

describe('secret rules', () => {
  it('detects a PEM/OpenSSH private key block', () => {
    const findings = scanSecrets('header\n-----BEGIN OPENSSH PRIVATE KEY-----\nblob\n');
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('private-key-block');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].line).toBe(2);
  });

  it('detects AWS access key ids', () => {
    const findings = scanSecrets('id=AKIA1234567890ABCDEF');
    expect(findings.map((f) => f.ruleId)).toContain('aws-access-key-id');
    const temporary = scanSecrets('id=ASIA1234567890ABCDEF');
    expect(temporary.map((f) => f.ruleId)).toContain('aws-access-key-id');
  });

  it('detects GitHub tokens', () => {
    const classic = `token ghp_${'a'.repeat(36)}`;
    const findings = scanSecrets(classic);
    expect(findings.map((f) => f.ruleId)).toContain('github-token');

    const fineGrained = `pat github_pat_${'b'.repeat(30)}`;
    const patFindings = scanSecrets(fineGrained);
    expect(patFindings.map((f) => f.ruleId)).toContain('github-fine-grained-pat');
  });

  it('detects Slack tokens', () => {
    const findings = scanSecrets(`hook xoxb-${'1'.repeat(24)}`);
    expect(findings.map((f) => f.ruleId)).toContain('slack-token');
  });

  it('detects JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature-value-1';
    const findings = scanSecrets(`auth=${jwt}`);
    expect(findings.map((f) => f.ruleId)).toContain('jwt');
  });

  it('detects credentials embedded in URLs', () => {
    const findings = scanSecrets('fetch https://user:hunter2@example.invalid/path');
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('url-credentials');
    expect(findings[0].severity).toBe('medium');
  });

  it('detects credential assignments', () => {
    const findings = scanSecrets('const x = { api_key: "supersecretvalue123" };');
    expect(findings.map((f) => f.ruleId)).toContain('credential-assignment');
    expect(findings[0].severity).toBe('medium');
  });

  it('does not flag ordinary prose', () => {
    const text = 'The password policy requires twelve characters and one symbol.';
    expect(scanSecrets(text)).toEqual([]);
    expect(scanSecrets('')).toEqual([]);
    expect(scanSecrets('no credentials here at all')).toEqual([]);
  });

  it('never returns the matched secret', () => {
    const secret = 'supersecretvalue123';
    const findings = scanSecrets(`password = "${secret}"`);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.redacted).not.toContain(secret);
      expect(finding.redacted.length).toBeLessThan(secret.length);
    }
  });

  it('reports line and column positions', () => {
    const findings = scanSecrets(`line one\nline two AKIA1234567890ABCDEF`);
    const aws = findings.find((f) => f.ruleId === 'aws-access-key-id');
    expect(aws?.line).toBe(2);
    expect(aws?.column).toBe(10);
  });

  it('sorts findings by position', () => {
    const findings = scanSecrets(
      `xoxb-${'1'.repeat(24)}\npassword = "abcdefgh1234"\n-----BEGIN RSA PRIVATE KEY-----`,
    );
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.line)).toEqual([1, 2, 3]);
  });

  it('redacts short matches completely', () => {
    expect(redactMatch('ab')).toBe('••••');
    expect(redactMatch('abcdefgh')).toBe('abcd…');
    expect(redactMatch('abcdefgh')).not.toContain('efgh');
  });

  it('exposes a stable rule list with unique ids', () => {
    expect(SECRET_RULES.length).toBeGreaterThanOrEqual(8);
    const ids = SECRET_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of SECRET_RULES) {
      expect(['high', 'medium']).toContain(rule.severity);
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});
