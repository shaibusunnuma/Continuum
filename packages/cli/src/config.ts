import path from 'node:path';

export interface DurionConfig {
  /** Path to the workflow-safe file that Temporal bundles (relative to project root). */
  workflowsPath: string;

  /** Path to the worker entry point (relative to project root). */
  workerPath: string;

  /** Built-in gateway settings. Set to false to disable. */
  gateway?: false | {
    port?: number;
    host?: string;
  };

  /** Studio settings. Set to false to disable. */
  studio?: false | {
    port?: number;
  };

  /** Temporal dev server management. Set to false to disable. */
  temporal?: false | {
    devServer?: boolean;
    address?: string;
    namespace?: string;
    uiPort?: number;
  };
}

export function defineConfig(config: DurionConfig): DurionConfig {
  return config;
}

const CONFIG_FILENAMES = ['durion.config.ts', 'durion.config.js', 'durion.config.mjs'];

/**
 * Load durion.config.ts from the project root using jiti (no build step needed).
 * Returns defaults if no config file is found.
 */
export async function loadConfig(projectRoot: string): Promise<DurionConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = path.join(projectRoot, filename);
    try {
      const { createJiti } = await import('jiti');
      const jiti = createJiti(projectRoot, { interopDefault: true });
      const mod = await jiti.import(filepath) as { default?: DurionConfig } & DurionConfig;
      const config = mod.default ?? mod;
      if (config && typeof config.workflowsPath === 'string') {
        return config;
      }
    } catch {
      continue;
    }
  }

  return {
    workflowsPath: './src/workflows.ts',
    workerPath: './src/worker.ts',
    gateway: { port: 3000 },
    studio: { port: 4173 },
    temporal: { devServer: true },
  };
}

export function resolveGatewayPort(config: DurionConfig): number | null {
  if (config.gateway === false) return null;
  return config.gateway?.port ?? 3000;
}

export function resolveStudioPort(config: DurionConfig): number | null {
  if (config.studio === false) return null;
  return config.studio?.port ?? 4173;
}

export function resolveTemporalConfig(config: DurionConfig) {
  if (config.temporal === false) {
    return { devServer: false, address: 'localhost:7233', namespace: 'default', uiPort: 8233 };
  }
  return {
    devServer: config.temporal?.devServer ?? true,
    address: config.temporal?.address ?? 'localhost:7233',
    namespace: config.temporal?.namespace ?? 'default',
    uiPort: config.temporal?.uiPort ?? 8233,
  };
}
