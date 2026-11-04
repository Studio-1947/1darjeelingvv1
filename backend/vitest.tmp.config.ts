import base from './vitest.config';
const env = { ...(base as any).test.env, DATABASE_URL: 'postgres://postgres:postgres@localhost:5434/one_darjeeling_test', MINIO_ENDPOINT: 'http://127.0.0.1:1' };
export default { ...base, test: { ...(base as any).test, env } };
