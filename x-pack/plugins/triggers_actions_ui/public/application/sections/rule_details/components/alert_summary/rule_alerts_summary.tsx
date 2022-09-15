/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LineSeries, Chart, CurveType, ScaleType, Settings, TooltipType } from '@elastic/charts';
import {
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ALERTS_FEATURE_ID } from '@kbn/alerting-plugin/common';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  EUI_CHARTS_THEME_DARK,
  EUI_CHARTS_THEME_LIGHT,
  EUI_SPARKLINE_THEME_PARTIAL,
} from '@elastic/eui/dist/eui_charts_theme';
import { useUiSetting } from '@kbn/kibana-react-plugin/public';
import moment from 'moment';
import { useLoadRuleAlertsAggs } from '../../../../hooks/use_load_rule_alerts_aggregations';
import { useLoadRuleTypes } from '../../../../hooks/use_load_rule_types';
import { RuleAlertsSummaryProps } from '.';
import { isP1DTFormatterSetting } from './helpers';

const FALLBACK_DATE_FORMAT_SCALED_P1DT = 'YYYY-MM-DD';
export const RuleAlertsSummary = ({ rule, filteredRuleTypes }: RuleAlertsSummaryProps) => {
  const [features, setFeatures] = useState<string>('');
  const isDarkMode = useUiSetting<boolean>('theme:darkMode');

  const scaledDateFormatPreference = useUiSetting<string[][]>('dateFormat:scaled');
  const maybeP1DTFormatter = Array.isArray(scaledDateFormatPreference)
    ? scaledDateFormatPreference.find(isP1DTFormatterSetting)
    : null;
  const p1dtFormat =
    Array.isArray(maybeP1DTFormatter) && maybeP1DTFormatter.length === 2
      ? maybeP1DTFormatter[1]
      : FALLBACK_DATE_FORMAT_SCALED_P1DT;

  const theme = useMemo(
    () => [
      EUI_SPARKLINE_THEME_PARTIAL,
      {
        ...(isDarkMode ? EUI_CHARTS_THEME_DARK.theme : EUI_CHARTS_THEME_LIGHT.theme),
        chartMargins: {
          left: 10,
          right: 10,
          top: 10,
          bottom: 10,
        },
      },
    ],
    [isDarkMode]
  );
  const { ruleTypes } = useLoadRuleTypes({
    filteredRuleTypes,
  });
  const {
    ruleAlertsAggs: { active, recovered },
    isLoadingRuleAlertsAggs,
    errorRuleAlertsAggs,
    alertsChartData,
  } = useLoadRuleAlertsAggs({
    ruleId: rule.id,
    features,
  });
  const tooltipSettings = useMemo(
    () => ({
      type: TooltipType.VerticalCursor,
      headerFormatter: ({ value }: { value: number }) => {
        return <>{moment(value).format(p1dtFormat)}</>;
      },
    }),
    [p1dtFormat]
  );

  useEffect(() => {
    const matchedRuleType = ruleTypes.find((type) => type.id === rule.ruleTypeId);
    if (rule.consumer === ALERTS_FEATURE_ID && matchedRuleType && matchedRuleType.producer) {
      setFeatures(matchedRuleType.producer);
    } else setFeatures(rule.consumer);
  }, [rule, ruleTypes]);

  if (isLoadingRuleAlertsAggs) return <EuiLoadingSpinner />;
  if (errorRuleAlertsAggs)
    return (
      <EuiEmptyPrompt
        data-test-subj="alertsRuleSummaryErrorPrompt"
        iconType="alert"
        color="danger"
        title={
          <h5>
            <FormattedMessage
              id="xpack.triggersActionsUI.sections.ruleDetails.alertsSummary.errorLoadingTitle"
              defaultMessage="Unable to load the alerts summary"
            />
          </h5>
        }
        body={
          <p>
            {
              <FormattedMessage
                id="xpack.triggersActionsUI.sections.ruleDetails.alertsSummary.errorLoadingBody"
                defaultMessage=" There was an error loading the alerts summary. Contact your
                administrator for help."
              />
            }
          </p>
        }
      />
    );

  return (
    <EuiPanel data-test-subj="ruleAlertsSummary" hasShadow={false} hasBorder>
      <EuiFlexGroup direction="column">
        <EuiFlexItem>
          <EuiTitle size="xs">
            <h5>
              <FormattedMessage
                id="xpack.triggersActionsUI.sections.ruleDetails.alertsSummary.title"
                defaultMessage="Alerts"
              />
              &nbsp;({active + recovered})
            </h5>
          </EuiTitle>
        </EuiFlexItem>
        {/* Active */}
        <EuiFlexItem>
          <EuiFlexGroup alignItems={'center'}>
            <EuiFlexItem grow={1}>
              <EuiTitle size="s">
                <h3 data-test-subj="activeAlertsCount">{active}</h3>
              </EuiTitle>
              <p>
                <FormattedMessage
                  id="xpack.triggersActionsUI.sections.ruleDetails.alertsSummary.activeLabel"
                  defaultMessage="Active"
                />
              </p>
            </EuiFlexItem>
            <EuiFlexItem grow={3}>
              <EuiPanel
                style={{
                  padding: 10,
                }}
                hasShadow={false}
              >
                <Chart size={{ height: 50 }}>
                  <Settings tooltip={tooltipSettings} theme={theme} />
                  <LineSeries
                    id="active"
                    xScaleType={ScaleType.Time}
                    yScaleType={ScaleType.Linear}
                    xAccessor="date"
                    yAccessors={['active']}
                    data={alertsChartData}
                    lineSeriesStyle={{
                      line: {
                        strokeWidth: 2,
                        stroke: '#E7664C',
                      },
                    }}
                    curve={CurveType.CURVE_MONOTONE_X}
                  />
                </Chart>
              </EuiPanel>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        {/* Recovered */}
        <EuiFlexItem>
          <EuiFlexGroup alignItems={'center'}>
            <EuiFlexItem grow={1}>
              <EuiTitle size="s">
                <h3 data-test-subj="recoveredAlertsCount">{recovered}</h3>
              </EuiTitle>
              <EuiText size="s">
                <FormattedMessage
                  id="xpack.triggersActionsUI.sections.ruleDetails.rule.ruleSummary.recoveredLabel"
                  defaultMessage="Recovered"
                />
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={3}>
              <EuiPanel hasShadow={false}>
                <Chart size={{ height: 50 }}>
                  <Settings tooltip={tooltipSettings} theme={theme} />
                  <LineSeries
                    id="recovered"
                    xScaleType={ScaleType.Time}
                    yScaleType={ScaleType.Linear}
                    xAccessor="date"
                    yAccessors={['recovered']}
                    data={alertsChartData}
                    lineSeriesStyle={{
                      line: {
                        strokeWidth: 2,
                      },
                      point: {
                        strokeWidth: 0,
                        radius: 0,
                      },
                    }}
                    curve={CurveType.CURVE_MONOTONE_X}
                  />
                </Chart>
              </EuiPanel>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

// eslint-disable-next-line import/no-default-export
export { RuleAlertsSummary as default };
