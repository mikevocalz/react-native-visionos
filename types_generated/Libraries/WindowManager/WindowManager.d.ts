/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @generated SignedSource<<2fb0b5f93b3352a5d3840c070c526fd0>>
 *
 * This file was translated from Flow by scripts/js-api/build-types/index.js.
 * Original file: packages/react-native/Libraries/WindowManager/WindowManager.js
 */

declare const WindowManager: {
  getWindow: (id: string) => Window;
  get supportsMultipleScenes(): boolean;
};
declare class Window {
  id: string;
  constructor(id: string);
  open(props: null | undefined | Object): Promise<void>;
  close(): Promise<void>;
  update(props: null | undefined | Object): Promise<void>;
}
declare const $$WindowManager: typeof WindowManager;
declare type $$WindowManager = typeof $$WindowManager;
export default $$WindowManager;
