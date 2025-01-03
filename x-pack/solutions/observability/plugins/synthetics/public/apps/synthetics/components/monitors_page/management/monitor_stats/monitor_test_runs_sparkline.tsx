/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';

import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useTheme } from '@kbn/observability-shared-plugin/public';

import { useMonitorQueryFilters } from '../../hooks/use_monitor_query_filters';
import { useMonitorFilters } from '../../hooks/use_monitor_filters';
import { useRefreshedRange } from '../../../../hooks';
import { ClientPluginsStart } from '../../../../../../plugin';
import * as labels from '../labels';

export const MonitorTestRunsSparkline = () => {
  const {
    exploratoryView: { ExploratoryViewEmbeddable },
  } = useKibana<ClientPluginsStart>().services;

  const theme = useTheme();

  const { from, to } = useRefreshedRange(30, 'days');
  const filters = useMonitorFilters({});
  const queryFilter = useMonitorQueryFilters();

  const attributes = useMemo(() => {
    return [
      {
        seriesType: 'area' as const,
        time: { from, to },
        reportDefinitions: {
          'monitor.type': ['http', 'tcp', 'browser', 'icmp'],
        },
        dataType: 'synthetics' as const,
        selectedMetricField: 'total_test_runs',
        filters,
        name: labels.TEST_RUNS_LABEL,
        color: theme.eui.euiColorVis1,
        operationType: 'count',
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, theme.eui.euiColorVis1, to]);

  return (
    <ExploratoryViewEmbeddable
      id="monitor-test-runs-sparkline"
      reportType="kpi-over-time"
      axisTitlesVisibility={{ x: false, yRight: false, yLeft: false }}
      legendIsVisible={false}
      hideTicks={true}
      attributes={attributes}
      customHeight={'68px'}
      dslFilters={queryFilter}
    />
  );
};
