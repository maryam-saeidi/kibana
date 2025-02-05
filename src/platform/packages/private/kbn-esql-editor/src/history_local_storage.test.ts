/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { addQueriesToCache, getCachedQueries } from './history_local_storage';

class LocalStorageMock {
  public store: Record<string, unknown>;
  constructor(defaultStore: Record<string, unknown>) {
    this.store = defaultStore;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] || null;
  }
  setItem(key: string, value: unknown) {
    this.store[key] = String(value);
  }
}

describe('history local storage', function () {
  const storage = new LocalStorageMock({}) as unknown as Storage;
  Object.defineProperty(window, 'localStorage', {
    value: storage,
  });

  it('should add queries to cache correctly ', function () {
    addQueriesToCache({
      queryString: 'from kibana_sample_data_flights | limit 10',
      status: 'success',
    });
    const historyItems = getCachedQueries();
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].timeRan).toBeDefined();
    expect(historyItems[0].status).toBeDefined();
  });

  it('should add a second query to cache correctly ', function () {
    addQueriesToCache({
      queryString: 'from kibana_sample_data_flights \n | limit 10 \n | stats meow = avg(woof)',
      status: 'error',
    });

    const historyItems = getCachedQueries();
    expect(historyItems.length).toBe(2);
    expect(historyItems[1].timeRan).toBeDefined();
    expect(historyItems[1].status).toBe('error');
  });

  it('should update queries to cache correctly if they are the same with different format', function () {
    addQueriesToCache({
      queryString: 'from kibana_sample_data_flights | limit 10 | stats meow = avg(woof)      ',
      status: 'success',
    });

    const historyItems = getCachedQueries();
    expect(historyItems.length).toBe(2);
    expect(historyItems[0].timeRan).toBeDefined();
    expect(historyItems[0].status).toBe('success');
  });

  it('should allow maximum x queries ', function () {
    addQueriesToCache(
      {
        queryString: 'row 1',
        status: 'success',
      },
      2
    );
    const historyItems = getCachedQueries();
    expect(historyItems.length).toBe(2);
  });
});
