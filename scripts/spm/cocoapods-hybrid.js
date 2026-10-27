/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

/**
 * cocoapods-hybrid.js – lays out the Swift packages a CocoaPods install needs
 * to link SwiftPM-only libraries (Nitro V1 modules and anything else whose
 * package.json declares `swiftpmConfig`).
 *
 * Run by scripts/cocoapods/swiftpm_hybrid.rb from `react_native_post_install`.
 *
 *   node cocoapods-hybrid.js --project-root <dir containing the Podfile>
 *
 * Writes, under <project-root>/build:
 *   generated/autolinking/libs/<SwiftName>   symlink to each library's root, the
 *                                            location their Package.swift
 *                                            resolves its relative paths from
 *   xcframeworks/Package.swift               the `ReactNative` package. Its
 *                                            three header products serve the
 *                                            headers CocoaPods installed (see
 *                                            mirrorPodHeaders); the React
 *                                            binaries come from the pods.
 *   generated/autolinking/Autolinked/        one package whose `Autolinked`
 *                                            product depends on every library
 *   generated/autolinking/swiftpm-hybrid.json  what was linked, for the Ruby side
 *
 * The codegen package these libraries also reference (build/generated/ios,
 * `React-GeneratedCode`, product `ReactAppHeaders`) is written by codegen
 * itself; see scripts/codegen/generate-artifacts-executor/generatePackageSwift.js.
 */

const fs = require('fs');
const path = require('path');

const HEADER_PRODUCTS = [
  'ReactHeaders',
  'ReactNativeHeaders',
  'ReactNativeDependenciesHeaders',
];
const SHIM_SOURCE =
  '// SwiftPM needs one source file per target. This target only vends headers.\n' +
  'int react_native_cocoapods_hybrid_headers_shim;\n';

function parseArgs(argv) {
  const index = argv.indexOf('--project-root');
  if (index === -1 || argv[index + 1] == null) {
    throw new Error('usage: cocoapods-hybrid.js --project-root <dir>');
  }
  return {projectRoot: path.resolve(argv[index + 1])};
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function swiftpmConfigOf(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) {
    return null;
  }
  const pkg = readJson(file);
  if (pkg.swiftpmConfig == null) {
    return null;
  }
  const config = pkg.swiftpmConfig;
  if (typeof config.name !== 'string' || config.name === '') {
    throw new Error(`${pkg.name}: swiftpmConfig.name must be a non-empty string`);
  }
  return {
    npmName: pkg.name,
    swiftName: config.name,
    dependencies: Array.isArray(config.dependencies) ? config.dependencies : [],
  };
}

/**
 * Autolinked dependencies that declare swiftpmConfig, plus the libraries they
 * name in swiftpmConfig.dependencies (resolved from the depending package, the
 * way Node would), transitively.
 */
function collectLibraries(autolinkingJson) {
  const byRoot = new Map();
  const queue = [];
  for (const dep of Object.values(autolinkingJson.dependencies ?? {})) {
    if (dep?.root != null && dep.platforms?.ios != null) {
      queue.push(fs.realpathSync(dep.root));
    }
  }
  while (queue.length > 0) {
    const root = queue.shift();
    if (byRoot.has(root)) {
      continue;
    }
    const config = swiftpmConfigOf(root);
    if (config == null) {
      continue;
    }
    byRoot.set(root, {...config, root});
    for (const name of config.dependencies) {
      const manifest = require.resolve(`${name}/package.json`, {paths: [root]});
      queue.push(fs.realpathSync(path.dirname(manifest)));
    }
  }
  const bySwiftName = new Map();
  for (const lib of byRoot.values()) {
    const clash = bySwiftName.get(lib.swiftName);
    if (clash != null) {
      throw new Error(
        `${lib.npmName} and ${clash.npmName} both use the Swift name ${lib.swiftName}`,
      );
    }
    bySwiftName.set(lib.swiftName, lib);
  }
  return [...bySwiftName.values()].sort((a, b) =>
    a.swiftName.localeCompare(b.swiftName),
  );
}

function ensureSymlink(target, link) {
  try {
    if (fs.readlinkSync(link) === target) {
      return;
    }
  } catch {}
  fs.rmSync(link, {recursive: true, force: true});
  fs.symlinkSync(target, link);
}

function linkLibraries(libsDir, libraries) {
  fs.mkdirSync(libsDir, {recursive: true});
  const wanted = new Set(libraries.map(lib => lib.swiftName));
  for (const entry of fs.readdirSync(libsDir)) {
    if (!wanted.has(entry)) {
      fs.rmSync(path.join(libsDir, entry), {recursive: true, force: true});
    }
  }
  // Keep links that already point at the right place: Xcode holds each one as a
  // loaded package root.
  for (const lib of libraries) {
    ensureSymlink(lib.root, path.join(libsDir, lib.swiftName));
  }
}

const HEADER_EXTENSIONS = new Set(['.h', '.hh', '.hpp', '.hxx', '.inc', '.ipp', '.tcc', '.def']);

/**
 * The extra header roots React Native's pods search, as `$(PODS_ROOT)/<dir>`:
 * third-party sources (boost, RCT-Folly, glog, fmt/include, ...) and private
 * header trees such as Headers/Private/Yoga. Read from the React pods'
 * xcconfigs, so the list follows whatever this React Native ships.
 */
function thirdPartyHeaderRoots(podsDir) {
  const supportDir = path.join(podsDir, 'Target Support Files');
  if (!fs.existsSync(supportDir)) {
    return [];
  }
  const roots = [];
  const pods = fs
    .readdirSync(supportDir)
    .filter(name => name === 'Yoga' || name.startsWith('React'))
    .sort();
  for (const pod of pods) {
    const xcconfig = path.join(supportDir, pod, `${pod}.debug.xcconfig`);
    if (!fs.existsSync(xcconfig)) {
      continue;
    }
    const line = fs
      .readFileSync(xcconfig, 'utf8')
      .split('\n')
      .find(l => l.startsWith('HEADER_SEARCH_PATHS'));
    if (line == null) {
      continue;
    }
    for (const match of line.matchAll(/\$[({]PODS_ROOT[)}]\/([^"\s]+)/g)) {
      const relative = match[1];
      if (relative.startsWith('Headers/Public') || relative.startsWith('..')) {
        continue;
      }
      const dir = path.join(podsDir, relative);
      if (fs.existsSync(dir) && !roots.includes(dir)) {
        roots.push(dir);
      }
    }
  }
  return roots;
}

/**
 * Builds one include directory that answers every `#include <...>` the pods
 * resolve through their search paths, the way the prebuilt header xcframeworks
 * lay them out:
 *
 *   1. Pods/Headers/Public/<Pod>/  `<React/...>`, `<jsi/jsi.h>`, `<react/...>`
 *   2. $(PODS_ROOT)/<dep>          `<boost/...>`, `<folly/...>`, `<glog/...>`
 *   3. Pods/Headers/Public/        `<RCTDeprecation/RCTDeprecation.h>`
 *
 * Files are relative symlinks and the first root to provide a path wins. Module
 * maps stay behind: these headers are consumed textually, as the pods do.
 */
function mirrorPodHeaders(podsDir, includeDir) {
  const publicHeadersDir = path.join(podsDir, 'Headers', 'Public');
  fs.rmSync(includeDir, {recursive: true, force: true});
  fs.mkdirSync(includeDir, {recursive: true});
  let count = 0;
  const walk = (sourceDir, destDir, headersOnly) => {
    for (const entry of fs.readdirSync(sourceDir, {withFileTypes: true})) {
      const source = path.join(sourceDir, entry.name);
      const dest = path.join(destDir, entry.name);
      let isDirectory = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        isDirectory = fs.statSync(source).isDirectory();
      }
      if (isDirectory) {
        walk(source, dest, headersOnly);
        continue;
      }
      if (entry.name.endsWith('.modulemap') || fs.existsSync(dest)) {
        continue;
      }
      if (headersOnly && !HEADER_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }
      fs.mkdirSync(destDir, {recursive: true});
      fs.symlinkSync(path.relative(destDir, fs.realpathSync(source)), dest);
      count++;
    }
  };
  if (fs.existsSync(publicHeadersDir)) {
    for (const pod of fs.readdirSync(publicHeadersDir).sort()) {
      const podDir = path.join(publicHeadersDir, pod);
      if (fs.statSync(podDir).isDirectory()) {
        walk(podDir, includeDir, false);
      }
    }
  }
  for (const root of thirdPartyHeaderRoots(podsDir)) {
    walk(root, includeDir, true);
  }
  if (fs.existsSync(publicHeadersDir)) {
    walk(publicHeadersDir, includeDir, false);
  }
  return count;
}

function writeIfChanged(file, contents) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === contents) {
    return;
  }
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
}

function writeReactNativePackage(xcframeworksDir, podsDir) {
  const targetDir = path.join(xcframeworksDir, 'CocoaPodsHeaders');
  const headerCount = mirrorPodHeaders(podsDir, path.join(targetDir, 'include'));
  writeIfChanged(path.join(targetDir, 'shim.c'), SHIM_SOURCE);
  // Without a module map of its own, SwiftPM would wrap the whole include
  // directory in one umbrella module, which cannot build. An empty module keeps
  // every header textual, as it is for the pods.
  writeIfChanged(
    path.join(targetDir, 'include', 'module.modulemap'),
    'module CocoaPodsHeaders {\n}\n',
  );
  const products = HEADER_PRODUCTS.map(
    name =>
      `        .library(name: "${name}", targets: ["CocoaPodsHeaders"]),`,
  ).join('\n');
  writeIfChanged(
    path.join(xcframeworksDir, 'Package.swift'),
    `// swift-tools-version: 6.0
// AUTO-GENERATED by scripts/spm/cocoapods-hybrid.js – do not edit manually.
//
// The \`ReactNative\` package SwiftPM libraries depend on. CocoaPods builds React
// Native from source here, so the three header products all serve the headers
// the pods installed, and the binaries come from the pods.

import PackageDescription

let package = Package(
    name: "ReactNative",
    platforms: [.iOS(.v15), .macCatalyst(.v13), .visionOS(.v1)],
    products: [
${products}
    ],
    targets: [
        .target(
            name: "CocoaPodsHeaders",
            path: "CocoaPodsHeaders",
            sources: ["shim.c"],
            publicHeadersPath: "include"
        ),
    ],
    cxxLanguageStandard: .cxx20
)
`,
  );
  return headerCount;
}

function writeAutolinkedPackage(packageDir, libsDir, libraries) {
  const relativeLibs = path.relative(packageDir, libsDir);
  const deps = libraries
    .map(
      lib =>
        `        .package(path: "${path.join(relativeLibs, lib.swiftName)}"),`,
    )
    .join('\n');
  const products = libraries
    .map(
      lib =>
        `                .product(name: "${lib.swiftName}", package: "${lib.swiftName}"),`,
    )
    .join('\n');
  writeIfChanged(
    path.join(packageDir, 'AutolinkedAggregate', 'shim.c'),
    '// SwiftPM needs one source file per target. This target only links the\n' +
      '// autolinked libraries into the app.\n' +
      'int react_native_cocoapods_hybrid_autolinked_shim;\n',
  );
  writeIfChanged(
    path.join(packageDir, 'AutolinkedAggregate', 'include', 'AutolinkedAggregate.h'),
    '// Intentionally empty: the aggregate exports no API of its own.\n',
  );
  writeIfChanged(
    path.join(packageDir, 'Package.swift'),
    `// swift-tools-version: 6.0
// AUTO-GENERATED by scripts/spm/cocoapods-hybrid.js – do not edit manually.
//
// Every library autolinked through SwiftPM in this CocoaPods app. The app target
// links the \`Autolinked\` product; CocoaPods links everything else.

import PackageDescription

let package = Package(
    name: "Autolinked",
    platforms: [.iOS(.v16), .visionOS(.v1)],
    products: [
        .library(name: "Autolinked", targets: ["AutolinkedAggregate"]),
    ],
    dependencies: [
${deps}
    ],
    targets: [
        .target(
            name: "AutolinkedAggregate",
            dependencies: [
${products}
            ],
            path: "AutolinkedAggregate",
            sources: ["shim.c"],
            publicHeadersPath: "include"
        ),
    ]
)
`,
  );
}

function main() {
  const {projectRoot} = parseArgs(process.argv.slice(2));
  const autolinkingDir = path.join(projectRoot, 'build', 'generated', 'autolinking');
  const autolinkingJson = readJson(path.join(autolinkingDir, 'autolinking.json'));
  const libraries = collectLibraries(autolinkingJson);
  const libsDir = path.join(autolinkingDir, 'libs');
  const packageDir = path.join(autolinkingDir, 'Autolinked');
  const resultFile = path.join(autolinkingDir, 'swiftpm-hybrid.json');

  linkLibraries(libsDir, libraries);
  if (libraries.length === 0) {
    fs.rmSync(packageDir, {recursive: true, force: true});
    writeIfChanged(resultFile, JSON.stringify({autolinkedPackageDir: null, packages: []}, null, 2) + '\n');
    console.log('[SPM] No SwiftPM-only libraries to link.');
    return;
  }

  const headerCount = writeReactNativePackage(
    path.join(projectRoot, 'build', 'xcframeworks'),
    path.join(projectRoot, 'Pods'),
  );
  writeAutolinkedPackage(packageDir, libsDir, libraries);
  writeIfChanged(
    resultFile,
    JSON.stringify(
      {
        autolinkedPackageDir: packageDir,
        packages: libraries.map(lib => ({
          name: lib.npmName,
          swiftName: lib.swiftName,
          root: lib.root,
        })),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `[SPM] Linking through SwiftPM: ${libraries
      .map(lib => `${lib.npmName} (${lib.swiftName})`)
      .join(', ')}`,
  );
  console.log(`[SPM] ReactNative header package: ${headerCount} headers from Pods`);
}

if (require.main === module) {
  main();
}

module.exports = {collectLibraries, mirrorPodHeaders, thirdPartyHeaderRoots};
