import { describe, expect, it } from 'vitest';
import {
  ResourceBudget,
  estimateCompressionCost,
  estimateHeicCost,
  getBudgetCapacity,
} from './resourceBudget';

const MB = 1024 * 1024;

describe('ResourceBudget', () => {
  it('runs small reservations together and queues ones that do not fit', async () => {
    const budget = new ResourceBudget(100);
    const releaseA = await budget.acquire(40);
    const releaseB = await budget.acquire(40);
    expect(budget.usedBytes).toBe(80);

    let started = false;
    const pending = budget.acquire(40).then((release) => {
      started = true;
      return release;
    });
    await Promise.resolve();
    expect(started).toBe(false);

    releaseA();
    const releaseC = await pending;
    expect(started).toBe(true);
    expect(budget.usedBytes).toBe(80);
    releaseB();
    releaseC();
    expect(budget.usedBytes).toBe(0);
  });

  it('runs an oversized reservation alone instead of never', async () => {
    const budget = new ResourceBudget(100);
    const release = await budget.acquire(500);
    expect(budget.usedBytes).toBe(500);
    let second = false;
    const next = budget.acquire(1).then((r) => {
      second = true;
      return r;
    });
    await Promise.resolve();
    expect(second).toBe(false);
    release();
    (await next)();
    expect(budget.usedBytes).toBe(0);
  });

  it('serves waiters in order and removes aborted waiters', async () => {
    const budget = new ResourceBudget(10);
    const hold = await budget.acquire(10);
    const controller = new AbortController();
    const order: string[] = [];
    const aborted = budget.acquire(5, controller.signal).then(
      () => order.push('aborted-started'),
      (error: Error) => order.push(error.name),
    );
    const later = budget.acquire(5).then((release) => {
      order.push('later');
      return release;
    });
    controller.abort();
    await aborted;
    expect(budget.pendingCount).toBe(1);
    hold();
    (await later)();
    expect(order).toEqual(['AbortError', 'later']);
  });

  it('ignores a second release', async () => {
    const budget = new ResourceBudget(10);
    const release = await budget.acquire(6);
    release();
    release();
    expect(budget.usedBytes).toBe(0);
  });

  it('counts the decoded source as well as the target and encoder memory', () => {
    const source = { width: 8000, height: 6000 };
    const small = { width: 1920, height: 1440 };
    expect(estimateCompressionCost(source, small, 'mozjpeg')).toBeGreaterThan(
      source.width * source.height * 4,
    );
    expect(estimateCompressionCost(source, source, 'avif')).toBeGreaterThan(
      estimateCompressionCost(source, source, 'mozjpeg'),
    );
    expect(estimateHeicCost(3 * MB, 24_000_000)).toBeGreaterThan(24_000_000 * 4 * 3);
  });

  it('uses a smaller budget on low-resource devices', () => {
    expect(getBudgetCapacity({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(384 * MB);
    expect(getBudgetCapacity({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(1024 * MB);
  });
});
