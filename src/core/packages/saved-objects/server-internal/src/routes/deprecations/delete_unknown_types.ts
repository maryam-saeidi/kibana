/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { catchAndReturnBoomErrors } from '../utils';
import type { InternalSavedObjectRouter } from '../../internal_types';
import { deleteUnknownTypeObjects } from '../../deprecations';

interface RouteDependencies {
  kibanaIndex: string;
  kibanaVersion: string;
}

export const registerDeleteUnknownTypesRoute = (
  router: InternalSavedObjectRouter,
  { kibanaIndex, kibanaVersion }: RouteDependencies
) => {
  router.post(
    {
      path: '/deprecations/_delete_unknown_types',
      validate: false,
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the Saved Objects Client',
        },
      },
    },
    catchAndReturnBoomErrors(async (context, req, res) => {
      const { elasticsearch, savedObjects } = await context.core;
      await deleteUnknownTypeObjects({
        esClient: elasticsearch.client,
        typeRegistry: savedObjects.typeRegistry,
        kibanaIndex,
        kibanaVersion,
      });
      return res.ok({
        body: {
          success: true,
        },
      });
    })
  );
};
