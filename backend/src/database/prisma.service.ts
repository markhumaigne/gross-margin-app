import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';

export type Db = PrismaClient | Prisma.TransactionClient;

/** Splits the `schema` parameter off a connection string: pg does not understand it. */
function adapterFor(connectionString: string): PrismaPg {
  let rest = connectionString;
  let schema = 'public';
  try {
    const url = new URL(connectionString);
    schema = url.searchParams.get('schema') || 'public';
    url.searchParams.delete('schema');
    rest = url.toString();
  } catch {
    // Not a parseable URL (for example unset): leave it for pg to report on first use.
  }
  return new PrismaPg({ connectionString: rest }, { schema });
}

/** Never connects until the first query. */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: adapterFor(connectionString) });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: adapterFor(process.env['DATABASE_URL'] ?? '') });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
