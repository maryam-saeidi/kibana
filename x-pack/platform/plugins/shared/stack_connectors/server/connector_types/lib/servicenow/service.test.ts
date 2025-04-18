/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AxiosError, AxiosResponse } from 'axios';
import axios from 'axios';

import { createExternalService } from './service';
import * as utils from '@kbn/actions-plugin/server/lib/axios_utils';
import type { ExternalService, ServiceNowITSMIncident } from './types';
import type { Logger } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { actionsConfigMock } from '@kbn/actions-plugin/server/actions_config.mock';
import { serviceNowCommonFields, serviceNowChoices } from './mocks';
import { snExternalServiceConfig } from './config';
import { ConnectorUsageCollector } from '@kbn/actions-plugin/server/types';
const logger = loggingSystemMock.create().get() as jest.Mocked<Logger>;

jest.mock('axios', () => ({
  create: jest.fn(),
  AxiosError: jest.requireActual('axios').AxiosError,
}));
jest.mock('@kbn/actions-plugin/server/lib/axios_utils', () => {
  const originalUtils = jest.requireActual('@kbn/actions-plugin/server/lib/axios_utils');
  return {
    ...originalUtils,
    request: jest.fn(),
    patch: jest.fn(),
  };
});

axios.create = jest.fn(() => axios);
const requestMock = utils.request as jest.Mock;
const configurationUtilities = actionsConfigMock.create();

const getImportSetAPIResponse = (update = false) => ({
  import_set: 'ISET01',
  staging_table: 'x_elas2_inc_int_elastic_incident',
  result: [
    {
      transform_map: 'Elastic Incident',
      table: 'incident',
      display_name: 'number',
      display_value: 'INC01',
      record_link: 'https://example.com/api/now/table/incident/1',
      status: update ? 'updated' : 'inserted',
      sys_id: '1',
    },
  ],
});

const getImportSetAPIError = () => ({
  import_set: 'ISET01',
  staging_table: 'x_elas2_inc_int_elastic_incident',
  result: [
    {
      transform_map: 'Elastic Incident',
      status: 'error',
      error_message: 'An error has occurred while importing the incident',
      status_message: 'failure',
    },
  ],
});

const mockApplicationVersion = () =>
  requestMock.mockImplementationOnce(() => ({
    data: {
      result: { name: 'Elastic', scope: 'x_elas2_inc_int', version: '1.0.0' },
    },
  }));

const mockImportIncident = (update: boolean) =>
  requestMock.mockImplementationOnce(() => ({
    data: getImportSetAPIResponse(update),
  }));

const mockIncidentResponse = (update: boolean) =>
  requestMock.mockImplementationOnce(() => ({
    data: {
      result: {
        sys_id: '1',
        number: 'INC01',
        ...(update
          ? { sys_updated_on: '2020-03-10 12:24:20' }
          : { sys_created_on: '2020-03-10 12:24:20' }),
      },
    },
  }));

const mockCorrelationIdIncidentResponse = () =>
  requestMock.mockImplementationOnce(() => ({
    data: {
      result: [
        {
          sys_id: '1',
          number: 'INC01',
          sys_updated_on: '2020-03-10 12:24:20',
        },
      ],
    },
  }));

const createIncident = async (
  service: ExternalService,
  incident?: Partial<ServiceNowITSMIncident>
) => {
  // Get application version
  mockApplicationVersion();
  // Import set api response
  mockImportIncident(false);
  // Get incident response
  mockIncidentResponse(false);

  return await service.createIncident({
    incident: {
      short_description: 'title',
      description: 'desc',
      ...incident,
    } as ServiceNowITSMIncident,
  });
};

const updateIncident = async (
  service: ExternalService,
  incident?: Partial<ServiceNowITSMIncident>
) => {
  // Get application version
  mockApplicationVersion();
  // Import set api response
  mockImportIncident(true);
  // Get incident response
  mockIncidentResponse(true);

  return await service.updateIncident({
    incidentId: '1',
    incident: {
      short_description: 'title',
      description: 'desc',
      ...incident,
    } as ServiceNowITSMIncident,
  });
};

const closeIncident = async ({
  service,
  incidentId,
  correlationId,
}: {
  service: ExternalService;
  incidentId: string | null;
  correlationId: string | null;
}) => {
  // Get incident response
  if (incidentId) {
    mockIncidentResponse(false);
  } else if (correlationId) {
    // get incident by correlationId response
    mockCorrelationIdIncidentResponse();
  }
  // Get application version
  mockApplicationVersion();
  // Import set api response
  mockImportIncident(true);
  // Get incident response
  mockIncidentResponse(true);

  return await service.closeIncident({
    incidentId: incidentId ?? null,
    correlationId: correlationId ?? null,
  });
};

const expectImportedIncident = (update: boolean) => {
  expect(requestMock).toHaveBeenNthCalledWith(1, {
    axios,
    logger,
    configurationUtilities,
    url: 'https://example.com/api/x_elas2_inc_int/elastic_api/health',
    method: 'get',
    connectorUsageCollector: expect.any(ConnectorUsageCollector),
  });

  expect(requestMock).toHaveBeenNthCalledWith(2, {
    axios,
    logger,
    configurationUtilities,
    url: 'https://example.com/api/now/import/x_elas2_inc_int_elastic_incident',
    method: 'post',
    data: {
      u_short_description: 'title',
      u_description: 'desc',
      ...(update ? { elastic_incident_id: '1' } : {}),
    },
    connectorUsageCollector: expect.any(ConnectorUsageCollector),
  });

  expect(requestMock).toHaveBeenNthCalledWith(3, {
    axios,
    logger,
    configurationUtilities,
    url: 'https://example.com/api/now/v2/table/incident/1',
    method: 'get',
    connectorUsageCollector: expect.any(ConnectorUsageCollector),
  });
};

describe('ServiceNow service', () => {
  let service: ExternalService;
  let connectorUsageCollector: ConnectorUsageCollector;

  beforeEach(() => {
    jest.clearAllMocks();
    connectorUsageCollector = new ConnectorUsageCollector({
      logger,
      connectorId: 'test-connector-id',
    });

    service = createExternalService({
      credentials: {
        // The trailing slash at the end of the url is intended.
        // All API calls need to have the trailing slash removed.
        config: { apiUrl: 'https://example.com/', isOAuth: false },
        secrets: { username: 'admin', password: 'admin' },
      },
      logger,
      configurationUtilities,
      serviceConfig: snExternalServiceConfig['.servicenow'],
      axiosInstance: axios,
      connectorUsageCollector,
    });
  });

  describe('createExternalService', () => {
    test('throws without url', () => {
      expect(() =>
        createExternalService({
          credentials: {
            config: { apiUrl: null, isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: snExternalServiceConfig['.servicenow'],
          axiosInstance: axios,
          connectorUsageCollector,
        })
      ).toThrow();
    });

    test('throws when isOAuth is false and basic auth required values are falsy', () => {
      const badBasicCredentials = [
        {
          config: { apiUrl: 'test.com', isOAuth: false },
          secrets: { username: '', password: 'admin' },
        },
        {
          config: { apiUrl: 'test.com', isOAuth: false },
          secrets: { username: null, password: 'admin' },
        },
        {
          config: { apiUrl: 'test.com', isOAuth: false },
          secrets: { password: 'admin' },
        },
        {
          config: { apiUrl: 'test.com', isOAuth: false },
          secrets: { username: 'admin', password: '' },
        },
        {
          config: { apiUrl: 'test.com', isOAuth: false },
          secrets: { username: 'admin', password: null },
        },
        {
          config: { apiUrl: 'test.com', isOAuth: false },
          secrets: { username: 'admin' },
        },
      ];

      badBasicCredentials.forEach((badCredentials) => {
        expect(() =>
          createExternalService({
            credentials: badCredentials,
            logger,
            configurationUtilities,
            serviceConfig: snExternalServiceConfig['.servicenow'],
            axiosInstance: axios,
            connectorUsageCollector,
          })
        ).toThrow();
      });
    });

    test('throws when isOAuth is true and OAuth required values are falsy', () => {
      const badOAuthCredentials = [
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: '',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: null,
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: '',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: null,
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: '',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: null,
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: '', privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: null, privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { privateKey: 'privateKey' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: '' },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret', privateKey: null },
        },
        {
          config: {
            apiUrl: 'test.com',
            isOAuth: true,
            clientId: 'clientId',
            jwtKeyId: 'jwtKeyId',
            userIdentifierValue: 'user@email.com',
          },
          secrets: { clientSecret: 'clientSecret' },
        },
      ];

      badOAuthCredentials.forEach((badCredentials) => {
        expect(() =>
          createExternalService({
            credentials: badCredentials,
            logger,
            configurationUtilities,
            serviceConfig: snExternalServiceConfig['.servicenow'],
            axiosInstance: axios,
            connectorUsageCollector,
          })
        ).toThrow();
      });
    });
  });

  describe('getIncident', () => {
    test('it returns the incident correctly', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: { sys_id: '1', number: 'INC01' } },
      }));
      const res = await service.getIncident('1');
      expect(res).toEqual({ sys_id: '1', number: 'INC01' });
    });

    test('it should call request with correct arguments', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: { sys_id: '1', number: 'INC01' } },
      }));

      await service.getIncident('1');
      expect(requestMock).toHaveBeenCalledWith({
        axios,
        logger,
        configurationUtilities,
        url: 'https://example.com/api/now/v2/table/incident/1',
        method: 'get',
        connectorUsageCollector,
      });
    });

    test('it should call request with correct arguments when table changes', async () => {
      service = createExternalService({
        credentials: {
          config: { apiUrl: 'https://example.com/', isOAuth: false },
          secrets: { username: 'admin', password: 'admin' },
        },
        logger,
        configurationUtilities,
        serviceConfig: { ...snExternalServiceConfig['.servicenow'], table: 'sn_si_incident' },
        axiosInstance: axios,
        connectorUsageCollector,
      });

      requestMock.mockImplementation(() => ({
        data: { result: { sys_id: '1', number: 'INC01' } },
      }));

      await service.getIncident('1');
      expect(requestMock).toHaveBeenCalledWith({
        axios,
        logger,
        configurationUtilities,
        url: 'https://example.com/api/now/v2/table/sn_si_incident/1',
        method: 'get',
        connectorUsageCollector,
      });
    });

    test('it should throw an error', async () => {
      requestMock.mockImplementation(() => {
        throw new Error('An error has occurred');
      });
      await expect(service.getIncident('1')).rejects.toThrow(
        '[Action][ServiceNow]: Unable to get incident with id 1. Error: An error has occurred Reason: unknown: errorResponse was null'
      );
    });

    test('it should throw an error when instance is not alive', async () => {
      requestMock.mockImplementation(() => ({
        status: 200,
        data: {},
        request: { connection: { servername: 'Developer instance' } },
      }));
      await expect(service.getIncident('1')).rejects.toThrow(
        'There is an issue with your Service Now Instance. Please check Developer instance.'
      );
    });

    test('it should throw an error when incident id is empty', async () => {
      await expect(service.getIncident('')).rejects.toThrow(
        '[Action][ServiceNow]: Unable to get incident with id . Error: Incident id is empty. Reason: unknown: errorResponse was null'
      );
    });
  });

  describe('getIncidentByCorrelationId', () => {
    test('it returns the incident correctly', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: [{ sys_id: '1', number: 'INC01' }] },
      }));
      const res = await service.getIncidentByCorrelationId('custom_correlation_id');
      expect(res).toEqual({ sys_id: '1', number: 'INC01' });
    });

    test('it should call request with correct arguments', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: [{ sys_id: '1', number: 'INC01' }] },
      }));

      await service.getIncidentByCorrelationId('custom_correlation_id');
      expect(requestMock).toHaveBeenCalledWith({
        axios,
        logger,
        configurationUtilities,
        url: 'https://example.com/api/now/v2/table/incident?sysparm_query=ORDERBYDESCsys_created_on^correlation_id=custom_correlation_id',
        method: 'get',
        connectorUsageCollector,
      });
    });

    test('it should return null if response is empty', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: [] },
      }));

      const res = await service.getIncidentByCorrelationId('custom_correlation_id');

      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(res).toBe(null);
    });

    test('it should call request with correct arguments when table changes', async () => {
      service = createExternalService({
        credentials: {
          config: { apiUrl: 'https://example.com/', isOAuth: false },
          secrets: { username: 'admin', password: 'admin' },
        },
        logger,
        configurationUtilities,
        serviceConfig: { ...snExternalServiceConfig['.servicenow'], table: 'sn_si_incident' },
        axiosInstance: axios,
        connectorUsageCollector,
      });

      requestMock.mockImplementation(() => ({
        data: { result: [{ sys_id: '1', number: 'INC01' }] },
      }));

      await service.getIncidentByCorrelationId('custom_correlation_id');
      expect(requestMock).toHaveBeenCalledWith({
        axios,
        logger,
        configurationUtilities,
        url: 'https://example.com/api/now/v2/table/sn_si_incident?sysparm_query=ORDERBYDESCsys_created_on^correlation_id=custom_correlation_id',
        method: 'get',
        connectorUsageCollector,
      });
    });

    test('it should throw an error', async () => {
      requestMock.mockImplementationOnce(() => {
        throw new Error('An error has occurred');
      });
      await expect(service.getIncidentByCorrelationId('custom_correlation_id')).rejects.toThrow(
        '[Action][ServiceNow]: Unable to get incident by correlation ID custom_correlation_id. Error: An error has occurred Reason: unknown: errorResponse was null'
      );
    });

    test('it should throw an error when correlation id is empty', async () => {
      await expect(service.getIncidentByCorrelationId('')).rejects.toThrow(
        '[Action][ServiceNow]: Unable to get incident by correlation ID . Error: Correlation ID is empty. Reason: unknown: errorResponse was null'
      );
    });

    test('it should throw an error when instance is not alive', async () => {
      requestMock.mockImplementationOnce(() => ({
        status: 200,
        data: {},
        request: { connection: { servername: 'Developer instance' } },
      }));
      await expect(service.getIncidentByCorrelationId('custom_correlation_id')).rejects.toThrow(
        'There is an issue with your Service Now Instance. Please check Developer instance.'
      );
    });
  });

  describe('createIncident', () => {
    // new connectors
    describe('import set table', () => {
      test('it creates the incident correctly', async () => {
        const res = await createIncident(service);
        expect(res).toEqual({
          title: 'INC01',
          id: '1',
          pushedDate: '2020-03-10T12:24:20.000Z',
          url: 'https://example.com/nav_to.do?uri=incident.do?sys_id=1',
        });
      });

      test('it should call request with correct arguments', async () => {
        await createIncident(service);
        expect(requestMock).toHaveBeenCalledTimes(3);
        expectImportedIncident(false);
      });

      test('it should call request with correct arguments when table changes', async () => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: snExternalServiceConfig['.servicenow-sir'],
          axiosInstance: axios,
          connectorUsageCollector,
        });

        const res = await createIncident(service);

        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/x_elas2_sir_int/elastic_api/health',
          method: 'get',
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(2, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/import/x_elas2_sir_int_elastic_si_incident',
          method: 'post',
          data: { u_short_description: 'title', u_description: 'desc' },
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(3, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/sn_si_incident/1',
          method: 'get',
          connectorUsageCollector,
        });

        expect(res.url).toEqual('https://example.com/nav_to.do?uri=sn_si_incident.do?sys_id=1');
      });

      test('it should throw an error when the application is not installed', async () => {
        requestMock.mockImplementation(() => {
          throw new Error('An error has occurred');
        });

        await expect(
          service.createIncident({
            incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
          })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to create incident. Error: [Action][ServiceNow]: Unable to get application version. Error: An error has occurred Reason: unknown: errorResponse was null Reason: unknown: errorResponse was null'
        );
      });

      test('it should throw an error when instance is not alive', async () => {
        requestMock.mockImplementation(() => ({
          status: 200,
          data: {},
          request: { connection: { servername: 'Developer instance' } },
        }));
        await expect(
          service.createIncident({
            incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
          })
        ).rejects.toThrow(
          'There is an issue with your Service Now Instance. Please check Developer instance.'
        );
      });

      test('it should throw an error when there is an import set api error', async () => {
        requestMock.mockImplementation(() => ({ data: getImportSetAPIError() }));
        await expect(
          service.createIncident({
            incident: {
              short_description: 'title',
              description: 'desc',
            } as ServiceNowITSMIncident,
          })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to create incident. Error: An error has occurred while importing the incident Reason: unknown'
        );
      });

      test('it should create an incident with additional fields correctly without prefixing them with u_', async () => {
        await createIncident(service, { additional_fields: { foo: 'test' } });

        expect(requestMock).toHaveBeenNthCalledWith(2, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/import/x_elas2_inc_int_elastic_incident',
          method: 'post',
          data: { u_short_description: 'title', u_description: 'desc', foo: 'test' },
          connectorUsageCollector,
        });
      });
    });

    // old connectors
    describe('table API', () => {
      beforeEach(() => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: { ...snExternalServiceConfig['.servicenow'], useImportAPI: false },
          axiosInstance: axios,
          connectorUsageCollector,
        });
      });

      test('it creates the incident correctly', async () => {
        mockIncidentResponse(false);
        mockIncidentResponse(false);

        const res = await service.createIncident({
          incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
        });

        expect(res).toEqual({
          title: 'INC01',
          id: '1',
          pushedDate: '2020-03-10T12:24:20.000Z',
          url: 'https://example.com/nav_to.do?uri=incident.do?sys_id=1',
        });

        expect(requestMock).toHaveBeenCalledTimes(2);
        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/incident',
          method: 'post',
          data: { short_description: 'title', description: 'desc' },
          connectorUsageCollector,
        });
      });

      test('it should call request with correct arguments when table changes', async () => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: { ...snExternalServiceConfig['.servicenow-sir'], useImportAPI: false },
          axiosInstance: axios,
          connectorUsageCollector,
        });

        mockIncidentResponse(false);
        mockIncidentResponse(false);

        const res = await service.createIncident({
          incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
        });

        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/sn_si_incident',
          method: 'post',
          data: { short_description: 'title', description: 'desc' },
          connectorUsageCollector,
        });

        expect(res.url).toEqual('https://example.com/nav_to.do?uri=sn_si_incident.do?sys_id=1');
      });

      test('it should throw if tries to update an incident with additional_fields', async () => {
        await expect(
          service.createIncident({
            incident: {
              additional_fields: {},
            } as ServiceNowITSMIncident,
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"[Action][ServiceNow]: Unable to create incident. Error: ServiceNow additional fields are not supported for deprecated connectors. Reason: unknown: errorResponse was null"`
        );
      });
    });
  });

  describe('updateIncident', () => {
    // new connectors
    describe('import set table', () => {
      test('it updates the incident correctly', async () => {
        const res = await updateIncident(service);

        expect(res).toEqual({
          title: 'INC01',
          id: '1',
          pushedDate: '2020-03-10T12:24:20.000Z',
          url: 'https://example.com/nav_to.do?uri=incident.do?sys_id=1',
        });
      });

      test('it should call request with correct arguments', async () => {
        await updateIncident(service);
        expectImportedIncident(true);
      });

      test('it should call request with correct arguments when table changes', async () => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: snExternalServiceConfig['.servicenow-sir'],
          axiosInstance: axios,
          connectorUsageCollector,
        });

        const res = await updateIncident(service);
        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/x_elas2_sir_int/elastic_api/health',
          method: 'get',
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(2, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/import/x_elas2_sir_int_elastic_si_incident',
          method: 'post',
          data: { u_short_description: 'title', u_description: 'desc', elastic_incident_id: '1' },
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(3, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/sn_si_incident/1',
          method: 'get',
          connectorUsageCollector,
        });

        expect(res.url).toEqual('https://example.com/nav_to.do?uri=sn_si_incident.do?sys_id=1');
      });

      test('it should throw an error when the application is not installed', async () => {
        requestMock.mockImplementation(() => {
          throw new Error('An error has occurred');
        });

        await expect(
          service.updateIncident({
            incidentId: '1',
            incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
          })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to update incident with id 1. Error: [Action][ServiceNow]: Unable to get application version. Error: An error has occurred Reason: unknown: errorResponse was null Reason: unknown: errorResponse was null'
        );
      });

      test('it should throw an error when instance is not alive', async () => {
        requestMock.mockImplementation(() => ({
          status: 200,
          data: {},
          request: { connection: { servername: 'Developer instance' } },
        }));
        await expect(
          service.updateIncident({
            incidentId: '1',
            incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
          })
        ).rejects.toThrow(
          'There is an issue with your Service Now Instance. Please check Developer instance.'
        );
      });

      test('it should throw an error when there is an import set api error', async () => {
        requestMock.mockImplementation(() => ({ data: getImportSetAPIError() }));
        await expect(
          service.updateIncident({
            incidentId: '1',
            incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
          })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to update incident with id 1. Error: An error has occurred while importing the incident Reason: unknown'
        );
      });

      test('it should update an incident with additional fields correctly without prefixing them with u_', async () => {
        await updateIncident(service, { additional_fields: { foo: 'test' } });

        expect(requestMock).toHaveBeenNthCalledWith(2, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/import/x_elas2_inc_int_elastic_incident',
          method: 'post',
          data: {
            u_short_description: 'title',
            u_description: 'desc',
            elastic_incident_id: '1',
            foo: 'test',
          },
          connectorUsageCollector,
        });
      });
    });

    // old connectors
    describe('table API', () => {
      beforeEach(() => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: { ...snExternalServiceConfig['.servicenow'], useImportAPI: false },
          axiosInstance: axios,
          connectorUsageCollector,
        });
      });

      test('it updates the incident correctly', async () => {
        mockIncidentResponse(true);
        mockIncidentResponse(true);

        const res = await service.updateIncident({
          incidentId: '1',
          incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
        });

        expect(res).toEqual({
          title: 'INC01',
          id: '1',
          pushedDate: '2020-03-10T12:24:20.000Z',
          url: 'https://example.com/nav_to.do?uri=incident.do?sys_id=1',
        });

        expect(requestMock).toHaveBeenCalledTimes(2);
        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/incident/1',
          method: 'patch',
          data: { short_description: 'title', description: 'desc' },
          connectorUsageCollector,
        });
      });

      test('it should call request with correct arguments when table changes', async () => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: { ...snExternalServiceConfig['.servicenow-sir'], useImportAPI: false },
          axiosInstance: axios,
          connectorUsageCollector,
        });

        mockIncidentResponse(false);
        mockIncidentResponse(true);

        const res = await service.updateIncident({
          incidentId: '1',
          incident: { short_description: 'title', description: 'desc' } as ServiceNowITSMIncident,
        });

        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/sn_si_incident/1',
          method: 'patch',
          data: { short_description: 'title', description: 'desc' },
          connectorUsageCollector,
        });

        expect(res.url).toEqual('https://example.com/nav_to.do?uri=sn_si_incident.do?sys_id=1');
      });

      test('it should throw if tries to update an incident with additional_fields', async () => {
        await expect(
          service.updateIncident({
            incidentId: '1',
            incident: {
              additional_fields: {},
            } as ServiceNowITSMIncident,
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"[Action][ServiceNow]: Unable to update incident with id 1. Error: ServiceNow additional fields are not supported for deprecated connectors. Reason: unknown: errorResponse was null"`
        );
      });
    });
  });

  describe('closeIncident', () => {
    // new connectors
    describe('import set table', () => {
      test('it closes the incident correctly with incident id', async () => {
        const res = await closeIncident({ service, incidentId: '1', correlationId: null });

        expect(res).toEqual({
          title: 'INC01',
          id: '1',
          pushedDate: '2020-03-10T12:24:20.000Z',
          url: 'https://example.com/nav_to.do?uri=incident.do?sys_id=1',
        });
      });

      test('it should call request with correct arguments with incidentId', async () => {
        const res = await closeIncident({ service, incidentId: '1', correlationId: null });
        expect(requestMock).toHaveBeenCalledTimes(4);

        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/incident/1',
          method: 'get',
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(2, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/x_elas2_inc_int/elastic_api/health',
          method: 'get',
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(3, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/import/x_elas2_inc_int_elastic_incident',
          method: 'post',
          data: {
            elastic_incident_id: '1',
            u_close_code: 'Closed/Resolved by Caller',
            u_state: '7',
            u_close_notes: 'Closed by Caller',
          },
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(4, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/incident/1',
          method: 'get',
          connectorUsageCollector,
        });

        expect(res?.url).toEqual('https://example.com/nav_to.do?uri=incident.do?sys_id=1');
      });

      test('it closes the incident correctly with correlation id', async () => {
        const res = await closeIncident({
          service,
          incidentId: null,
          correlationId: 'custom_correlation_id',
        });

        expect(res).toEqual({
          title: 'INC01',
          id: '1',
          pushedDate: '2020-03-10T12:24:20.000Z',
          url: 'https://example.com/nav_to.do?uri=incident.do?sys_id=1',
        });
      });

      test('it should call request with correct arguments with correlationId', async () => {
        const res = await closeIncident({
          service,
          incidentId: null,
          correlationId: 'custom_correlation_id',
        });

        expect(requestMock).toHaveBeenCalledTimes(4);

        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/incident?sysparm_query=ORDERBYDESCsys_created_on^correlation_id=custom_correlation_id',
          method: 'get',
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(2, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/x_elas2_inc_int/elastic_api/health',
          method: 'get',
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(3, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/import/x_elas2_inc_int_elastic_incident',
          method: 'post',
          data: {
            elastic_incident_id: '1',
            u_close_code: 'Closed/Resolved by Caller',
            u_state: '7',
            u_close_notes: 'Closed by Caller',
          },
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(4, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/incident/1',
          method: 'get',
          connectorUsageCollector,
        });

        expect(res?.url).toEqual('https://example.com/nav_to.do?uri=incident.do?sys_id=1');
      });

      test('it should throw an error when the incidentId and correlation Id are null', async () => {
        await expect(
          service.closeIncident({ incidentId: null, correlationId: null })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to close incident. Error: No correlationId or incidentId found. Reason: unknown: errorResponse was null'
        );
      });

      test('it should throw an error when correlationId is empty', async () => {
        await expect(
          service.closeIncident({ incidentId: null, correlationId: ' ' })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to close incident. Error: [Action][ServiceNow]: Unable to get incident by correlation ID  . Error: Correlation ID is empty. Reason: unknown: errorResponse was null Reason: unknown: errorResponse was null'
        );
      });

      test('it should throw an error when incidentId is empty', async () => {
        await expect(
          service.closeIncident({ incidentId: ' ', correlationId: null })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to close incident. Error: [Action][ServiceNow]: Unable to get incident with id  . Error: Incident id is empty. Reason: unknown: errorResponse was null Reason: unknown: errorResponse was null'
        );
      });

      test('it should throw an error when the no incidents found with given incidentId ', async () => {
        const axiosError = {
          message: 'Request failed with status code 404',
          response: { status: 404 },
        } as AxiosError;

        requestMock.mockImplementation(() => {
          throw axiosError;
        });

        const res = await service.closeIncident({
          incidentId: 'xyz',
          correlationId: null,
        });

        expect(requestMock).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0]).toMatchInlineSnapshot(`
          Array [
            "[ServiceNow][CloseIncident] No incident found with incidentId: xyz.",
          ]
        `);
        expect(res).toBeNull();
      });

      test('it should log warning if found incident is closed', async () => {
        requestMock.mockImplementationOnce(() => ({
          data: {
            result: {
              sys_id: '1',
              number: 'INC01',
              state: '7',
              sys_created_on: '2020-03-10 12:24:20',
            },
          },
        }));

        await service.closeIncident({ incidentId: '1', correlationId: null });

        expect(requestMock).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0]).toMatchInlineSnapshot(`
        Array [
          "[ServiceNow][CloseIncident] Incident with correlation_id: null or incidentId: 1 is closed.",
        ]
      `);
      });

      test('it should return null if no incident found, when incident to be closed is null', async () => {
        requestMock.mockImplementationOnce(() => ({
          data: {
            result: [],
          },
        }));

        const res = await service.closeIncident({ incidentId: '2', correlationId: null });
        expect(logger.warn.mock.calls[0]).toMatchInlineSnapshot(`
          Array [
            "[ServiceNow][CloseIncident] No incident found with correlation_id: null or incidentId: 2.",
          ]
        `);

        expect(res).toBeNull();
      });

      test('it should return null if found incident with correlation id is null', async () => {
        requestMock.mockImplementationOnce(() => ({
          data: {
            result: [],
          },
        }));

        const res = await service.closeIncident({
          incidentId: null,
          correlationId: 'bar',
        });

        expect(requestMock).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0]).toMatchInlineSnapshot(`
        Array [
          "[ServiceNow][CloseIncident] No incident found with correlation_id: bar or incidentId: null.",
        ]
      `);
        expect(res).toBeNull();
      });

      test('it should throw an error when instance is not alive', async () => {
        mockIncidentResponse(false);
        requestMock.mockImplementation(() => ({
          status: 200,
          data: {},
          request: { connection: { servername: 'Developer instance' } },
        }));
        await expect(
          service.closeIncident({
            incidentId: '1',
            correlationId: null,
          })
        ).rejects.toThrow(
          'There is an issue with your Service Now Instance. Please check Developer instance.'
        );
      });
    });

    // old connectors
    describe('table API', () => {
      beforeEach(() => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: { ...snExternalServiceConfig['.servicenow'], useImportAPI: false },
          axiosInstance: axios,
          connectorUsageCollector,
        });
      });

      test('it closes the incident correctly', async () => {
        mockIncidentResponse(false);
        mockImportIncident(true);
        mockIncidentResponse(true);

        const res = await service.closeIncident({
          incidentId: '1',
          correlationId: null,
        });

        expect(res).toEqual({
          title: 'INC01',
          id: '1',
          pushedDate: '2020-03-10T12:24:20.000Z',
          url: 'https://example.com/nav_to.do?uri=incident.do?sys_id=1',
        });
      });

      test('it should call request with correct arguments when table changes', async () => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: { ...snExternalServiceConfig['.servicenow-sir'], useImportAPI: false },
          axiosInstance: axios,
          connectorUsageCollector,
        });

        mockIncidentResponse(false);
        mockIncidentResponse(true);
        mockIncidentResponse(true);

        const res = await service.closeIncident({
          incidentId: '1',
          correlationId: null,
        });

        expect(requestMock).toHaveBeenNthCalledWith(1, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/sn_si_incident/1',
          method: 'get',
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(2, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/sn_si_incident/1',
          method: 'patch',
          data: {
            close_code: 'Closed/Resolved by Caller',
            state: '7',
            close_notes: 'Closed by Caller',
          },
          connectorUsageCollector,
        });

        expect(requestMock).toHaveBeenNthCalledWith(3, {
          axios,
          logger,
          configurationUtilities,
          url: 'https://example.com/api/now/v2/table/sn_si_incident/1',
          method: 'get',
          connectorUsageCollector,
        });

        expect(res?.url).toEqual('https://example.com/nav_to.do?uri=sn_si_incident.do?sys_id=1');
      });

      test('it should throw an error when the incidentId and correlationId are null', async () => {
        await expect(
          service.closeIncident({ incidentId: null, correlationId: null })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to close incident. Error: No correlationId or incidentId found. Reason: unknown: errorResponse was null'
        );
      });

      test('it should throw an error when correlationId is empty', async () => {
        await expect(
          service.closeIncident({ incidentId: null, correlationId: ' ' })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to close incident. Error: [Action][ServiceNow]: Unable to get incident by correlation ID  . Error: Correlation ID is empty. Reason: unknown: errorResponse was null Reason: unknown: errorResponse was null'
        );
      });

      test('it should throw an error when incidentId is empty', async () => {
        await expect(
          service.closeIncident({ incidentId: ' ', correlationId: null })
        ).rejects.toThrow(
          '[Action][ServiceNow]: Unable to close incident. Error: [Action][ServiceNow]: Unable to get incident with id  . Error: Incident id is empty. Reason: unknown: errorResponse was null Reason: unknown: errorResponse was null'
        );
      });
    });
  });

  describe('getFields', () => {
    test('it should call request with correct arguments', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: serviceNowCommonFields },
      }));
      await service.getFields();

      expect(requestMock).toHaveBeenCalledWith({
        axios,
        logger,
        configurationUtilities,
        url: 'https://example.com/api/now/table/sys_dictionary?sysparm_query=name=task^ORname=incident^internal_type=string&active=true&array=false&read_only=false&sysparm_fields=max_length,element,column_label,mandatory',
        connectorUsageCollector,
      });
    });

    test('it returns common fields correctly', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: serviceNowCommonFields },
      }));
      const res = await service.getFields();
      expect(res).toEqual(serviceNowCommonFields);
    });

    test('it should call request with correct arguments when table changes', async () => {
      service = createExternalService({
        credentials: {
          config: { apiUrl: 'https://example.com/', isOAuth: false },
          secrets: { username: 'admin', password: 'admin' },
        },
        logger,
        configurationUtilities,
        serviceConfig: { ...snExternalServiceConfig['.servicenow'], table: 'sn_si_incident' },
        axiosInstance: axios,
        connectorUsageCollector,
      });

      requestMock.mockImplementation(() => ({
        data: { result: serviceNowCommonFields },
      }));
      await service.getFields();

      expect(requestMock).toHaveBeenCalledWith({
        axios,
        logger,
        configurationUtilities,
        url: 'https://example.com/api/now/table/sys_dictionary?sysparm_query=name=task^ORname=sn_si_incident^internal_type=string&active=true&array=false&read_only=false&sysparm_fields=max_length,element,column_label,mandatory',
        connectorUsageCollector,
      });
    });

    test('it should throw an error', async () => {
      requestMock.mockImplementation(() => {
        throw new Error('An error has occurred');
      });
      await expect(service.getFields()).rejects.toThrow(
        '[Action][ServiceNow]: Unable to get fields. Error: An error has occurred'
      );
    });

    test('it should throw an error when instance is not alive', async () => {
      requestMock.mockImplementation(() => ({
        status: 200,
        data: {},
        request: { connection: { servername: 'Developer instance' } },
      }));
      await expect(service.getIncident('1')).rejects.toThrow(
        'There is an issue with your Service Now Instance. Please check Developer instance.'
      );
    });
  });

  describe('getChoices', () => {
    test('it should call request with correct arguments', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: serviceNowChoices },
      }));
      await service.getChoices(['priority', 'category']);

      expect(requestMock).toHaveBeenCalledWith({
        axios,
        logger,
        configurationUtilities,
        url: 'https://example.com/api/now/table/sys_choice?sysparm_query=name=task^ORname=incident^element=priority^ORelement=category^language=en&sysparm_fields=label,value,dependent_value,element',
        connectorUsageCollector,
      });
    });

    test('it returns common fields correctly', async () => {
      requestMock.mockImplementation(() => ({
        data: { result: serviceNowChoices },
      }));
      const res = await service.getChoices(['priority']);
      expect(res).toEqual(serviceNowChoices);
    });

    test('it should call request with correct arguments when table changes', async () => {
      service = createExternalService({
        credentials: {
          config: { apiUrl: 'https://example.com/', isOAuth: false },
          secrets: { username: 'admin', password: 'admin' },
        },
        logger,
        configurationUtilities,
        serviceConfig: { ...snExternalServiceConfig['.servicenow'], table: 'sn_si_incident' },
        axiosInstance: axios,
        connectorUsageCollector,
      });

      requestMock.mockImplementation(() => ({
        data: { result: serviceNowChoices },
      }));

      await service.getChoices(['priority', 'category']);

      expect(requestMock).toHaveBeenCalledWith({
        axios,
        logger,
        configurationUtilities,
        url: 'https://example.com/api/now/table/sys_choice?sysparm_query=name=task^ORname=sn_si_incident^element=priority^ORelement=category^language=en&sysparm_fields=label,value,dependent_value,element',
        connectorUsageCollector,
      });
    });

    test('it should throw an error', async () => {
      requestMock.mockImplementation(() => {
        throw new Error('An error has occurred');
      });
      await expect(service.getChoices(['priority'])).rejects.toThrow(
        '[Action][ServiceNow]: Unable to get choices. Error: An error has occurred'
      );
    });

    test('it should throw an error when instance is not alive', async () => {
      requestMock.mockImplementation(() => ({
        status: 200,
        data: {},
        request: { connection: { servername: 'Developer instance' } },
      }));
      await expect(service.getIncident('1')).rejects.toThrow(
        'There is an issue with your Service Now Instance. Please check Developer instance.'
      );
    });
  });

  describe('getUrl', () => {
    test('it returns the instance url', async () => {
      expect(service.getUrl()).toBe('https://example.com');
    });
  });

  describe('checkInstance', () => {
    test('it throws an error if there is no result on data', () => {
      const res = { status: 200, data: {} } as AxiosResponse;
      expect(() => service.checkInstance(res)).toThrow();
    });

    test('it does NOT throws an error if the status > 400', () => {
      const res = { status: 500, data: {} } as AxiosResponse;
      expect(() => service.checkInstance(res)).not.toThrow();
    });

    test('it shows the servername', () => {
      const res = {
        status: 200,
        data: {},
        request: { connection: { servername: 'https://example.com' } },
      } as AxiosResponse;
      expect(() => service.checkInstance(res)).toThrow(
        'There is an issue with your Service Now Instance. Please check https://example.com.'
      );
    });

    describe('getApplicationInformation', () => {
      test('it returns the application information', async () => {
        mockApplicationVersion();
        const res = await service.getApplicationInformation();
        expect(res).toEqual({
          name: 'Elastic',
          scope: 'x_elas2_inc_int',
          version: '1.0.0',
        });
      });

      test('it should throw an error', async () => {
        requestMock.mockImplementation(() => {
          throw new Error('An error has occurred');
        });
        await expect(service.getApplicationInformation()).rejects.toThrow(
          '[Action][ServiceNow]: Unable to get application version. Error: An error has occurred Reason: unknown'
        );
      });
    });

    describe('checkIfApplicationIsInstalled', () => {
      test('it logs the application information', async () => {
        mockApplicationVersion();
        await service.checkIfApplicationIsInstalled();
        expect(logger.debug).toHaveBeenCalledWith(
          'Create incident: Application scope: x_elas2_inc_int: Application version1.0.0'
        );
      });

      test('it does not log if useOldApi = true', async () => {
        service = createExternalService({
          credentials: {
            config: { apiUrl: 'https://example.com/', isOAuth: false },
            secrets: { username: 'admin', password: 'admin' },
          },
          logger,
          configurationUtilities,
          serviceConfig: { ...snExternalServiceConfig['.servicenow'], useImportAPI: false },
          axiosInstance: axios,
          connectorUsageCollector,
        });
        await service.checkIfApplicationIsInstalled();
        expect(requestMock).not.toHaveBeenCalled();
        expect(logger.debug).not.toHaveBeenCalled();
      });
    });
  });
});
