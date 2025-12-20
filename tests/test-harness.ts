type TestCase = { name: string; fn: () => void | Promise<void> };

const cases: TestCase[] = [];

export function test(name: string, fn: () => void | Promise<void>) {
  cases.push({ name, fn });
}

export function assert(condition: any, message: string) {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === "object";
}

export function assertDeepEqual(actual: any, expected: any, message?: string) {
  if (actual === expected) return;

  if (Array.isArray(actual) && Array.isArray(expected)) {
    assertEqual(actual.length, expected.length, message ?? "Array length mismatch");
    for (let i = 0; i < actual.length; i++) {
      assertDeepEqual(actual[i], expected[i], message);
    }
    return;
  }

  if (isObject(actual) && isObject(expected)) {
    const aKeys = Object.keys(actual).sort();
    const eKeys = Object.keys(expected).sort();
    assertDeepEqual(aKeys, eKeys, message ?? "Object keys mismatch");
    for (const k of aKeys) {
      assertDeepEqual(actual[k], expected[k], message);
    }
    return;
  }

  throw new Error(message ?? `Expected deep-equal values but got ${String(actual)} vs ${String(expected)}`);
}

export async function run() {
  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    try {
      await c.fn();
      passed += 1;
    } catch (err: any) {
      failed += 1;
      console.error(`FAIL: ${c.name}`);
      console.error(err?.stack ?? err);
    }
  }

  console.log(`\nTests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }
}

