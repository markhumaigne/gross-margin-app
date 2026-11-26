import assert from 'node:assert/strict';

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

export const tests: TestCase[] = [];

export function test(name: string, run: () => void | Promise<void>): void {
  tests.push({ name, run });
}

export async function runAll(): Promise<void> {
  let passed = 0;
  for (const t of tests) {
    try {
      await t.run();
      passed++;
      console.log('PASS ' + t.name);
    } catch (e) {
      console.error('FAIL ' + t.name, e);
      process.exitCode = 1;
    }
  }
  console.log(passed + '/' + tests.length + ' checks passed.');
}

export { assert };
