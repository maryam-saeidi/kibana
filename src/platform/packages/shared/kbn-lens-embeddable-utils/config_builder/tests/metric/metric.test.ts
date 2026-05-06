/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_DATA_VIEW_SPEC_TYPE,
} from '@kbn/as-code-data-views-schema';
import type { FormBasedPersistedState, DateHistogramIndexPatternColumn } from '@kbn/lens-common';

import { validator } from '../utils/validator';
import type { MetricConfig } from '../../schema/charts/metric';
import { AUTO_COLOR, NO_COLOR } from '../../schema/color';
import { LensConfigBuilder } from '../../config_builder';
import {
  simpleMetricAttributes,
  breakdownMetricAttributes,
  complexMetricAttributes,
  breakdownMetricWithFormulaRefColumnsAttributes,
  selectorColorByValueAttributes,
  defaultColorByValueAttributes,
  dynamicColorsMetricAttributes,
} from './lens_state_config.mock';
import {
  simpleMetricAPIAttributes,
  breakdownMetricAPIAttributes,
  complexMetricAPIAttributes,
  complexESQLMetricAPIAttributes,
  metricAPIWithTermsRankedBySecondary,
} from './lens_api_config.mock';

describe('Metric', () => {
  describe('state transform validation', () => {
    it('should convert a simple metric', () => {
      validator.metric.fromState(simpleMetricAttributes);
    });

    it('should convert a complex metric', () => {
      validator.metric.fromState(complexMetricAttributes);
    });

    it('should convert a breakdown-by metric', () => {
      validator.metric.fromState(breakdownMetricAttributes);
    });

    it('should convert a breakdown-by metric with formula reference columns and rank_by in the terms bucket operation', () => {
      validator.metric.fromState(breakdownMetricWithFormulaRefColumnsAttributes);
    });

    it('should convert a default color by value palette', () => {
      validator.metric.fromState(defaultColorByValueAttributes);
    });

    it('should convert a selector color by value palette', () => {
      validator.metric.fromState(selectorColorByValueAttributes);
    });

    it('should convert a dynamic colors metric', () => {
      validator.metric.fromState(dynamicColorsMetricAttributes);
    });
  });

  describe('api transform validation', () => {
    it('should convert a simple metric', () => {
      validator.metric.fromApi(simpleMetricAPIAttributes);
    });

    it('should convert a complex metric', () => {
      validator.metric.fromApi(complexMetricAPIAttributes);
    });

    it('should convert a breakdown-by metric', () => {
      validator.metric.fromApi(breakdownMetricAPIAttributes);
    });

    it('should convert a complex ESQL metric chart', () => {
      validator.metric.fromApi(complexESQLMetricAPIAttributes);
    });

    it('should convert a metric with a terms agg ranked by secondary metric', () => {
      validator.metric.fromApi(metricAPIWithTermsRankedBySecondary);
    });
  });

  describe('color default application', () => {
    const baseMetric = {
      type: 'metric',
      title: 'Color default test',
      data_source: {
        type: AS_CODE_DATA_VIEW_SPEC_TYPE,
        index_pattern: 'test-index',
        time_field: '@timestamp',
      },
      metrics: [
        {
          type: 'primary',
          operation: 'count',
          empty_as_null: false,
        },
      ],
      sampling: 1,
      ignore_global_filters: false,
    } satisfies MetricConfig;

    it('should emit AUTO_COLOR for primary metric when no color is specified', () => {
      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(baseMetric);
      const apiOutput = builder.toAPIFormat(lensState) as MetricConfig;

      expect(apiOutput.metrics[0].color).toEqual(AUTO_COLOR);
    });

    it('should emit NO_COLOR for secondary metric when no color is specified', () => {
      const config = {
        ...baseMetric,
        metrics: [
          ...baseMetric.metrics,
          {
            type: 'secondary',
            operation: 'average',
            field: 'bytes',
          },
        ],
      } satisfies MetricConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const apiOutput = builder.toAPIFormat(lensState) as MetricConfig;

      expect(apiOutput.metrics[0].color).toEqual(AUTO_COLOR);
      expect(apiOutput.metrics[1].color).toEqual(NO_COLOR);
    });
  });

  // Regression coverage for https://github.com/elastic/kibana/issues/265832:
  // when using a saved data view by reference, the trendline date histogram must
  // pick up the user-supplied `time_field` instead of hardcoding `@timestamp`.
  describe('trendline time field for data_view_reference (issue #265832)', () => {
    const buildMetricWithTrend = (dataSource: MetricConfig['data_source']): MetricConfig =>
      ({
        type: 'metric',
        title: 'Trendline data view ref',
        data_source: dataSource,
        metrics: [
          {
            type: 'primary',
            operation: 'count',
            empty_as_null: false,
            background_chart: { type: 'trend' },
          },
        ],
        sampling: 1,
        ignore_global_filters: false,
      } as MetricConfig);

    const getTrendlineHistogramSourceField = (config: MetricConfig): string => {
      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const formBased = lensState.state.datasourceStates.formBased as FormBasedPersistedState;
      const trendLayer = formBased.layers.layer_0_trendline;
      expect(trendLayer).toBeDefined();
      const histogramColumn = trendLayer.columns.x_date_histogram as
        | DateHistogramIndexPatternColumn
        | undefined;
      expect(histogramColumn).toBeDefined();
      expect(histogramColumn!.operationType).toBe('date_histogram');
      return histogramColumn!.sourceField;
    };

    it('uses the supplied time_field on the trendline date histogram', () => {
      // Mirrors Kibana Sample Data Logs, whose default time field is `timestamp` (no `@`).
      const sourceField = getTrendlineHistogramSourceField(
        buildMetricWithTrend({
          type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
          ref_id: 'kibana_sample_data_logs',
          time_field: 'timestamp',
        })
      );
      expect(sourceField).toBe('timestamp');
    });

    it('falls back to @timestamp when no time_field is provided on the reference', () => {
      const sourceField = getTrendlineHistogramSourceField(
        buildMetricWithTrend({
          type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
          ref_id: 'my-data-view',
        })
      );
      expect(sourceField).toBe('@timestamp');
    });
  });
});
