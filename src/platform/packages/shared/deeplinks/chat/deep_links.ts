/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ONECHAT_APP_ID, WORKCHAT_APP_ID } from './constants';

export type WorkchatApp = typeof WORKCHAT_APP_ID;
export type OnechatApp = typeof ONECHAT_APP_ID;

export type WorkchatLinkId = 'agents' | 'integrations';
export type OnechatLinkId = 'conversations' | 'tools' | 'agents';

export type DeepLinkId =
  | WorkchatApp
  | `${WorkchatApp}:${WorkchatLinkId}`
  | OnechatApp
  | `${OnechatApp}:${OnechatLinkId}`;
