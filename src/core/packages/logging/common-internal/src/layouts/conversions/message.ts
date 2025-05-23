/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LogRecord } from '@kbn/logging';
import { takeWhile } from 'lodash';
import { Conversion } from './types';

// From https://www.ascii-code.com/characters/control-characters,
// but explicitly allowing the range \u0008-\u000F (line breaks, tabs, etc.)
const CONTROL_CHAR_REGEXP = new RegExp('[\\u0000-\\u0007\\u0010-\\u001F]', 'g');

export const MessageConversion: Conversion = {
  pattern: /%message/g,
  convert(record: LogRecord) {
    // Error stack is much more useful than just the message.
    let str = record.message;
    if (record.error) {
      str = getErrorMessage(record.error);
    }
    // typings may be wrong, there's scenarios where the message is not a plain string (e.g error stacks from the ES client)
    if (typeof str !== 'string') {
      str = String(str);
    }

    return str.replace(
      CONTROL_CHAR_REGEXP,
      // Escaping control chars via JSON.stringify to maintain consistency with `meta` and the JSON layout.
      // This way, post analysis of the logs is easier as we can search the same patterns.
      // Our benchmark didn't show a big difference in performance between custom-escaping vs. JSON.stringify one.
      // The slice is removing the double-quotes.
      (substr) => JSON.stringify(substr).slice(1, -1)
    );
  },
};

function getErrorMessage(error: Error): string {
  if (error instanceof AggregateError) {
    return getAggregateErrorMessage(error);
  }
  return error.stack ?? error.message;
}

// Aggregate errors by default will only produce the
// aggregate error's stack. `getAggregateErrorMessage`
// also outputs the part of the _aggregated_ errors
// stack traces that is not shared with the aggregate
// error's stack trace.
function getAggregateErrorMessage(error: AggregateError): string {
  const [head, ...tail] = error.stack?.split('\n') ?? [];

  const trimmedLines = tail.map((line) => line.trim());

  return [
    `${head}. Caused by:`,
    ...error.errors.map((cause) =>
      takeWhile(getErrorMessage(cause).split('\n'), (line) => !trimmedLines.includes(line.trim()))
        .map((line) => `    > ${line.replace(/^\s*/, '')}`)
        .join('\n')
    ),
    ...tail,
  ].join('\n');
}
