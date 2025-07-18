/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSuperSelect,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback, useMemo, useState } from 'react';

import { PromptResponse, PromptTypeEnum } from '@kbn/elastic-assistant-common/impl/schemas';
import { getOptions } from '../helpers';
import * as i18n from '../translations';
import { useAssistantContext } from '../../../../assistant_context';
import { TEST_IDS } from '../../../constants';
import { PROMPT_CONTEXT_SELECTOR_PREFIX } from '../../../quick_prompts/prompt_context_selector/translations';
import { SYSTEM_PROMPTS_TAB } from '../../../settings/const';

export interface Props {
  allPrompts: PromptResponse[];
  compressed?: boolean;
  clearSelectedSystemPrompt?: () => void;
  isClearable?: boolean;
  isDisabled?: boolean;
  isOpen?: boolean;
  isSettingsModalVisible: boolean;
  selectedPrompt: PromptResponse | undefined;
  setIsSettingsModalVisible?: React.Dispatch<React.SetStateAction<boolean>>;
  onSystemPromptSelectionChange: (promptId: string | undefined) => void;
}

const ADD_NEW_SYSTEM_PROMPT = 'ADD_NEW_SYSTEM_PROMPT';

const SelectSystemPromptComponent: React.FC<Props> = ({
  allPrompts,
  compressed = false,
  clearSelectedSystemPrompt,
  isClearable = false,
  isDisabled = false,
  isOpen = false,
  isSettingsModalVisible,
  onSystemPromptSelectionChange,
  selectedPrompt,
  setIsSettingsModalVisible,
}) => {
  const { euiTheme } = useEuiTheme();
  const { setSelectedSettingsTab } = useAssistantContext();
  const allSystemPrompts = useMemo(
    () => allPrompts.filter((p) => p.promptType === PromptTypeEnum.system),
    [allPrompts]
  );

  const [isOpenLocal, setIsOpenLocal] = useState<boolean>(isOpen);
  const handleOnBlur = useCallback(() => setIsOpenLocal(false), []);
  const valueOfSelected = useMemo(() => selectedPrompt?.id, [selectedPrompt?.id]);

  const addNewSystemPrompt = useMemo(
    () => ({
      value: ADD_NEW_SYSTEM_PROMPT,
      inputDisplay: i18n.ADD_NEW_SYSTEM_PROMPT,
      dropdownDisplay: (
        <EuiFlexGroup gutterSize="none" key={ADD_NEW_SYSTEM_PROMPT}>
          <EuiFlexItem grow={true}>
            <EuiButtonEmpty href="#" iconType="plus" size="xs" data-test-subj="addSystemPrompt">
              {i18n.ADD_NEW_SYSTEM_PROMPT}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {/* Right offset to compensate for 'selected' icon of EuiSuperSelect since native footers aren't supported*/}
            <div style={{ width: '24px' }} />
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    }),
    []
  );

  // SuperSelect State/Actions
  const options = useMemo(() => getOptions(allSystemPrompts), [allSystemPrompts]);

  const onChange = useCallback(
    async (selectedSystemPromptId: string) => {
      if (selectedSystemPromptId === ADD_NEW_SYSTEM_PROMPT) {
        setIsSettingsModalVisible?.(true);
        setSelectedSettingsTab(SYSTEM_PROMPTS_TAB);
        return;
      }
      onSystemPromptSelectionChange(selectedSystemPromptId);
    },
    [onSystemPromptSelectionChange, setIsSettingsModalVisible, setSelectedSettingsTab]
  );

  const clearSystemPrompt = useCallback(() => {
    clearSelectedSystemPrompt?.();
  }, [clearSelectedSystemPrompt]);

  return (
    <EuiFlexGroup
      data-test-subj="selectSystemPrompt"
      gutterSize="none"
      alignItems="center"
      css={css`
        position: relative;
      `}
    >
      <EuiFlexItem
        css={css`
          max-width: 100%;
        `}
      >
        <EuiFormRow
          css={css`
            min-width: 100%;
          `}
        >
          <EuiSuperSelect
            // Limits popover z-index to prevent it from getting too high and covering tooltips.
            // If the z-index is not defined, when a popover is opened, it sets the target z-index + 2000
            popoverProps={{ zIndex: euiTheme.levels.modal as number }}
            compressed={compressed}
            data-test-subj={TEST_IDS.PROMPT_SUPERSELECT}
            fullWidth
            hasDividers
            itemLayoutAlign="top"
            disabled={isDisabled}
            isOpen={isOpenLocal && !isSettingsModalVisible}
            onChange={onChange}
            onBlur={handleOnBlur}
            options={[...options, addNewSystemPrompt]}
            placeholder={i18n.SELECT_A_SYSTEM_PROMPT}
            valueOfSelected={valueOfSelected}
            prepend={!isSettingsModalVisible ? PROMPT_CONTEXT_SELECTOR_PREFIX : undefined}
            css={css`
              padding-right: 56px !important;
              ${compressed ? 'font-size: 0.9rem;' : ''}
            `}
          />
        </EuiFormRow>
      </EuiFlexItem>

      <EuiFlexItem
        grow={false}
        css={css`
          position: absolute;
          right: 36px;
        `}
      >
        {isClearable && selectedPrompt && (
          <EuiToolTip content={i18n.CLEAR_SYSTEM_PROMPT}>
            <EuiButtonIcon
              aria-label={i18n.CLEAR_SYSTEM_PROMPT}
              data-test-subj="clearSystemPrompt"
              iconType="cross"
              onClick={clearSystemPrompt}
              // mimic EuiComboBox clear button
              css={css`
                inline-size: 16px;
                block-size: 16px;
                border-radius: 16px;
                background: ${euiTheme.colors.backgroundBaseSubdued};

                :hover:not(:disabled) {
                  background: ${euiTheme.colors.backgroundBaseSubdued};
                  transform: none;
                }

                > svg {
                  width: 8px;
                  height: 8px;
                  stroke-width: 2px;
                  fill: #fff;
                  stroke: #fff;
                }
              `}
            />
          </EuiToolTip>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

SelectSystemPromptComponent.displayName = 'SelectSystemPromptComponent';

export const SelectSystemPrompt = React.memo(SelectSystemPromptComponent);
