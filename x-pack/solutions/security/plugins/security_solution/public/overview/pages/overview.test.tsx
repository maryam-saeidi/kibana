/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { merge } from 'lodash';

import { TestProviders } from '../../common/mock';
import type { UseMessagesStorage } from '../../common/containers/local_storage/use_messages_storage';
import { useMessagesStorage } from '../../common/containers/local_storage/use_messages_storage';
import { Overview } from '.';
import { useUserPrivileges } from '../../common/components/user_privileges';
import { useSourcererDataView } from '../../sourcerer/containers';
import { useFetchIndex } from '../../common/containers/source';
import { useAllTiDataSources } from '../containers/overview_cti_links/use_all_ti_data_sources';
import { mockCtiLinksResponse, mockTiDataSources } from '../components/overview_cti_links/mock';
import { useCtiDashboardLinks } from '../containers/overview_cti_links';
import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { initialUserPrivilegesState } from '../../common/components/user_privileges/user_privileges_context';
import type { EndpointPrivileges } from '../../../common/endpoint/types';
import { mockCasesContract } from '@kbn/cases-plugin/public/mocks';
import { useRiskScore } from '../../entity_analytics/api/hooks/use_risk_score';

const mockNavigateToApp = jest.fn();
jest.mock('../../common/components/empty_prompt');
jest.mock('../../common/lib/kibana', () => {
  const original = jest.requireActual('../../common/lib/kibana');

  return {
    ...original,
    useKibana: () => ({
      services: {
        ...original.useKibana().services,
        application: {
          ...original.useKibana().services.application,
          navigateToApp: mockNavigateToApp,
        },
        cases: {
          ...mockCasesContract(),
        },
      },
    }),
  };
});
jest.mock('../../common/containers/source');
jest.mock('../../sourcerer/containers');
jest.mock('../../common/components/visualization_actions/lens_embeddable');
jest.mock('../../common/containers/use_global_time', () => ({
  useGlobalTime: jest.fn().mockReturnValue({
    from: '2020-07-07T08:20:18.966Z',
    isInitializing: false,
    to: '2020-07-08T08:20:18.966Z',
    setQuery: jest.fn(),
  }),
}));

// Test will fail because we will to need to mock some core services to make the test work
// For now let's forget about SiemSearchBar and QueryBar
jest.mock('../../common/components/search_bar', () => ({
  SiemSearchBar: () => null,
}));
jest.mock('../../common/components/query_bar', () => ({
  QueryBar: () => null,
}));
jest.mock('../../common/components/user_privileges', () => {
  return {
    ...jest.requireActual('../../common/components/user_privileges'),
    useUserPrivileges: jest.fn(() => {
      return {
        listPrivileges: { loading: false, error: undefined, result: undefined },
        detectionEnginePrivileges: { loading: false, error: undefined, result: undefined },
        endpointPrivileges: {
          loading: false,
          canAccessEndpointManagement: true,
          canAccessFleet: true,
        },
      };
    }),
  };
});
jest.mock('../../common/containers/local_storage/use_messages_storage');

jest.mock('../containers/overview_cti_links');

jest.mock('../../common/components/visualization_actions/actions');

const useCtiDashboardLinksMock = useCtiDashboardLinks as jest.Mock;
useCtiDashboardLinksMock.mockReturnValue(mockCtiLinksResponse);

jest.mock('../containers/overview_cti_links/use_all_ti_data_sources');
const useAllTiDataSourcesMock = useAllTiDataSources as jest.Mock;
useAllTiDataSourcesMock.mockReturnValue(mockTiDataSources);

jest.mock('../../entity_analytics/api/hooks/use_risk_score');
const useRiskScoreMock = useRiskScore as jest.Mock;
useRiskScoreMock.mockReturnValue({ loading: false, data: [], hasEngineBeenInstalled: false });

jest.mock('../../common/hooks/use_experimental_features');
const useIsExperimentalFeatureEnabledMock = useIsExperimentalFeatureEnabled as jest.Mock;
useIsExperimentalFeatureEnabledMock.mockReturnValue(false);

jest.mock('../../sourcerer/containers', () => ({
  useSourcererDataView: jest.fn().mockReturnValue({
    selectedPatterns: ['auditbeat-mytest-*'],
    dataViewId: 'security-solution-my-test',
    indicesExist: true,
    sourcererDataView: {},
  }),
}));

const endpointNoticeMessage = (hasMessageValue: boolean) => {
  return {
    hasMessage: () => hasMessageValue,
    getMessages: () => [],
    addMessage: () => undefined,
    removeMessage: () => undefined,
    clearAllMessages: () => undefined,
  };
};
const mockUseSourcererDataView = useSourcererDataView as jest.Mock;
const mockUseUserPrivileges = useUserPrivileges as jest.Mock;
const mockUseFetchIndex = useFetchIndex as jest.Mock;
const mockUseMessagesStorage: jest.Mock = useMessagesStorage as jest.Mock<UseMessagesStorage>;

describe('Overview', () => {
  const loadedUserPrivilegesState = (
    endpointOverrides: Partial<EndpointPrivileges> = {}
  ): ReturnType<typeof initialUserPrivilegesState> =>
    merge(initialUserPrivilegesState(), {
      endpointPrivileges: {
        loading: false,
        canAccessFleet: true,
        canAccessEndpointManagement: true,
        ...endpointOverrides,
      },
    });

  beforeEach(() => {
    mockUseUserPrivileges.mockReturnValue(loadedUserPrivilegesState());
    mockUseFetchIndex.mockReturnValue([
      false,
      {
        indexExists: true,
      },
    ]);
  });

  afterAll(() => {
    mockUseUserPrivileges.mockReset();
  });

  describe('rendering', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    test('it DOES NOT render the Getting started text when an index is available', () => {
      mockUseSourcererDataView.mockReturnValue({
        selectedPatterns: [],
        indicesExist: true,
        indexPattern: {},
      });

      mockUseMessagesStorage.mockImplementation(() => endpointNoticeMessage(false));

      render(
        <TestProviders>
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        </TestProviders>
      );

      expect(mockNavigateToApp).not.toHaveBeenCalled();
    });

    test('it DOES render the Endpoint banner when the endpoint index is NOT available AND storage is NOT set', () => {
      mockUseFetchIndex.mockReturnValue([
        false,
        {
          indexExists: false,
        },
      ]);
      mockUseSourcererDataView.mockReturnValue({
        selectedPatterns: [],
        indicesExist: true,
        indexPattern: {},
      });

      mockUseMessagesStorage.mockImplementation(() => endpointNoticeMessage(false));

      render(
        <TestProviders>
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        </TestProviders>
      );

      expect(screen.getByTestId('endpoint-prompt-banner')).toBeInTheDocument();
    });

    test('it does NOT render the Endpoint banner when the endpoint index is NOT available but storage is set', () => {
      mockUseFetchIndex.mockReturnValue([
        false,
        {
          indexExists: false,
        },
      ]);
      mockUseSourcererDataView.mockReturnValueOnce({
        selectedPatterns: [],
        indicesExist: true,
        indexPattern: {},
      });

      mockUseMessagesStorage.mockImplementation(() => endpointNoticeMessage(true));

      render(
        <TestProviders>
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        </TestProviders>
      );

      expect(screen.queryByTestId('endpoint-prompt-banner')).not.toBeInTheDocument();
    });

    test('it does NOT render the Endpoint banner when the endpoint index is available AND storage is set', () => {
      mockUseSourcererDataView.mockReturnValue({
        selectedPatterns: [],
        indexExists: true,
        indexPattern: {},
      });

      mockUseMessagesStorage.mockImplementation(() => endpointNoticeMessage(true));

      render(
        <TestProviders>
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        </TestProviders>
      );

      expect(screen.queryByTestId('endpoint-prompt-banner')).not.toBeInTheDocument();
    });

    test('it does NOT render the Endpoint banner when an index IS available but storage is NOT set', () => {
      mockUseSourcererDataView.mockReturnValue({
        selectedPatterns: [],
        indicesExist: true,
        indexPattern: {},
      });

      mockUseMessagesStorage.mockImplementation(() => endpointNoticeMessage(false));

      render(
        <TestProviders>
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        </TestProviders>
      );
      expect(screen.queryByTestId('endpoint-prompt-banner')).not.toBeInTheDocument();
    });

    test('it does NOT render the Endpoint banner when Ingest is NOT available', () => {
      mockUseSourcererDataView.mockReturnValue({
        selectedPatterns: [],
        indicesExist: true,
        indexPattern: {},
      });

      mockUseMessagesStorage.mockImplementation(() => endpointNoticeMessage(true));
      mockUseUserPrivileges.mockReturnValue(loadedUserPrivilegesState({ canAccessFleet: false }));

      render(
        <TestProviders>
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        </TestProviders>
      );

      expect(screen.queryByTestId('endpoint-prompt-banner')).not.toBeInTheDocument();
    });

    describe('when no index is available', () => {
      beforeEach(() => {
        mockUseSourcererDataView.mockReturnValue({
          selectedPatterns: [],
          indicesExist: false,
        });
        mockUseUserPrivileges.mockReturnValue(loadedUserPrivilegesState({ canAccessFleet: false }));
        mockUseMessagesStorage.mockImplementation(() => endpointNoticeMessage(false));
      });

      it('renders getting started page', () => {
        render(
          <TestProviders>
            <MemoryRouter>
              <Overview />
            </MemoryRouter>
          </TestProviders>
        );

        expect(screen.getByTestId('empty-prompt')).toBeInTheDocument();
      });
    });
  });

  describe('Threat Intel Dashboard Links', () => {
    it('invokes useAllTiDataSourcesMock hook only once', () => {
      mockUseMessagesStorage.mockImplementation(() => endpointNoticeMessage(false));
      useAllTiDataSourcesMock.mockClear();
      render(
        <TestProviders>
          <MemoryRouter>
            <Overview />
          </MemoryRouter>
        </TestProviders>
      );
      expect(useAllTiDataSourcesMock).toHaveBeenCalledTimes(1);
    });
  });
});
