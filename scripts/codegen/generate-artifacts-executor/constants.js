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

const fs = require('node:fs');
const path = require('node:path');

const REACT_NATIVE_REPOSITORY_ROOT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
);

const REACT_NATIVE_PACKAGE_ROOT_FOLDER /*: string */ = path.join(
  __dirname,
  '..',
  '..',
  '..',
);
const CODEGEN_REPO_PATH = `${REACT_NATIVE_REPOSITORY_ROOT}/packages/react-native-codegen`;

const CORE_LIBRARIES_WITH_OUTPUT_FOLDER /*: {[string]: $FlowFixMe} */ = {
  FBReactNativeSpec: {
    ios: path.join(
      REACT_NATIVE_PACKAGE_ROOT_FOLDER,
      'React',
      'FBReactNativeSpec',
    ) /*:: as string */,
    android: path.join(
      REACT_NATIVE_PACKAGE_ROOT_FOLDER,
      'ReactAndroid',
      'build',
      'generated',
      'source',
      'codegen',
    ) /*:: as string */,
  },
  // The visionOS modules this package adds. They ship pre-generated like FBReactNativeSpec does,
  // so the apps that consume them never have to generate the spec themselves — which an app cannot
  // do reliably: once autolinking has run, codegen only looks at the autolinked dependencies, and
  // React Native is not one of them. There is no Android counterpart.
  FBReactNativeSpec_visionOS: {
    ios: path.join(
      REACT_NATIVE_PACKAGE_ROOT_FOLDER,
      'React',
      'FBReactNativeSpec_visionOS',
    ) /*:: as string */,
  },
};

const packageJsonPath = path.join(
  REACT_NATIVE_PACKAGE_ROOT_FOLDER,
  'package.json',
);

// $FlowFixMe[signature-verification-failure]
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const REACT_NATIVE = packageJson.name;

const TEMPLATES_FOLDER_PATH /*: string */ = path.join(
  REACT_NATIVE_PACKAGE_ROOT_FOLDER,
  'scripts',
  'codegen',
  'templates',
);

module.exports = {
  CODEGEN_REPO_PATH,
  CORE_LIBRARIES_WITH_OUTPUT_FOLDER,
  REACT_NATIVE_PACKAGE_ROOT_FOLDER,
  REACT_NATIVE,
  TEMPLATES_FOLDER_PATH,
  packageJson,
};
