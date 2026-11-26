import 'reflect-metadata';
import { config } from 'dotenv';
import { createApplication } from './create-app';
import { requireRuntimeEnv } from './env';
async function bootstrap() {
  config({ quiet: true });
  requireRuntimeEnv();
  const app = await createApplication();
  await app.listen(Number(process.env.PORT || 3000), '127.0.0.1');
  console.log('Bank rate API ready at http://127.0.0.1:' + Number(process.env.PORT || 3000));
}
void bootstrap();
