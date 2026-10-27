/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @generated SignedSource<<d661ba30f03bbc946739cf6341bd214f>>
 *
 * This file was translated from Flow by scripts/js-api/build-types/index.js.
 * Original file: packages/react-native/Libraries/XR/XR.js
 */

declare const XR: {
  requestSession: (sessionId: string, userInfo: null | undefined | Object) => Promise<void>;
  endSession: () => Promise<void>;
};
declare const $$XR: typeof XR;
declare type $$XR = typeof $$XR;
export default $$XR;
