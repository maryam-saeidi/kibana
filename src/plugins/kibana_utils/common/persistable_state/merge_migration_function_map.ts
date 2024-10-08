/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mergeWith } from 'lodash';
import type { SerializableRecord } from '@kbn/utility-types';
import { MigrateFunctionsObject, MigrateFunction } from './types';

export const mergeMigrationFunctionMaps = (
  obj1: MigrateFunctionsObject,
  obj2: MigrateFunctionsObject
) => {
  const customizer = (objValue: MigrateFunction, srcValue: MigrateFunction) => {
    if (!srcValue || !objValue) {
      return srcValue || objValue;
    }
    return (state: SerializableRecord) => objValue(srcValue(state));
  };

  return mergeWith({ ...obj1 }, obj2, customizer);
};
