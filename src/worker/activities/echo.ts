import type { EchoInput, EchoOutput } from '../../shared/types';

export async function echo(input: EchoInput): Promise<EchoOutput> {
  return { echoed: input.message };
}
