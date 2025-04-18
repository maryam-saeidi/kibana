/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { addBasePath } from './add_base_path';
import { MonitorSummary } from '../../../../../common/runtime_types';

export const getLegacyApmHref = (
  summary: MonitorSummary,
  basePath: string,
  dateRangeStart: string,
  dateRangeEnd: string
) => {
  const serviceName = summary?.state?.service?.name;

  if (serviceName) {
    return addBasePath(
      basePath,
      `/app/apm/services/${encodeURIComponent(
        serviceName
      )}/overview/?rangeFrom=${dateRangeStart}&rangeTo=${dateRangeEnd}`
    );
  }

  const clause = `url.domain: "${summary.state.url?.domain}"`;

  return addBasePath(
    basePath,
    `/app/apm/services?kuery=${encodeURI(
      clause
    )}&rangeFrom=${dateRangeStart}&rangeTo=${dateRangeEnd}`
  );
};
