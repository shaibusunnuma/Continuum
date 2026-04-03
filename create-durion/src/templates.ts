/**
 * Template definitions and embedded file contents for project scaffolding.
 *
 * Templates are keyed by name. Each provides the source files that get written
 * into the scaffolded project. Placeholder tokens:
 *   {{projectName}}, {{taskQueue}}, {{llmPackage}}, {{llmImport}},
 *   {{llmModel}}, {{llmApiKeyEnvVar}}
 */

export interface TemplateInfo {
  name: string;
  label: string;
  description: string;
  files: Record<string, string>;
}

export interface LlmProvider {
  id: string;
  label: string;
  package: string;
  importName: string;
  model: string;
  envVar: string;
}

export const LLM_PROVIDERS: LlmProvider[] = [
  {
    id: 'openai',
    label: 'OpenAI (gpt-4o-mini)',
    package: '@ai-sdk/openai',
    importName: 'openai',
    model: "openai.chat('gpt-4o-mini')",
    envVar: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (claude-sonnet-4-20250514)',
    package: '@ai-sdk/anthropic',
    importName: 'anthropic',
    model: "anthropic('claude-sonnet-4-20250514')",
    envVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'google',
    label: 'Google (gemini-2.0-flash)',
    package: '@ai-sdk/google',
    importName: 'google',
    model: "google('gemini-2.0-flash')",
    envVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
  },
];

// ---------------------------------------------------------------------------
// hello template
// ---------------------------------------------------------------------------

const HELLO_WORKFLOWS = `import { workflow } from '@durion/sdk/workflow';

export const hello = workflow('hello', async (ctx) => {
  const reply = await ctx.model('fast', {
    prompt: \`Say hello in one short sentence. Topic: \${ctx.input.topic}\`,
  });

  return {
    text: reply.result,
    costUsd: ctx.metadata.accumulatedCost,
  };
});
`;

const HELLO_WORKER = `import 'dotenv/config';
import { createRuntime, createWorker } from '@durion/sdk';
import { {{llmImport}} } from '{{llmPackage}}';
import { tools } from './tools';

async function main() {
  const runtime = createRuntime({
    models: {
      fast: {{llmModel}},
    },
    tools,
  });

  const worker = await createWorker({
    runtime,
    workflowsPath: require.resolve('./workflows'),
  });

  console.log('Worker started — waiting for tasks...');
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const HELLO_CLIENT = `import 'dotenv/config';
import { createClient } from '@durion/sdk';
import { hello } from './workflows';

async function main() {
  const client = await createClient();

  console.log('Starting hello workflow...');
  const run = await client.start(hello, {
    input: { topic: 'the weather' },
  });

  console.log('Run started:', run.workflowId);
  const result = await run.result();
  console.log('Result:', JSON.stringify(result, null, 2));

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const HELLO_TOOLS = `import { z } from 'zod';
import type { ToolDefinition } from '@durion/sdk';

export const tools: ToolDefinition[] = [
  {
    name: 'get_current_time',
    description: 'Return the current UTC time as an ISO string',
    input: z.object({}),
    output: z.object({ time: z.string() }),
    execute: async () => ({ time: new Date().toISOString() }),
  },
];
`;

// ---------------------------------------------------------------------------
// agent template
// ---------------------------------------------------------------------------

const AGENT_WORKFLOWS = `import { agent } from '@durion/sdk/workflow';

export const assistant = agent('assistant', {
  model: 'fast',
  system: \`You are a helpful assistant. You have access to tools for looking up
information and performing actions. Be concise and helpful.\`,
  maxModelCalls: 10,
});
`;

const AGENT_WORKER = `import 'dotenv/config';
import { createRuntime, createWorker } from '@durion/sdk';
import { {{llmImport}} } from '{{llmPackage}}';
import { tools } from './tools';

async function main() {
  const runtime = createRuntime({
    models: {
      fast: {{llmModel}},
    },
    tools,
  });

  const worker = await createWorker({
    runtime,
    workflowsPath: require.resolve('./workflows'),
  });

  console.log('Worker started — waiting for tasks...');
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const AGENT_CLIENT = `import 'dotenv/config';
import { createClient } from '@durion/sdk';
import { assistant } from './workflows';

async function main() {
  const client = await createClient();

  const message = process.argv[2] || 'What time is it?';
  console.log('Sending:', message);

  const run = await client.start(assistant, {
    input: { message },
  });

  console.log('Run started:', run.workflowId);
  const result = await run.result();
  console.log('Result:', JSON.stringify(result, null, 2));

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const AGENT_TOOLS = `import { z } from 'zod';
import type { ToolDefinition } from '@durion/sdk';

export const tools: ToolDefinition[] = [
  {
    name: 'get_current_time',
    description: 'Return the current UTC time as an ISO string',
    input: z.object({}),
    output: z.object({ time: z.string() }),
    execute: async () => ({ time: new Date().toISOString() }),
  },
  {
    name: 'search_web',
    description: 'Search the web for information on a topic',
    input: z.object({ query: z.string() }),
    output: z.object({
      results: z.array(z.object({
        title: z.string(),
        snippet: z.string(),
      })),
    }),
    execute: async ({ query }) => ({
      results: [
        { title: \`Result for: \${query}\`, snippet: 'This is a placeholder — replace with a real search API.' },
      ],
    }),
  },
];
`;

// ---------------------------------------------------------------------------
// blank template
// ---------------------------------------------------------------------------

const BLANK_WORKFLOWS = `import { workflow } from '@durion/sdk/workflow';

// Define your workflows here.
// See https://github.com/durion-dev/durion/tree/master/docs/getting-started.md

export const myWorkflow = workflow('my-workflow', async (ctx) => {
  // Use ctx.model(), ctx.tool(), etc.
  return { message: 'Hello from Durion!' };
});
`;

const BLANK_WORKER = `import 'dotenv/config';
import { createRuntime, createWorker } from '@durion/sdk';
import { {{llmImport}} } from '{{llmPackage}}';

async function main() {
  const runtime = createRuntime({
    models: {
      fast: {{llmModel}},
    },
    tools: [],
  });

  const worker = await createWorker({
    runtime,
    workflowsPath: require.resolve('./workflows'),
  });

  console.log('Worker started — waiting for tasks...');
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const BLANK_TOOLS = `import type { ToolDefinition } from '@durion/sdk';

// Define your tools here and import them in worker.ts.
export const tools: ToolDefinition[] = [];
`;

// ---------------------------------------------------------------------------
// shared files (all templates)
// ---------------------------------------------------------------------------

const DURION_CONFIG = `import { defineConfig } from '@durion/cli';

export default defineConfig({
  workflowsPath: './src/workflows.ts',
  workerPath: './src/worker.ts',
  gateway: { port: 3000 },
  studio: { port: 4173 },
  temporal: { devServer: true },
});
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`;

const GITIGNORE = `node_modules/
dist/
.durion/
*.js
*.d.ts
*.js.map
!durion.config.ts
`;

function makeEnvFile(envVar: string): string {
  return `# Temporal
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TASK_QUEUE={{taskQueue}}

# LLM
${envVar}=

# Studio gateway auth (optional)
# DURION_GATEWAY_TOKEN=
`;
}

function makePackageJson(template: string): string {
  return `{
  "name": "{{projectName}}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "durion dev",
    "doctor": "durion doctor",
    "studio": "durion studio",
    "client": "ts-node src/client.ts",
    "build": "tsc"
  },
  "dependencies": {
    "@durion/sdk": "^0.3.0",
    "{{llmPackage}}": "latest",
    "zod": "^4.0.0",
    "dotenv": "^17.0.0"
  },
  "devDependencies": {
    "@durion/cli": "^0.1.0",
    "@types/node": "^25.0.0",
    "ts-node": "^10.9.0",
    "tsx": "^4.19.0",
    "typescript": "^5.9.0"
  }
}
`;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TEMPLATES: TemplateInfo[] = [
  {
    name: 'hello',
    label: 'Hello World',
    description: 'Minimal workflow — one model call',
    files: {
      'src/workflows.ts': HELLO_WORKFLOWS,
      'src/worker.ts': HELLO_WORKER,
      'src/client.ts': HELLO_CLIENT,
      'src/tools/index.ts': HELLO_TOOLS,
      'durion.config.ts': DURION_CONFIG,
      'tsconfig.json': TSCONFIG,
      '.gitignore': GITIGNORE,
    },
  },
  {
    name: 'agent',
    label: 'Agent',
    description: 'Autonomous agent with tools and conversation',
    files: {
      'src/workflows.ts': AGENT_WORKFLOWS,
      'src/worker.ts': AGENT_WORKER,
      'src/client.ts': AGENT_CLIENT,
      'src/tools/index.ts': AGENT_TOOLS,
      'durion.config.ts': DURION_CONFIG,
      'tsconfig.json': TSCONFIG,
      '.gitignore': GITIGNORE,
    },
  },
  {
    name: 'blank',
    label: 'Blank',
    description: 'Project structure only — no example code',
    files: {
      'src/workflows.ts': BLANK_WORKFLOWS,
      'src/worker.ts': BLANK_WORKER,
      'src/tools/index.ts': BLANK_TOOLS,
      'durion.config.ts': DURION_CONFIG,
      'tsconfig.json': TSCONFIG,
      '.gitignore': GITIGNORE,
    },
  },
];

/**
 * Resolve a template by name; returns undefined if not found.
 */
export function getTemplate(name: string): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.name === name);
}

/**
 * Generate the full set of files for a template, with placeholders replaced.
 */
export function renderTemplate(
  template: TemplateInfo,
  vars: {
    projectName: string;
    taskQueue: string;
    llmPackage: string;
    llmImport: string;
    llmModel: string;
    llmApiKeyEnvVar: string;
  },
): Record<string, string> {
  const result: Record<string, string> = {};

  const allFiles = {
    ...template.files,
    'package.json': makePackageJson(template.name),
    '.env': makeEnvFile(vars.llmApiKeyEnvVar),
  };

  for (const [filepath, content] of Object.entries(allFiles)) {
    let rendered = content;
    rendered = rendered.replace(/\{\{projectName\}\}/g, vars.projectName);
    rendered = rendered.replace(/\{\{taskQueue\}\}/g, vars.taskQueue);
    rendered = rendered.replace(/\{\{llmPackage\}\}/g, vars.llmPackage);
    rendered = rendered.replace(/\{\{llmImport\}\}/g, vars.llmImport);
    rendered = rendered.replace(/\{\{llmModel\}\}/g, vars.llmModel);
    rendered = rendered.replace(/\{\{llmApiKeyEnvVar\}\}/g, vars.llmApiKeyEnvVar);
    result[filepath] = rendered;
  }

  return result;
}
