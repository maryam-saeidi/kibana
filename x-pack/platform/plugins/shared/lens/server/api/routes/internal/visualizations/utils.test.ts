/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AS_CODE_DATA_VIEW_REFERENCE_TYPE } from '@kbn/as-code-data-views-schema';
import type { LensApiConfig } from '@kbn/lens-embeddable-utils';
import type { DataView, DataViewsService } from '@kbn/data-views-plugin/common';

import { resolveReferences } from './utils';

function makeDataViewsService(timeFieldByRefId: Record<string, string | undefined>) {
  return {
    get: jest.fn(async (id: string) => {
      if (!(id in timeFieldByRefId)) {
        throw new Error(`data view ${id} not found`);
      }
      // Return a minimal DataView-shaped object; transforms only read timeFieldName from it today.
      return { id, timeFieldName: timeFieldByRefId[id] } as unknown as DataView;
    }),
  } as unknown as DataViewsService;
}

describe('resolveReferences', () => {
  const baseMetric = {
    type: 'metric',
    title: 'm',
    metrics: [{ type: 'primary', operation: 'count', empty_as_null: false }],
    sampling: 1,
    ignore_global_filters: false,
  };

  test('returns an empty dataViewsByRefId when no data_view_reference sources are present', async () => {
    const config = {
      ...baseMetric,
      data_source: { type: 'esql', query: 'from logs* | limit 1' },
    } as unknown as LensApiConfig;
    const svc = makeDataViewsService({});
    const resolved = await resolveReferences(config, svc);
    expect(resolved.dataViewsByRefId?.size).toBe(0);
    expect(svc.get).not.toHaveBeenCalled();
  });

  test('resolves the data view for a top-level data_view_reference source', async () => {
    const config = {
      ...baseMetric,
      data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'dv-1' },
    } as unknown as LensApiConfig;
    const svc = makeDataViewsService({ 'dv-1': 'event_time' });
    const resolved = await resolveReferences(config, svc);
    expect(resolved.dataViewsByRefId?.get('dv-1')?.timeFieldName).toBe('event_time');
  });

  test('includes data views without a timeFieldName (caller falls back to @timestamp)', async () => {
    const config = {
      ...baseMetric,
      data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'dv-no-time' },
    } as unknown as LensApiConfig;
    const svc = makeDataViewsService({ 'dv-no-time': undefined });
    const resolved = await resolveReferences(config, svc);
    expect(resolved.dataViewsByRefId?.has('dv-no-time')).toBe(true);
    expect(resolved.dataViewsByRefId?.get('dv-no-time')?.timeFieldName).toBeUndefined();
  });

  test('tolerates lookup errors so a single missing data view does not break the request', async () => {
    const config = {
      ...baseMetric,
      data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'missing' },
    } as unknown as LensApiConfig;
    const svc = makeDataViewsService({});
    const resolved = await resolveReferences(config, svc);
    expect(resolved.dataViewsByRefId?.size).toBe(0);
  });

  test('deduplicates ref_ids and walks per-layer data_source (xy-style configs)', async () => {
    const config = {
      type: 'xy',
      title: 't',
      layers: [
        {
          type: 'series',
          data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'dv-1' },
        },
        {
          type: 'series',
          data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'dv-2' },
        },
        {
          type: 'series',
          data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'dv-1' },
        },
      ],
    } as unknown as LensApiConfig;
    const svc = makeDataViewsService({ 'dv-1': 't1', 'dv-2': 't2' });
    const resolved = await resolveReferences(config, svc);
    expect(resolved.dataViewsByRefId?.get('dv-1')?.timeFieldName).toBe('t1');
    expect(resolved.dataViewsByRefId?.get('dv-2')?.timeFieldName).toBe('t2');
    expect((svc.get as jest.Mock).mock.calls).toHaveLength(2);
  });
});
