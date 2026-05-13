/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DatasourceStates, LensDocument, MetricVisualizationState } from '@kbn/lens-common';
import { LENS_DATASOURCE_ID } from '@kbn/lens-common';
import { LENS_ITEM_LATEST_VERSION } from '@kbn/lens-common/content_management/constants';
import {
  normalizeMetricDocumentForEquality,
  postProcessMetricLoadedState,
} from './state_post_processing';

describe('metric state post processing', () => {
  const primaryLayerId = 'dea2a641-2db2-49d9-95db-b79217f717d2';
  const trendlineLayerId = 'e92439c8-dcc7-4cde-8e4f-3d8f189e4556';
  const primaryMetricId = '29480907-59b6-4d57-990a-8548b0c29f8b';
  const trendlineTimeId = 'ac1712f6-7dc9-4390-b69a-93a141959ca2';
  const trendlineMetricId = '2f1cbb38-62af-4200-bdcc-1fea6cd06b3a';

  const visualizationState: MetricVisualizationState = {
    layerId: primaryLayerId,
    layerType: 'data',
    metricAccessor: primaryMetricId,
    trendlineLayerId,
    trendlineLayerType: 'metricTrendline',
    trendlineMetricAccessor: trendlineMetricId,
    trendlineTimeAccessor: trendlineTimeId,
  };

  const datasourceStates: DatasourceStates = {
    [LENS_DATASOURCE_ID.FORM_BASED]: {
      isLoading: false,
      state: {
        currentIndexPatternId: '1',
        layers: {
          [primaryLayerId]: {
            indexPatternId: '1',
            columnOrder: [primaryMetricId],
            columns: {
              [primaryMetricId]: {
                label: 'Count of records',
                dataType: 'number',
                operationType: 'count',
                isBucketed: false,
                sourceField: '___records___',
              },
            },
            incompleteColumns: {},
          },
          [trendlineLayerId]: {
            indexPatternId: '1',
            linkToLayers: [primaryLayerId],
            columnOrder: [trendlineTimeId, trendlineMetricId],
            columns: {
              [trendlineTimeId]: {
                label: '',
                dataType: 'date',
                operationType: 'date_histogram',
                sourceField: '',
                isBucketed: true,
                params: {
                  interval: 'auto',
                  includeEmptyRows: true,
                  dropPartials: false,
                },
              },
              [trendlineMetricId]: {
                label: 'Count of records',
                dataType: 'number',
                operationType: 'count',
                isBucketed: false,
                sourceField: '___records___',
              },
            },
            sampling: 1,
            ignoreGlobalFilters: false,
            incompleteColumns: {},
          },
        },
      },
    },
  };

  it('hydrates the trendline time field using visualization pointers', () => {
    const result = postProcessMetricLoadedState({
      visualizationState,
      datasourceStates,
      indexPatterns: {
        '1': {
          id: '1',
          title: 'test-*',
          timeFieldName: 'start_timestamp',
          getFieldByName: jest.fn(() => ({ displayName: 'Start timestamp' })),
        },
      } as never,
    });

    const hydratedColumn = (
      result.datasourceStates[LENS_DATASOURCE_ID.FORM_BASED].state as {
        layers: Record<
          string,
          { columns: Record<string, { sourceField?: string; label?: string }> }
        >;
      }
    ).layers[trendlineLayerId].columns[trendlineTimeId];

    expect(hydratedColumn.sourceField).toBe('start_timestamp');
    expect(hydratedColumn.label).toBe('Start timestamp');
  });

  it('normalizes hydrated trendline fields for equality', () => {
    const doc: LensDocument = {
      title: 'metric-doc',
      visualizationType: 'lnsMetric',
      state: {
        query: {
          query: '',
          language: 'kuery',
        },
        visualization: visualizationState,
        datasourceStates: {
          [LENS_DATASOURCE_ID.FORM_BASED]: {
            layers: {
              [primaryLayerId]: {
                columnOrder: [primaryMetricId],
                columns: {
                  [primaryMetricId]: {
                    label: 'Count of records',
                    dataType: 'number',
                    operationType: 'count',
                    isBucketed: false,
                    sourceField: '___records___',
                  },
                },
              },
              [trendlineLayerId]: {
                linkToLayers: [primaryLayerId],
                columnOrder: [trendlineTimeId, trendlineMetricId],
                columns: {
                  [trendlineTimeId]: {
                    label: 'Start timestamp',
                    dataType: 'date',
                    operationType: 'date_histogram',
                    sourceField: 'start_timestamp',
                    isBucketed: true,
                    params: {
                      interval: 'auto',
                    },
                  },
                  [trendlineMetricId]: {
                    label: 'Count of records',
                    dataType: 'number',
                    operationType: 'count',
                    isBucketed: false,
                    sourceField: '___records___',
                  },
                },
                sampling: 1,
                ignoreGlobalFilters: false,
              },
            },
          },
        },
        filters: [],
      },
      references: [],
      version: LENS_ITEM_LATEST_VERSION,
    };

    const normalizedDoc = normalizeMetricDocumentForEquality(structuredClone(doc));
    const normalizedColumn = (
      normalizedDoc.state.datasourceStates[LENS_DATASOURCE_ID.FORM_BASED] as {
        layers: Record<
          string,
          { columns: Record<string, { sourceField?: string; label?: string }> }
        >;
      }
    ).layers[trendlineLayerId].columns[trendlineTimeId];

    expect(normalizedColumn.sourceField).toBe('');
    expect(normalizedColumn.label).toBe('');
  });
});
