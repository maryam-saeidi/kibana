/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DateHistogramIndexPatternColumn,
  DatasourceStates,
  FormBasedPersistedState,
  FormBasedPrivateState,
  IndexPatternMap,
  LensDocument,
  MetricVisualizationState,
} from '@kbn/lens-common';
import { LENS_DATASOURCE_ID, LENS_METRIC_ID } from '@kbn/lens-common';

function getMetricTrendlineTimeColumn(
  visualizationState: MetricVisualizationState,
  datasourceStates: DatasourceStates
) {
  const { trendlineLayerId, trendlineTimeAccessor } = visualizationState;
  if (!trendlineLayerId || !trendlineTimeAccessor) {
    return {};
  }

  const formBasedState = datasourceStates[LENS_DATASOURCE_ID.FORM_BASED]?.state as
    | FormBasedPrivateState
    | undefined;
  const trendlineLayer = formBasedState?.layers[trendlineLayerId];
  const column = trendlineLayer?.columns[trendlineTimeAccessor] as
    | DateHistogramIndexPatternColumn
    | undefined;

  return { formBasedState, column, trendlineLayer, trendlineLayerId, trendlineTimeAccessor };
}

export function postProcessMetricLoadedState({
  visualizationState,
  datasourceStates,
  indexPatterns,
}: {
  visualizationState: MetricVisualizationState;
  datasourceStates: DatasourceStates;
  indexPatterns: IndexPatternMap;
}) {
  const { formBasedState, trendlineLayer, column, trendlineLayerId, trendlineTimeAccessor } =
    getMetricTrendlineTimeColumn(visualizationState, datasourceStates);

  if (
    !formBasedState ||
    !column ||
    !trendlineLayer ||
    !trendlineLayerId ||
    !trendlineTimeAccessor ||
    column.operationType !== 'date_histogram' ||
    column.sourceField
  ) {
    return { visualizationState, datasourceStates };
  }

  const indexPattern = indexPatterns[trendlineLayer.indexPatternId];
  const timeFieldName = indexPattern?.timeFieldName;
  if (!indexPattern || !timeFieldName) {
    return { visualizationState, datasourceStates };
  }

  const timeField = indexPattern.getFieldByName(timeFieldName);
  const nextFormBasedState: FormBasedPrivateState = {
    ...formBasedState,
    layers: {
      ...formBasedState.layers,
      [trendlineLayerId]: {
        ...trendlineLayer,
        columns: {
          ...trendlineLayer.columns,
          [trendlineTimeAccessor]: {
            ...column,
            sourceField: timeFieldName,
            label: timeField?.displayName ?? timeFieldName,
          },
        },
      },
    },
  };

  return {
    visualizationState,
    datasourceStates: {
      ...datasourceStates,
      [LENS_DATASOURCE_ID.FORM_BASED]: {
        ...datasourceStates[LENS_DATASOURCE_ID.FORM_BASED],
        state: nextFormBasedState,
      },
    },
  };
}

export function normalizeMetricDocumentForEquality(doc: LensDocument): LensDocument {
  if (doc.visualizationType !== LENS_METRIC_ID) {
    return doc;
  }

  const visualizationState = doc.state.visualization as MetricVisualizationState;
  const { trendlineLayerId, trendlineTimeAccessor } = visualizationState;
  if (!trendlineLayerId || !trendlineTimeAccessor) {
    return doc;
  }

  const formBasedState = doc.state.datasourceStates[LENS_DATASOURCE_ID.FORM_BASED] as
    | FormBasedPersistedState
    | undefined;
  const column = formBasedState?.layers[trendlineLayerId]?.columns?.[trendlineTimeAccessor] as
    | DateHistogramIndexPatternColumn
    | undefined;

  if (column?.operationType !== 'date_histogram') {
    return doc;
  }

  column.label = '';
  column.sourceField = '';
  return doc;
}
