import { log } from '../../config';
import { MessagingProvider, NotificationMessage, OtpMessage } from '../types';

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

    async sendOtp({ phone, otp, channel }: OtpMessage) {
      log.info(`[MOCK OTP] phone=****${phone.slice(-4)} otp=${otp}`);
      // Nothing is actually delivered, so the only honest answer is to echo back whatever
      // channel was requested — there is no real channel to report.
      return { channel };
    },

    async sendNotification({ phone, template, text }: NotificationMessage) {
      // Logs the readable text rather than the template id, so a developer can see the message a
      // real user would have received without looking anything up.
      log.info(`[MOCK NOTIFY] template=${template} phone=****${phone.slice(-4)} :: ${text}`);
      return { channel: 'mock' };
    },
  };
}
