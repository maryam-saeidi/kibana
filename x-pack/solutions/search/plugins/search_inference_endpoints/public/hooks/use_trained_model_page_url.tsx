/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useState } from 'react';
import { useKibana } from './use_kibana';

export const useTrainedModelPageUrl = () => {
  const {
    services: { ml },
  } = useKibana();

  const [trainedModelPageUrl, setTrainedModelPageUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchMlTrainedModelPageUrl = async () => {
      const result = await ml.managementLocator?.getUrl(undefined, 'trained_models');
      if (result?.url) {
        setTrainedModelPageUrl(result.url);
      }
    };

    fetchMlTrainedModelPageUrl();
  }, [ml]);

  return trainedModelPageUrl;
};
