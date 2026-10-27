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
const {TEMPLATES_FOLDER_PATH} = require('./constants');
const {codegenLog, writeFileSyncIfChanged} = require('./utils');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_SWIFT_TEMPLATE_PATH = path.join(
  TEMPLATES_FOLDER_PATH,
  'Package.swift.template',
);

function generatePackageSwift(
  projectRoot /*: string */,
  outputDir /*: string */,
  reactNativePath /*: string */,
) {
  const fullOutputPath = path.join(projectRoot, outputDir);
  fs.mkdirSync(outputDir, {recursive: true});
  // Generate PAckage.swift File
  codegenLog('Generating Package.swift');
  const templateH = fs
    .readFileSync(PACKAGE_SWIFT_TEMPLATE_PATH, 'utf8')
    .replace(
      /{reactNativePath}/,
      path.relative(fullOutputPath, reactNativePath),
    );
  const finalPathH = path.join(outputDir, 'Package.swift');
  writeFileSyncIfChanged(finalPathH, templateH);
  codegenLog(`Generated artifact: ${finalPathH}`);
  generateReactAppHeaders(outputDir);
}

// The ReactAppHeaders target of the manifest above: one include directory that
// links every entry of ReactCodegen/, so `<NitroModulesSpec/NitroModulesSpec.h>`
// resolves the way it does under `react-native spm`. Links are relative, so the
// tree survives the build-time codegen phase copying outputs around.
function generateReactAppHeaders(outputDir /*: string */) {
  const codegenDir = path.join(outputDir, 'ReactCodegen');
  const targetDir = path.join(outputDir, 'ReactAppHeaders');
  const includeDir = path.join(targetDir, 'include');
  fs.mkdirSync(includeDir, {recursive: true});
  // Update in place: the build-time codegen phase runs this while SwiftPM
  // targets may already be compiling against the directory.
  const wanted = new Map();
  if (fs.existsSync(codegenDir)) {
    for (const entry of fs.readdirSync(codegenDir)) {
      if (entry !== 'headers' && !entry.endsWith('.podspec')) {
        wanted.set(entry, path.relative(includeDir, path.join(codegenDir, entry)));
      }
    }
  }
  for (const entry of fs.readdirSync(includeDir)) {
    const link = path.join(includeDir, entry);
    let target = null;
    try {
      target = fs.readlinkSync(link);
    } catch {}
    if (wanted.get(entry) !== target) {
      fs.rmSync(link, {recursive: true, force: true});
    }
  }
  for (const [entry, target] of wanted) {
    const link = path.join(includeDir, entry);
    if (!fs.existsSync(link)) {
      fs.symlinkSync(target, link);
    }
  }
  writeFileSyncIfChanged(
    path.join(targetDir, 'shim.c'),
    '// SwiftPM needs one source file per target. This target only vends headers.\n' +
      'int react_codegen_app_headers_shim;\n',
  );
  codegenLog(`Generated artifact: ${includeDir}`);
}

module.exports = {
  generatePackageSwift,
};
