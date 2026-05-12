/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import { LENS_UNKNOWN_VIS } from '@kbn/lens-common';
import type {
  LensConfigBuilder,
  LensApiConfig,
  ResolvedReferences,
} from '@kbn/lens-embeddable-utils';
import { AS_CODE_DATA_VIEW_REFERENCE_TYPE } from '@kbn/as-code-data-views-schema';
import type { DataView, DataViewsService } from '@kbn/data-views-plugin/common';

import type { LensSavedObject, LensUpdateIn } from '../../../../content_management';
import type { GetDataViewsStart } from '../../../types';
import type {
  LensCreateRequestBody,
  LensItemMeta,
  LensResponseItem,
  LensUpdateRequestBody,
} from './types';

/**
 * Collects unique `ref_id`s referenced by `data_view_reference` data sources
 * anywhere in a Lens API config (top-level `data_source` or per-layer).
 */
function collectDataViewRefIds(config: LensApiConfig): string[] {
  const ids = new Set<string>();
  const visit = (ds: unknown) => {
    if (
      ds &&
      typeof ds === 'object' &&
      'type' in ds &&
      (ds as { type: string }).type === AS_CODE_DATA_VIEW_REFERENCE_TYPE &&
      'ref_id' in ds &&
      typeof (ds as { ref_id: unknown }).ref_id === 'string'
    ) {
      ids.add((ds as { ref_id: string }).ref_id);
    }
  };
  if ('data_source' in config && config.data_source) {
    visit(config.data_source);
  }
  if ('layers' in config && Array.isArray(config.layers)) {
    for (const layer of config.layers) {
      if (layer && typeof layer === 'object' && 'data_source' in layer) {
        visit((layer as { data_source: unknown }).data_source);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Builds a {@link ResolvedReferences} context by fetching every data view
 * referenced (`data_view_reference`) by the request body.
 *
 * Lookup failures are tolerated (the entry is simply omitted) so a single
 * missing or inaccessible data view does not break the whole request; the
 * transforms then fall back to their default behaviour (e.g. `@timestamp` for
 * the trendline time field).
 */
export async function resolveReferences(
  config: LensApiConfig,
  dataViewsService: DataViewsService
): Promise<ResolvedReferences> {
  const refIds = collectDataViewRefIds(config);
  const entries: Array<[string, DataView]> = [];
  await Promise.all(
    refIds.map(async (refId) => {
      try {
        const dv = await dataViewsService.get(refId);
        if (dv) {
          entries.push([refId, dv]);
        }
      } catch {
        // Ignore: transform falls back to its safe default downstream.
      }
    })
  );
  return { dataViewsByRefId: new Map(entries) };
}

/**
 * Builds request-scoped data view references by initializing DataViewsService
 * from start services and request handler context.
 */
export async function resolveRequestReferences({
  config,
  request,
  context,
  getDataViewsStart,
}: {
  config: LensApiConfig;
  request: KibanaRequest;
  context: RequestHandlerContext;
  getDataViewsStart: GetDataViewsStart;
}): Promise<ResolvedReferences> {
  const [{ dataViewsServiceFactory }, coreStart] = await Promise.all([
    getDataViewsStart(),
    context.core,
  ]);
  const dataViewsService = await dataViewsServiceFactory(
    coreStart.savedObjects.client,
    coreStart.elasticsearch.client.asCurrentUser,
    request
  );

  return resolveReferences(config, dataViewsService);
}

/**
 * Converts Lens request data to Lens Config
 */
export function getLensInternalRequestConfig(
  builder: LensConfigBuilder,
  request: LensCreateRequestBody | LensUpdateRequestBody,
  resolvedReferences?: ResolvedReferences
): LensUpdateIn['data'] & LensUpdateIn['options'] {
  const chartType = builder.getType(request);
  const useApiFormat = builder.isEnabled && builder.isSupported(chartType);

  if (useApiFormat) {
    const config = request as LensApiConfig;
    const attributes = builder.fromAPIFormat(config, resolvedReferences);

    return {
      ...attributes,
    } satisfies LensUpdateIn['data'] & LensUpdateIn['options'];
  }

  if (!('state' in request)) {
    // This should never happen, only to typeguard until fully supported
    throw new Error('Failure to transform API Format');
  }

  const { visualizationType, ...attributes } = request;

  if (!visualizationType) {
    throw new Error('Missing visualizationType');
  }

  return {
    ...attributes,
    // TODO: fix these type issues
    visualizationType,
    title: attributes.title ?? '',
    description: attributes.description ?? undefined,
  } satisfies LensUpdateIn['data'] & LensUpdateIn['options'];
}

/**
 * Used to extend the meta of the response item. Needed in Lens GET request.
 */
export type ExtendedLensResponseItem<M extends Record<string, string | boolean> = {}> = Omit<
  LensResponseItem,
  'meta'
> & {
  meta: LensResponseItem['meta'] & M;
};

/**
 * Converts Lens Saved Object to Lens Response Item
 */
export function getLensInternalResponseItem<M extends Record<string, string | boolean>>(
  builder: LensConfigBuilder,
  item: LensSavedObject,
  extraMeta: M = {} as M
): ExtendedLensResponseItem<M> {
  const { id, references, attributes } = item;
  const meta = getLensInternalResponseItemMeta<M>(item, extraMeta);
  const useApiFormat = builder.isEnabled && builder.isSupported(attributes.visualizationType);

  if (useApiFormat) {
    const data = builder.toAPIFormat({
      references,
      ...attributes,
      // TODO: fix these type issues
      state: attributes.state!,
      visualizationType: attributes.visualizationType ?? LENS_UNKNOWN_VIS,
    });
    return {
      id,
      data,
      meta,
    } satisfies LensResponseItem;
  }

  return {
    id,
    data: {
      references,
      ...attributes,
    },
    meta,
  } satisfies LensResponseItem;
}

/**
 * Converts Lens Saved Object to Lens Response Item
 */
function getLensInternalResponseItemMeta<M extends Record<string, string | boolean>>(
  { type, createdAt, updatedAt, createdBy, updatedBy, managed, originId }: LensSavedObject,
  extraMeta: M = {} as M
): LensItemMeta & M {
  return {
    type,
    createdAt,
    updatedAt,
    createdBy,
    updatedBy,
    managed,
    originId,
    ...extraMeta,
  };
}
