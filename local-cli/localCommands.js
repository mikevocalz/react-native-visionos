/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

/*::
import type {Command} from '@react-native-community/cli-types';
 */

const platformName = 'visionos';

/**
 * Builds the visionOS commands from an already resolved
 * `@react-native-community/cli-platform-apple`. The caller owns resolution so
 * that a project without the Apple platform package still gets a usable
 * `react-native.config.js`.
 */
function createCommands(apple /*: $FlowFixMe */) /*: Array<Command> */ {
  const run /*: Command */ = {
    name: 'run-visionos',
    description: 'builds your app and starts it on visionOS simulator',
    func: apple.createRun({platformName}),
    examples: [
      {
        desc: 'Run on a specific simulator',
        cmd: 'npx react-native run-visionos --simulator "Apple Vision Pro"',
      },
    ],
    options: apple.getRunOptions({platformName}),
  };

  const log /*: Command */ = {
    name: 'log-visionos',
    description: 'starts visionOS device syslog tail',
    func: apple.createLog({platformName}),
    options: apple.getLogOptions({platformName}),
  };

  const build /*: Command */ = {
    name: 'build-visionos',
    description: 'builds your app for visionOS platform',
    func: apple.createBuild({platformName}),
    examples: [
      {
        desc: 'Build the app for all visionOS devices in Release mode',
        cmd: 'npx react-native build-visionos --mode "Release"',
      },
    ],
    options: apple.getBuildOptions({platformName}),
  };

  return [run, log, build];
}

module.exports = {createCommands};
