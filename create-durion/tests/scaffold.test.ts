import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { scaffold } from '../src/scaffold';
import { getTemplate, LLM_PROVIDERS } from '../src/templates';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'durion-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('scaffold', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir) cleanup(testDir);
  });

  it('creates all expected files for hello template', () => {
    testDir = makeTempDir();
    const projectDir = path.join(testDir, 'my-app');
    fs.mkdirSync(projectDir);

    scaffold({
      projectName: 'my-app',
      projectDir,
      template: getTemplate('hello')!,
      llm: LLM_PROVIDERS[0],
    });

    expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'durion.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'src', 'workflows.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'src', 'worker.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'src', 'client.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'src', 'tools', 'index.ts'))).toBe(true);
  });

  it('substitutes project name in package.json', () => {
    testDir = makeTempDir();
    const projectDir = path.join(testDir, 'test-proj');
    fs.mkdirSync(projectDir);

    scaffold({
      projectName: 'test-proj',
      projectDir,
      template: getTemplate('hello')!,
      llm: LLM_PROVIDERS[0],
    });

    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('test-proj');
  });

  it('injects API key into .env when provided', () => {
    testDir = makeTempDir();
    const projectDir = path.join(testDir, 'key-test');
    fs.mkdirSync(projectDir);

    scaffold({
      projectName: 'key-test',
      projectDir,
      template: getTemplate('hello')!,
      llm: LLM_PROVIDERS[0],
      apiKey: 'sk-test-123',
    });

    const env = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
    expect(env).toContain('OPENAI_API_KEY=sk-test-123');
  });

  it('leaves API key blank when not provided', () => {
    testDir = makeTempDir();
    const projectDir = path.join(testDir, 'no-key');
    fs.mkdirSync(projectDir);

    scaffold({
      projectName: 'no-key',
      projectDir,
      template: getTemplate('hello')!,
      llm: LLM_PROVIDERS[0],
    });

    const env = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
    expect(env).toContain('OPENAI_API_KEY=\n');
  });

  it('creates nested directories for tools', () => {
    testDir = makeTempDir();
    const projectDir = path.join(testDir, 'nested');
    fs.mkdirSync(projectDir);

    scaffold({
      projectName: 'nested',
      projectDir,
      template: getTemplate('agent')!,
      llm: LLM_PROVIDERS[1],
    });

    expect(fs.existsSync(path.join(projectDir, 'src', 'tools', 'index.ts'))).toBe(true);
    const worker = fs.readFileSync(path.join(projectDir, 'src', 'worker.ts'), 'utf-8');
    expect(worker).toContain("import { anthropic } from '@ai-sdk/anthropic'");
  });
});
