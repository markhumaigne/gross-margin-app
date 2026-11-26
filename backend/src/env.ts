type Env = Record<string, string | undefined>;

/** Fails once, naming every runtime variable that is missing or invalid. */
export function requireRuntimeEnv(env: Env = process.env): void {
  const problems: string[] = [];
  if (!env['DATABASE_URL']?.trim()) problems.push('DATABASE_URL is not set');
  const secret = env['AUTH_SECRET'] ?? '';
  if (!secret) problems.push('AUTH_SECRET is not set');
  else if (secret.length < 32) problems.push('AUTH_SECRET must be at least 32 characters');
  if (problems.length > 0)
    throw new Error('Invalid server configuration: ' + problems.join('; ') + '.');
}

/** The `schema` parameter of a connection string; Postgres defaults to `public`. */
export function schemaOf(url: string): string {
  try {
    return new URL(url).searchParams.get('schema') || 'public';
  } catch {
    return 'public';
  }
}

/**
 * Settings for the test database. Every data-deleting path goes through this, so it refuses
 * unless both URLs are set, share one non-public schema and differ from the real URLs.
 */
export function testDatabase(env: Env = process.env): {
  databaseUrl: string;
  directUrl: string;
  schema: string;
} {
  const refuse = (why: string): never => {
    throw new Error(
      'Test database not configured: ' +
        why +
        ' Set TEST_DATABASE_URL and TEST_DIRECT_URL in backend/.env (the real URLs plus schema=test).',
    );
  };
  const databaseUrl = env['TEST_DATABASE_URL']?.trim();
  const directUrl = env['TEST_DIRECT_URL']?.trim();
  if (!databaseUrl || !directUrl)
    return refuse('TEST_DATABASE_URL and TEST_DIRECT_URL are required.');
  const schema = schemaOf(databaseUrl);
  if (schema === 'public' || schemaOf(directUrl) !== schema)
    return refuse('both URLs must carry the same schema parameter, and it must not be "public".');
  const real = [env['DATABASE_URL'], env['DIRECT_URL']];
  if (real.includes(databaseUrl) || real.includes(directUrl))
    return refuse('the test URLs must differ from DATABASE_URL and DIRECT_URL.');
  return { databaseUrl, directUrl, schema };
}
