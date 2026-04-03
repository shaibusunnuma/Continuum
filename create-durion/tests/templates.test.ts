import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  LLM_PROVIDERS,
  getTemplate,
  renderTemplate,
} from '../src/templates';

describe('TEMPLATES', () => {
  it('has hello, agent, and blank templates', () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(names).toContain('hello');
    expect(names).toContain('agent');
    expect(names).toContain('blank');
  });

  it('each template has required files', () => {
    for (const tmpl of TEMPLATES) {
      expect(tmpl.files).toHaveProperty('src/workflows.ts');
      expect(tmpl.files).toHaveProperty('src/worker.ts');
      expect(tmpl.files).toHaveProperty('durion.config.ts');
      expect(tmpl.files).toHaveProperty('tsconfig.json');
      expect(tmpl.files).toHaveProperty('.gitignore');
    }
  });

  it('workflow files import from @durion/sdk/workflow, not @durion/sdk', () => {
    for (const tmpl of TEMPLATES) {
      const workflows = tmpl.files['src/workflows.ts'];
      expect(workflows).toContain("@durion/sdk/workflow");
      expect(workflows).not.toMatch(/from\s+['"]@durion\/sdk['"]/);
    }
  });

  it('worker files import from @durion/sdk (main)', () => {
    for (const tmpl of TEMPLATES) {
      const worker = tmpl.files['src/worker.ts'];
      expect(worker).toContain("from '@durion/sdk'");
    }
  });

  it('worker files use async function main pattern (no top-level await)', () => {
    for (const tmpl of TEMPLATES) {
      const worker = tmpl.files['src/worker.ts'];
      expect(worker).toContain('async function main()');
      expect(worker).toContain('main().catch');
      expect(worker).not.toMatch(/^const worker = await/m);
    }
  });

  it('tsconfig uses Node16 module resolution', () => {
    for (const tmpl of TEMPLATES) {
      const tsconfig = tmpl.files['tsconfig.json'];
      expect(tsconfig).toContain('"module": "Node16"');
      expect(tsconfig).toContain('"moduleResolution": "Node16"');
    }
  });
});

describe('LLM_PROVIDERS', () => {
  it('has openai, anthropic, and google', () => {
    const ids = LLM_PROVIDERS.map((l) => l.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('anthropic');
    expect(ids).toContain('google');
  });

  it('each provider has required fields', () => {
    for (const llm of LLM_PROVIDERS) {
      expect(llm.package).toBeTruthy();
      expect(llm.importName).toBeTruthy();
      expect(llm.model).toBeTruthy();
      expect(llm.envVar).toBeTruthy();
    }
  });
});

describe('getTemplate', () => {
  it('finds template by name', () => {
    expect(getTemplate('hello')).toBeDefined();
    expect(getTemplate('hello')!.name).toBe('hello');
  });

  it('returns undefined for unknown template', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });
});

describe('renderTemplate', () => {
  it('substitutes all placeholders', () => {
    const tmpl = getTemplate('hello')!;
    const files = renderTemplate(tmpl, {
      projectName: 'test-proj',
      taskQueue: 'test-proj',
      llmPackage: '@ai-sdk/openai',
      llmImport: 'openai',
      llmModel: "openai.chat('gpt-4o-mini')",
      llmApiKeyEnvVar: 'OPENAI_API_KEY',
    });

    // package.json should have project name
    expect(files['package.json']).toContain('"name": "test-proj"');
    expect(files['package.json']).toContain('@ai-sdk/openai');

    // .env should have task queue and api key var
    expect(files['.env']).toContain('TASK_QUEUE=test-proj');
    expect(files['.env']).toContain('OPENAI_API_KEY=');

    // worker should have resolved LLM import
    expect(files['src/worker.ts']).toContain("import { openai } from '@ai-sdk/openai'");
    expect(files['src/worker.ts']).toContain("openai.chat('gpt-4o-mini')");

    // no unresolved placeholders
    for (const [, content] of Object.entries(files)) {
      expect(content).not.toContain('{{');
      expect(content).not.toContain('}}');
    }
  });

  it('works with anthropic provider', () => {
    const tmpl = getTemplate('agent')!;
    const files = renderTemplate(tmpl, {
      projectName: 'my-agent',
      taskQueue: 'my-agent',
      llmPackage: '@ai-sdk/anthropic',
      llmImport: 'anthropic',
      llmModel: "anthropic('claude-sonnet-4-20250514')",
      llmApiKeyEnvVar: 'ANTHROPIC_API_KEY',
    });

    expect(files['src/worker.ts']).toContain("import { anthropic } from '@ai-sdk/anthropic'");
    expect(files['.env']).toContain('ANTHROPIC_API_KEY=');
  });

  it('includes all expected file paths', () => {
    const tmpl = getTemplate('hello')!;
    const files = renderTemplate(tmpl, {
      projectName: 'x',
      taskQueue: 'x',
      llmPackage: 'p',
      llmImport: 'i',
      llmModel: 'm',
      llmApiKeyEnvVar: 'K',
    });

    const paths = Object.keys(files).sort();
    expect(paths).toContain('package.json');
    expect(paths).toContain('.env');
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('durion.config.ts');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('src/workflows.ts');
    expect(paths).toContain('src/worker.ts');
    expect(paths).toContain('src/client.ts');
    expect(paths).toContain('src/tools/index.ts');
  });
});
