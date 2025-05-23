/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ActionsClientLlm } from '@kbn/langchain/server';
import type { ZodType } from '@kbn/zod';
import type { AttackDiscovery } from '@kbn/elastic-assistant-common';
import { FakeLLM } from '@langchain/core/utils/testing';

import type { AttackDiscoveryGraphState } from '../../../graphs';
import {
  mockAnonymizedAlerts,
  mockAnonymizedAlertsReplacements,
} from '../../../../attack_discovery/evaluation/__mocks__/mock_anonymized_alerts';
import {
  ATTACK_DISCOVERY_CONTINUE,
  ATTACK_DISCOVERY_DEFAULT,
  ATTACK_DISCOVERY_REFINE,
} from '../../../../prompt/prompts';
import { getChainWithFormatInstructions } from '../helpers/get_chain_with_format_instructions';
import { getAnonymizedDocsFromState } from './helpers/get_anonymized_docs_from_state';
import { getGenerateNode } from '.';
import { getAttackDiscoveriesGenerationSchema } from '../../../../attack_discovery/graphs/default_attack_discovery_graph/schemas';
import {
  getParsedAttackDiscoveriesMock,
  getRawAttackDiscoveriesMock,
} from '../../../../../__mocks__/raw_attack_discoveries';
import { getCombinedAttackDiscoveryPrompt } from '../../../../attack_discovery/graphs/default_attack_discovery_graph/prompts/get_combined_attack_discovery_prompt';

const attackDiscoveryTimestamp = '2024-10-11T17:55:59.702Z';

jest.mock('../helpers/get_chain_with_format_instructions', () => {
  const mockInvoke = jest.fn().mockResolvedValue('');

  return {
    getChainWithFormatInstructions: jest.fn().mockReturnValue({
      chain: {
        invoke: mockInvoke,
      },
      formatInstructions: ['mock format instructions'],
      llmType: 'openai',
      mockInvoke, // <-- added for testing
    }),
  };
});

const mockLogger = {
  debug: (x: Function) => x(),
} as unknown as Logger;

let mockLlm: ActionsClientLlm;

const initialGraphState: AttackDiscoveryGraphState = {
  insights: null,
  prompt: ATTACK_DISCOVERY_DEFAULT,
  anonymizedDocuments: [...mockAnonymizedAlerts],
  combinedGenerations: '',
  combinedRefinements: '',
  continuePrompt: ATTACK_DISCOVERY_CONTINUE,
  errors: [],
  generationAttempts: 0,
  generations: [],
  hallucinationFailures: 0,
  maxGenerationAttempts: 10,
  maxHallucinationFailures: 5,
  maxRepeatedGenerations: 3,
  refinements: [],
  refinePrompt: ATTACK_DISCOVERY_REFINE,
  replacements: {
    ...mockAnonymizedAlertsReplacements,
  },
  unrefinedResults: null,
};

const prompts = {
  default: '',
  refine: '',
  continue: '',
  detailsMarkdown: '',
  entitySummaryMarkdown: '',
  mitreAttackTactics: '',
  summaryMarkdown: '',
  title: '',
  insights: '',
};

describe('getGenerateNode', () => {
  let mockResponseIsHallucinated: jest.Mock;
  let generationSchema: ZodType<{ insights: AttackDiscovery[] }>;

  beforeEach(() => {
    jest.clearAllMocks();

    jest.useFakeTimers();
    jest.setSystemTime(new Date(attackDiscoveryTimestamp));

    mockLlm = new FakeLLM({
      response: '',
    }) as unknown as ActionsClientLlm;

    mockResponseIsHallucinated = jest.fn().mockReturnValue(false);

    generationSchema = getAttackDiscoveriesGenerationSchema(prompts);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a function', () => {
    const generateNode = getGenerateNode({
      llm: mockLlm,
      logger: mockLogger,
      getCombinedPromptFn: getCombinedAttackDiscoveryPrompt,
      responseIsHallucinated: mockResponseIsHallucinated,
      generationSchema,
    });

    expect(typeof generateNode).toBe('function');
  });

  it('invokes the chain with the expected alerts from state and formatting instructions', async () => {
    const mockInvoke = getChainWithFormatInstructions({ llm: mockLlm, generationSchema }).chain
      .invoke as jest.Mock;

    const generateNode = getGenerateNode({
      llm: mockLlm,
      logger: mockLogger,
      getCombinedPromptFn: getCombinedAttackDiscoveryPrompt,
      responseIsHallucinated: mockResponseIsHallucinated,
      generationSchema,
    });

    await generateNode(initialGraphState);

    expect(mockInvoke).toHaveBeenCalledWith({
      format_instructions: ['mock format instructions'],
      query: `${initialGraphState.prompt}

Use context from the following alerts to provide insights:

\"\"\"
${getAnonymizedDocsFromState(initialGraphState).join('\n\n')}
\"\"\"
`,
    });
  });

  it('removes the surrounding json from the response', async () => {
    const response =
      'You asked for some JSON, here it is:\n```json\n{"key": "value"}\n```\nI hope that works for you.';

    const mockLlmWithResponse = new FakeLLM({ response }) as unknown as ActionsClientLlm;
    const mockInvoke = getChainWithFormatInstructions({
      llm: mockLlmWithResponse,
      generationSchema,
    }).chain.invoke as jest.Mock;

    mockInvoke.mockResolvedValue(response);

    const generateNode = getGenerateNode({
      llm: mockLlmWithResponse,
      logger: mockLogger,
      getCombinedPromptFn: getCombinedAttackDiscoveryPrompt,
      responseIsHallucinated: mockResponseIsHallucinated,
      generationSchema,
    });

    const state = await generateNode(initialGraphState);

    expect(state).toEqual({
      ...initialGraphState,
      combinedGenerations: '{"key": "value"}',
      errors: [
        'generate node is unable to parse (fake) response from attempt 0; (this may be an incomplete response from the model): [\n  {\n    "code": "invalid_type",\n    "expected": "array",\n    "received": "undefined",\n    "path": [\n      "insights"\n    ],\n    "message": "Required"\n  }\n]',
      ],
      generationAttempts: 1,
      generations: ['{"key": "value"}'],
    });
  });

  it('handles hallucinations', async () => {
    const hallucinatedResponse =
      'tactics like **Credential Access**, **Command and Control**, and **Persistence**.",\n      "entitySummaryMarkdown": "Malware detected on host **{{ host.name hostNameValue }}**';

    const mockLlmWithHallucination = new FakeLLM({
      response: hallucinatedResponse,
    }) as unknown as ActionsClientLlm;
    const mockInvoke = getChainWithFormatInstructions({
      llm: mockLlmWithHallucination,
      generationSchema,
    }).chain.invoke as jest.Mock;

    mockInvoke.mockResolvedValue(hallucinatedResponse);

    const generateNode = getGenerateNode({
      llm: mockLlmWithHallucination,
      logger: mockLogger,
      getCombinedPromptFn: getCombinedAttackDiscoveryPrompt,
      responseIsHallucinated: mockResponseIsHallucinated.mockReturnValueOnce(true),
      generationSchema,
    });

    const withPreviousGenerations = {
      ...initialGraphState,
      combinedGenerations: '{"key": "value"}',
      generationAttempts: 1,
      generations: ['{"key": "value"}'],
    };

    const state = await generateNode(withPreviousGenerations);

    expect(state).toEqual({
      ...withPreviousGenerations,
      combinedGenerations: '', // <-- reset
      generationAttempts: 2, // <-- incremented
      generations: [], // <-- reset
      hallucinationFailures: 1, // <-- incremented
    });
  });

  it('discards previous generations and starts over when the maxRepeatedGenerations limit is reached', async () => {
    const repeatedResponse = 'gen1';

    const mockLlmWithRepeatedGenerations = new FakeLLM({
      response: repeatedResponse,
    }) as unknown as ActionsClientLlm;
    const mockInvoke = getChainWithFormatInstructions({
      llm: mockLlmWithRepeatedGenerations,
      generationSchema,
    }).chain.invoke as jest.Mock;

    mockInvoke.mockResolvedValue(repeatedResponse);

    const generateNode = getGenerateNode({
      llm: mockLlmWithRepeatedGenerations,
      logger: mockLogger,
      getCombinedPromptFn: getCombinedAttackDiscoveryPrompt,
      responseIsHallucinated: mockResponseIsHallucinated,
      generationSchema,
    });

    const withPreviousGenerations = {
      ...initialGraphState,
      combinedGenerations: 'gen1gen1',
      generationAttempts: 2,
      generations: ['gen1', 'gen1'],
    };

    const state = await generateNode(withPreviousGenerations);

    expect(state).toEqual({
      ...withPreviousGenerations,
      combinedGenerations: '',
      generationAttempts: 3, // <-- incremented
      generations: [],
    });
  });

  it('combines the response with the previous generations', async () => {
    const response = 'gen1';

    const mockLlmWithResponse = new FakeLLM({
      response,
    }) as unknown as ActionsClientLlm;
    const mockInvoke = getChainWithFormatInstructions({
      llm: mockLlmWithResponse,
      generationSchema,
    }).chain.invoke as jest.Mock;

    mockInvoke.mockResolvedValue(response);

    const generateNode = getGenerateNode({
      llm: mockLlmWithResponse,
      logger: mockLogger,
      getCombinedPromptFn: getCombinedAttackDiscoveryPrompt,
      responseIsHallucinated: mockResponseIsHallucinated,
      generationSchema,
    });

    const withPreviousGenerations = {
      ...initialGraphState,
      combinedGenerations: 'gen0',
      generationAttempts: 1,
      generations: ['gen0'],
    };

    const state = await generateNode(withPreviousGenerations);

    expect(state).toEqual({
      ...withPreviousGenerations,
      combinedGenerations: 'gen0gen1',
      errors: [
        'generate node is unable to parse (fake) response from attempt 1; (this may be an incomplete response from the model): SyntaxError: Unexpected token \'g\', "gen0gen1" is not valid JSON',
      ],
      generationAttempts: 2,
      generations: ['gen0', 'gen1'],
    });
  });

  it('returns unrefined results when combined responses pass validation', async () => {
    // split the response into two parts to simulate a valid response
    const splitIndex = 100; // arbitrary index
    const firstResponse = getRawAttackDiscoveriesMock().slice(0, splitIndex);
    const secondResponse = getRawAttackDiscoveriesMock().slice(splitIndex);

    const mockLlmWithResponse = new FakeLLM({
      response: secondResponse,
    }) as unknown as ActionsClientLlm;
    const mockInvoke = getChainWithFormatInstructions({
      llm: mockLlmWithResponse,
      generationSchema,
    }).chain.invoke as jest.Mock;

    mockInvoke.mockResolvedValue(secondResponse);

    const generateNode = getGenerateNode({
      llm: mockLlmWithResponse,
      logger: mockLogger,
      getCombinedPromptFn: getCombinedAttackDiscoveryPrompt,
      responseIsHallucinated: mockResponseIsHallucinated,
      generationSchema,
    });

    const withPreviousGenerations = {
      ...initialGraphState,
      combinedGenerations: firstResponse,
      generationAttempts: 1,
      generations: [firstResponse],
    };

    const state = await generateNode(withPreviousGenerations);

    expect(state).toEqual({
      ...withPreviousGenerations,
      insights: null,
      combinedGenerations: firstResponse.concat(secondResponse),
      errors: [],
      generationAttempts: 2,
      generations: [firstResponse, secondResponse],
      unrefinedResults: getParsedAttackDiscoveriesMock(attackDiscoveryTimestamp), // <-- generated from the combined response
    });
  });

  it('skips the refinements step if the max number of retries has already been reached', async () => {
    // split the response into two parts to simulate a valid response
    const splitIndex = 100; // arbitrary index
    const firstResponse = getRawAttackDiscoveriesMock().slice(0, splitIndex);
    const secondResponse = getRawAttackDiscoveriesMock().slice(splitIndex);

    const mockLlmWithResponse = new FakeLLM({
      response: secondResponse,
    }) as unknown as ActionsClientLlm;
    const mockInvoke = getChainWithFormatInstructions({
      llm: mockLlmWithResponse,
      generationSchema,
    }).chain.invoke as jest.Mock;

    mockInvoke.mockResolvedValue(secondResponse);

    const generateNode = getGenerateNode({
      llm: mockLlmWithResponse,
      logger: mockLogger,
      getCombinedPromptFn: getCombinedAttackDiscoveryPrompt,
      responseIsHallucinated: mockResponseIsHallucinated,
      generationSchema,
    });

    const withPreviousGenerations = {
      ...initialGraphState,
      combinedGenerations: firstResponse,
      generationAttempts: 9,
      generations: [firstResponse],
    };

    const state = await generateNode(withPreviousGenerations);

    expect(state).toEqual({
      ...withPreviousGenerations,
      insights: getParsedAttackDiscoveriesMock(attackDiscoveryTimestamp), // <-- skip the refinement step
      combinedGenerations: firstResponse.concat(secondResponse),
      errors: [],
      generationAttempts: 10,
      generations: [firstResponse, secondResponse],
      unrefinedResults: getParsedAttackDiscoveriesMock(attackDiscoveryTimestamp), // <-- generated from the combined response
    });
  });
});
