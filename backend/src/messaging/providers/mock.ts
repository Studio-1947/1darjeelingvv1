import { log } from '../../config';
import { MessagingProvider, OtpMessage } from '../types';

/**
 * Delivers nothing and says so. Preserves the pre-existing dev behaviour of logging the
 * code, now behind the provider interface. The route is what surfaces the code in the
 * response body; this adapter only logs.
 */
export function createMockProvider(): MessagingProvider {
  return {
    name: 'mock',

    init() {
      // No configuration to validate.
    },

    async sendOtp({ phone, otp }: OtpMessage) {
      log.info(`[MOCK OTP] phone=****${phone.slice(-4)} otp=${otp}`);
      return {};
    },
  };
}
