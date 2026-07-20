import { MessagingProvider } from './types';
import { createMockProvider } from './providers/mock';
import { createMsg91Provider } from './providers/msg91';

/**
 * Adding a provider is two lines: an adapter file implementing MessagingProvider, and one
 * entry here. Nothing else in the codebase learns the provider's name.
 */
export const PROVIDER_FACTORIES: Record<string, (env: NodeJS.ProcessEnv) => MessagingProvider> = {
  mock: () => createMockProvider(),
  msg91: (env) => createMsg91Provider(env),
};

export function selectProvider(name: string, env: NodeJS.ProcessEnv): MessagingProvider {
  const factory = PROVIDER_FACTORIES[name];
  if (!factory) {
    throw new Error(
      `[messaging] MESSAGING_PROVIDER="${name}" is not a registered provider. ` +
      `Available: ${Object.keys(PROVIDER_FACTORIES).join(', ')}.`
    );
  }

  const provider = factory(env);
  // Validate here rather than at first send: a missing credential should stop the process
  // at boot, not strand a user on the code-entry screen.
  provider.init();
  return provider;
}
