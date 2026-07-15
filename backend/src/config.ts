import Razorpay from 'razorpay';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

export const PORT = process.env.PORT || 8000;
export const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey12345!';
export const MOCK_PAYMENTS = process.env.MOCK_PAYMENTS ? process.env.MOCK_PAYMENTS.toLowerCase() === 'true' : true;
export const APP_ENV = process.env.APP_ENV || 'development';
export const IS_PROD = APP_ENV === 'production';
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
export const ADMIN_BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET || '';
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpassword123';

export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadminpassword';
export const MINIO_BUCKET = process.env.MINIO_BUCKET || 'one-darjeeling';
export const MINIO_PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';

export const rzpClient = RAZORPAY_KEY_SECRET ? new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
}) : null;

export const AMOUNTS: Record<string, number> = {
  provider_registration: 9900,
  booking_commission: 100
};

// Logging setup
export const log = {
  info: (msg: string) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
};
