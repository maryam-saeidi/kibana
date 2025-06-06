/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type { GetTransformNodesResponseSchema } from '@kbn/transform-plugin/server/routes/api_schemas/transforms';
import { getCommonRequestHeader } from '../../services/ml/common_api';
import { USER } from '../../services/transform/security_common';

import { FtrProviderContext } from '../../ftr_provider_context';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertestWithoutAuth');
  const transform = getService('transform');

  const expected = {
    apiTransformTransformsNodes: {
      minCount: 1,
    },
  };

  function assertTransformsNodesResponseBody(body: GetTransformNodesResponseSchema) {
    expect(body.count).to.not.be.lessThan(expected.apiTransformTransformsNodes.minCount);
  }

  describe('/internal/transform/transforms/_nodes', function () {
    it('should return the number of available transform nodes for a power user', async () => {
      const { body, status } = await supertest
        .get('/internal/transform/transforms/_nodes')
        .auth(
          USER.TRANSFORM_POWERUSER,
          transform.securityCommon.getPasswordForUser(USER.TRANSFORM_POWERUSER)
        )
        .set(getCommonRequestHeader('1'))
        .send();
      transform.api.assertResponseStatusCode(200, status, body);

      assertTransformsNodesResponseBody(body);
    });

    it('should return the number of available transform nodes for a viewer user', async () => {
      const { body, status } = await supertest
        .get('/internal/transform/transforms/_nodes')
        .auth(
          USER.TRANSFORM_VIEWER,
          transform.securityCommon.getPasswordForUser(USER.TRANSFORM_VIEWER)
        )
        .set(getCommonRequestHeader('1'))
        .send();
      transform.api.assertResponseStatusCode(200, status, body);

      assertTransformsNodesResponseBody(body);
    });

    it('should not return the number of available transform nodes for an unauthorized user', async () => {
      const { body, status } = await supertest
        .get('/internal/transform/transforms/_nodes')
        .auth(
          USER.TRANSFORM_UNAUTHORIZED,
          transform.securityCommon.getPasswordForUser(USER.TRANSFORM_UNAUTHORIZED)
        )
        .set(getCommonRequestHeader('1'))
        .send();
      transform.api.assertResponseStatusCode(403, status, body);
    });
  });
};
