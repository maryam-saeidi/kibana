/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LegendLayout, LegendSize, type XYLegendValue } from '@kbn/chart-expressions-common';
import type { XYState as XYLensState } from '@kbn/lens-common';
import type { XYState } from '../../../schema';
import { getLegendTruncateAfterLines, stripUndefined } from '../utils';

type LegendType = NonNullable<XYState['legend']>;
type LegendWithSize = Extract<LegendType, { size?: unknown }>;
type OutsideLegendSize = LegendWithSize['size'];
type OutsideLegendSizeApi = Exclude<OutsideLegendSize, undefined>;
type StatisticsType = NonNullable<NonNullable<XYState['legend']>['statistics']>[number];

const StatsAPIToOldState = {
  avg: 'average',
  last_value: 'lastValue',
  first_value: 'firstValue',
  last_non_null_value: 'lastNonNullValue',
  first_non_null_value: 'firstNonNullValue',
  current_and_last_value: 'currentAndLastValue',
  difference_percentage: 'differencePercent',
  standard_deviation: 'stdDeviation',
  distinct_count: 'distinctCount',
} as const;

function isAPIMappedStatistic(stat: StatisticsType): stat is keyof typeof StatsAPIToOldState {
  return stat in StatsAPIToOldState;
}

function mapStatToCamelCase(stat: StatisticsType): XYLegendValue {
  if (isAPIMappedStatistic(stat)) {
    return StatsAPIToOldState[stat];
  }
  return stat;
}

const StatsStateToAPI = {
  average: 'avg',
  lastValue: 'last_value',
  firstValue: 'first_value',
  lastNonNullValue: 'last_non_null_value',
  firstNonNullValue: 'first_non_null_value',
  currentAndLastValue: 'current_and_last_value',
  differencePercent: 'difference_percentage',
  stdDeviation: 'standard_deviation',
  distinctCount: 'distinct_count',
} as const;

function isStateMappedStatistic(stat: XYLegendValue): stat is keyof typeof StatsStateToAPI {
  return stat in StatsStateToAPI;
}

function mapStatToSnakeCase(stat: XYLegendValue): StatisticsType {
  if (isStateMappedStatistic(stat)) {
    return StatsStateToAPI[stat];
  }
  return stat;
}

const DEFAULT_LEGEND_POSITON = 'right';

function isOutsideListLegendLayout(legend: XYState['legend']) {
  return Boolean(
    legend &&
      !legend.inside &&
      'layout' in legend &&
      legend.layout?.type === 'list' &&
      'position' in legend &&
      (legend.position === 'top' || legend.position === 'bottom')
  );
}
function isOutsideListLegendLayoutState(legend: XYLensState['legend']) {
  return Boolean(
    !isLegendInside(legend) &&
      legend.layout === LegendLayout.List &&
      (legend.position === 'top' || legend.position === 'bottom')
  );
}

function isVerticalPosition(legend: XYState['legend']): boolean {
  return Boolean(
    legend &&
      !legend.inside &&
      'position' in legend &&
      (legend.position === 'left' || legend.position === 'right')
  );
}

function extractAlignment(legend: XYState['legend']):
  | {
      verticalAlignment: 'top' | 'bottom' | undefined;
      horizontalAlignment: 'left' | 'right' | undefined;
    }
  | {} {
  if (legend?.inside) {
    const [verticalAlignment, horizontalAlignment] = (legend.alignment?.split('_') ?? [
      'top',
      'right',
    ]) as ['top' | 'bottom' | undefined, 'left' | 'right' | undefined];
    return { verticalAlignment, horizontalAlignment };
  }
  return {};
}

function getLegendSize(size: OutsideLegendSize): XYLensState['legend']['legendSize'] {
  switch (size) {
    case 'small':
      return LegendSize.SMALL;
    case 'medium':
      return LegendSize.MEDIUM;
    case 'large':
      return LegendSize.LARGE;
    case 'xlarge':
      return LegendSize.EXTRA_LARGE;
    default:
      return LegendSize.AUTO;
  }
}

function getLegendTruncation(legend: XYState['legend']): {
  max_lines?: number;
  max_pixels?: number;
} | null {
  return legend && 'layout' in legend && legend.layout?.truncate ? legend.layout.truncate : null;
}

function getOutsideLegendSize(
  legend: XYState['legend']
): 'small' | 'medium' | 'large' | 'xlarge' | undefined {
  return legend && 'size' in legend ? legend.size : undefined;
}

export function convertLegendToStateFormat(legend: XYState['legend']): {
  legend: XYLensState['legend'];
} {
  const isListLegendLayout = isOutsideListLegendLayout(legend);
  const legendTruncation = getLegendTruncation(legend);
  const truncateMaxLines = legendTruncation?.max_lines;
  const truncateMaxPixels = legendTruncation?.max_pixels;
  const outsideLegendSize = getOutsideLegendSize(legend);
  const newStateLegend: XYLensState['legend'] = {
    isVisible: legend?.visibility === 'auto' || legend?.visibility === 'visible',
    shouldTruncate: Boolean(truncateMaxLines || truncateMaxPixels), // 0 will be interpreted as false
    ...(legend?.statistics
      ? { legendStats: (legend?.statistics ?? []).map(mapStatToCamelCase) }
      : {}),
    ...extractAlignment(legend),
    ...(legend?.visibility === 'auto' ? { showSingleSeries: true } : {}),
    ...(legend?.inside
      ? {
          isInside: true,
          position: DEFAULT_LEGEND_POSITON,
          ...(legend?.columns ? { floatingColumns: legend?.columns } : {}),
        }
      : {
          position: legend?.position ?? DEFAULT_LEGEND_POSITON,
          legendSize: outsideLegendSize ? getLegendSize(outsideLegendSize) : undefined,
          ...(isVerticalPosition(legend)
            ? {
                ...(!isListLegendLayout && truncateMaxLines ? { maxLines: truncateMaxLines } : {}),
              }
            : {
                ...(isListLegendLayout
                  ? {
                      layout: LegendLayout.List,
                      ...(truncateMaxPixels != null
                        ? { listLayoutMaxWidth: truncateMaxPixels }
                        : {}),
                    }
                  : truncateMaxLines
                  ? { maxLines: truncateMaxLines }
                  : {}),
              }),
        }),
  };

  return { legend: newStateLegend };
}

function getLegendSizeAPI(
  size: XYLensState['legend']['legendSize'] | undefined
): { size: OutsideLegendSizeApi } | {} {
  switch (size) {
    case LegendSize.SMALL:
      return { size: 'small' };
    case LegendSize.MEDIUM:
      return { size: 'medium' };
    case LegendSize.LARGE:
      return { size: 'large' };
    case LegendSize.EXTRA_LARGE:
      return { size: 'xlarge' };
    default:
      return {};
  }
}

// @TODO improve this check
function isLegendInside(legend: XYLensState['legend']): boolean {
  if (legend.isInside != null) {
    return legend.isInside;
  }
  return (
    legend.legendSize == null &&
    (legend.floatingColumns != null ||
      legend.verticalAlignment != null ||
      legend.horizontalAlignment != null)
  );
}

function getLegendAlignment(legend: XYLensState['legend']) {
  if (!legend.verticalAlignment && !legend.horizontalAlignment) {
    return {};
  }
  return {
    alignment: `${legend.verticalAlignment ?? 'top'}_${legend.horizontalAlignment ?? 'right'}`,
  };
}

export function convertLegendToAPIFormat(
  legend: XYLensState['legend']
): Pick<XYState, 'legend'> | {} {
  const visibility = !legend.isVisible ? 'hidden' : legend.showSingleSeries ? 'auto' : 'visible';
  const statistics = legend.legendStats?.length
    ? legend.legendStats.map(mapStatToSnakeCase)
    : undefined;

  if (isLegendInside(legend)) {
    return {
      legend: stripUndefined({
        visibility,
        statistics,
        inside: true,
        ...(legend.floatingColumns ? { columns: legend.floatingColumns } : {}),
        ...getLegendAlignment(legend),
      }),
    };
  }

  const position = legend.position ?? DEFAULT_LEGEND_POSITON;
  const isListLayout = isOutsideListLegendLayoutState(legend);

  const baseOutside = stripUndefined({
    visibility,
    inside: false as const,
    position,
    ...getLegendSizeAPI(legend.legendSize),
    statistics,
  });

  if (isListLayout) {
    return {
      legend: {
        ...baseOutside,
        layout: stripUndefined({
          type: 'list' as const,
          truncate:
            legend.listLayoutMaxWidth == null
              ? undefined
              : { max_pixels: legend.listLayoutMaxWidth },
        }),
      },
    };
  }

  if (legend.maxLines != null) {
    return {
      legend: {
        ...baseOutside,
        layout: {
          type: 'grid' as const,
          truncate: { max_lines: getLegendTruncateAfterLines(legend) },
        },
      },
    };
  }

  return { legend: baseOutside };
}
