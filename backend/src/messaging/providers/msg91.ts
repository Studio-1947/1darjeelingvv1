import { MessagingProvider } from '../types';

export function createMsg91Provider(env: NodeJS.ProcessEnv): MessagingProvider {
  return {
    name: 'msg91',

    init() {
      const missing = ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID'].filter((k) => !env[k]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `[messaging] MESSAGING_PROVIDER=msg91 requires ${missing.join(', ')}. ` +
          `Set them, or use MESSAGING_PROVIDER=mock.`
        );
      }
    },

    async sendOtp() {
      throw new Error('not implemented — see Task 2');
    },
  };
}
