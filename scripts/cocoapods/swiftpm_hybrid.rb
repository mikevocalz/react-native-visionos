# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

require 'json'
require 'pathname'

# Links SwiftPM-only React Native libraries into a CocoaPods-built app.
#
# React Native 0.88 builds Swift packages such as Nitro V1 modules through `react-native spm`,
# which needs prebuilt React xcframeworks. None are published for visionOS, so this platform keeps
# building React Native from source with CocoaPods. A library whose package.json declares
# `swiftpmConfig` and ships only a metadata podspec is skipped by autolinking (see autolinking.rb)
# and linked here as a local Swift package instead:
#
# 1. scripts/spm/cocoapods-hybrid.js lays out the same tree `react-native spm` would:
#    build/generated/autolinking/libs/<SwiftName> for every library, and build/xcframeworks as the
#    `ReactNative` package. Here that package serves the headers CocoaPods installed, since the
#    binaries come from the pods.
# 2. It writes build/generated/autolinking/Autolinked, one package whose `Autolinked` product
#    depends on every library.
# 3. This file adds that package to the app project and links the product into every application
#    target that links the pods.
module SwiftPMHybrid
  PRODUCT_NAME = 'Autolinked'.freeze

  SOURCE_ATTRIBUTES = %w[
    source_files vendored_frameworks vendored_libraries resources resource_bundles
  ].freeze
  PLATFORM_KEYS = %w[ios osx tvos visionos watchos].freeze

  @roots = []

  def self.swiftpm_package?(root)
    return false if root.nil? || root.to_s.empty?

    package_json = File.join(root.to_s, 'package.json')
    return false unless File.exist?(package_json)

    JSON.parse(File.read(package_json)).key?('swiftpmConfig')
  rescue JSON::ParserError
    false
  end

  # True when the podspec, its subspecs and their per-platform sections declare nothing to build.
  def self.metadata_only?(spec)
    present = ->(value) { !value.nil? && !(value.respond_to?(:empty?) && value.empty?) }
    ([spec] + spec.recursive_subspecs).all? do |s|
      hash = s.attributes_hash
      sections = [hash] + PLATFORM_KEYS.map { |p| hash[p] }.select { |h| h.is_a?(Hash) }
      sections.none? { |section| SOURCE_ATTRIBUTES.any? { |key| present.call(section[key]) } }
    end
  end

  def self.swiftpm_only?(root, spec)
    swiftpm_package?(root) && metadata_only?(spec)
  end

  def self.register(root)
    @roots << root.to_s unless @roots.include?(root.to_s)
  end

  def self.roots
    @roots.dup
  end

  def self.apply(installer, react_native_path)
    installation_root = Pod::Config.instance.installation_root.to_s
    rn_root = File.expand_path(react_native_path, installation_root)
    script = File.join(rn_root, 'scripts', 'spm', 'cocoapods-hybrid.js')
    args = [script, '--project-root', installation_root]
    roots.each { |root| args.push('--package-root', root) }
    Pod::UI.puts Pod::Executable.execute_command('node', args, true)

    result_path = File.join(installation_root, 'build', 'generated', 'autolinking', 'swiftpm-hybrid.json')
    result = JSON.parse(File.read(result_path))
    package_dir = result['autolinkedPackageDir']

    installer.aggregate_targets.group_by(&:user_project).each do |user_project, aggregate_targets|
      next if user_project.nil?

      project_dir = Pathname.new(user_project.path.to_s).dirname
      relative = package_dir.nil? ? nil : Pathname.new(package_dir).relative_path_from(project_dir).to_s
      changed = remove_stale_reference(user_project, relative)

      unless relative.nil?
        reference = local_package_reference(user_project, relative)
        aggregate_targets.flat_map(&:user_targets).uniq.each do |target|
          next unless target.respond_to?(:product_type) &&
                      target.product_type == 'com.apple.product-type.application'

          changed = true if link_product(user_project, target, reference)
        end
      end

      user_project.save if changed
    end
  end

  def self.remove_stale_reference(project, keep_relative_path)
    marker = File.join('build', 'generated', 'autolinking', PRODUCT_NAME)
    stale = project.root_object.package_references.select do |ref|
      ref.is_a?(Xcodeproj::Project::Object::XCLocalSwiftPackageReference) &&
        ref.relative_path.to_s.end_with?(marker) &&
        ref.relative_path != keep_relative_path
    end
    return false if stale.empty?

    project.targets.each do |target|
      next unless target.respond_to?(:package_product_dependencies)

      target.package_product_dependencies.dup.each do |dep|
        next unless stale.include?(dep.package)

        target.frameworks_build_phase.files.dup.each do |file|
          file.remove_from_project if file.product_ref == dep
        end
        dep.remove_from_project
      end
    end
    stale.each(&:remove_from_project)
    true
  end

  def self.local_package_reference(project, relative_path)
    klass = Xcodeproj::Project::Object::XCLocalSwiftPackageReference
    existing = project.root_object.package_references.find do |ref|
      ref.is_a?(klass) && ref.relative_path == relative_path
    end
    return existing unless existing.nil?

    reference = project.new(klass)
    reference.relative_path = relative_path
    project.root_object.package_references << reference
    reference
  end

  def self.link_product(project, target, reference)
    klass = Xcodeproj::Project::Object::XCSwiftPackageProductDependency
    dependency = target.package_product_dependencies.find do |dep|
      dep.is_a?(klass) && dep.package == reference && dep.product_name == PRODUCT_NAME
    end
    changed = false
    if dependency.nil?
      dependency = project.new(klass)
      dependency.package = reference
      dependency.product_name = PRODUCT_NAME
      target.package_product_dependencies << dependency
      changed = true
    end

    unless target.frameworks_build_phase.files.any? { |file| file.product_ref == dependency }
      build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
      build_file.product_ref = dependency
      target.frameworks_build_phase.files << build_file
      changed = true
    end
    changed
  end
end
