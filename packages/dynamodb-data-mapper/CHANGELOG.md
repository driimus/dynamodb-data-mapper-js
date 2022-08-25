# Changelog

## 0.11.0

### Patch Changes

- Updated dependencies [[`ff7b292`](https://github.com/driimus/dynamodb-data-mapper-js/commit/ff7b2924f64a527f335ea8199d1d0f1e031928b1)]:
  - @driimus/dynamodb-expressions@0.11.0
  - @driimus/dynamodb-data-marshaller@0.11.0
  - @driimus/dynamodb-auto-marshaller@0.11.0
  - @driimus/dynamodb-batch-iterator@0.11.0
  - @driimus/dynamodb-query-iterator@0.11.0

## 0.10.1

### Patch Changes

- [`468b34f`](https://github.com/driimus/dynamodb-data-mapper-js/commit/468b34f4a61f3ce634cbaa99ec2c5beda708c779) Thanks [@driimus](https://github.com/driimus)! - chore: bump minimum aws sdk version

- Updated dependencies [[`468b34f`](https://github.com/driimus/dynamodb-data-mapper-js/commit/468b34f4a61f3ce634cbaa99ec2c5beda708c779)]:
  - @driimus/dynamodb-auto-marshaller@0.10.1
  - @driimus/dynamodb-batch-iterator@0.10.1
  - @driimus/dynamodb-data-marshaller@0.10.1
  - @driimus/dynamodb-expressions@0.10.1
  - @driimus/dynamodb-query-iterator@0.10.1

## 0.10.0

### Patch Changes

- Updated dependencies [[`a0febe2`](https://github.com/driimus/dynamodb-data-mapper-js/commit/a0febe2d5fd93d3629c509307e5007b72b8e0b2c)]:
  - @driimus/dynamodb-data-marshaller@0.10.0
  - @driimus/dynamodb-auto-marshaller@0.10.0
  - @driimus/dynamodb-batch-iterator@0.10.0
  - @driimus/dynamodb-expressions@0.10.0
  - @driimus/dynamodb-query-iterator@0.10.0

## 0.9.1

### Patch Changes

- [`3a57dc4`](https://github.com/driimus/dynamodb-data-mapper-js/commit/3a57dc4f8b2bef2cd0fa6a7d0d59fc2197e14418) Thanks [@driimus](https://github.com/driimus)! - chore: point to new repo

- Updated dependencies [[`3a57dc4`](https://github.com/driimus/dynamodb-data-mapper-js/commit/3a57dc4f8b2bef2cd0fa6a7d0d59fc2197e14418)]:
  - @driimus/dynamodb-auto-marshaller@0.9.1
  - @driimus/dynamodb-batch-iterator@0.9.1
  - @driimus/dynamodb-data-marshaller@0.9.1
  - @driimus/dynamodb-expressions@0.9.1
  - @driimus/dynamodb-query-iterator@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [[`4cf11cf`](https://github.com/driimus/dynamodb-data-mapper-js/commit/4cf11cf3722663273f9be7a7edd8119cb566a052), [`cb2f34b`](https://github.com/driimus/dynamodb-data-mapper-js/commit/cb2f34bfd217af6d97e3fd87362f7e7ff722522e)]:
  - @driimus/dynamodb-data-marshaller@0.9.0
  - @driimus/dynamodb-auto-marshaller@0.9.0
  - @driimus/dynamodb-expressions@0.9.0
  - @driimus/dynamodb-batch-iterator@0.9.0
  - @driimus/dynamodb-query-iterator@0.9.0

## 0.8.0

### Minor Changes

- [`f7cc6ff`](https://github.com/driimus/dynamodb-data-mapper-js/commit/f7cc6ff9fccbdc9d292877eefcd3bf24f30cba0b) Thanks [@driimus](https://github.com/driimus)! - migrate to aws-sdk-js v3

### Patch Changes

- Updated dependencies [[`f7cc6ff`](https://github.com/driimus/dynamodb-data-mapper-js/commit/f7cc6ff9fccbdc9d292877eefcd3bf24f30cba0b)]:
  - @driimus/dynamodb-auto-marshaller@0.8.0
  - @driimus/dynamodb-batch-iterator@0.8.0
  - @driimus/dynamodb-data-marshaller@0.8.0
  - @driimus/dynamodb-expressions@0.8.0
  - @driimus/dynamodb-query-iterator@0.8.0

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [0.7.3]

### Added

- Export query/scan/parallelScan iterator and paginator classes.

## [0.7.2]

### Fixed

- Sort key configurations in `CreateTableInput` so that hash keys always appear
  first.

## [0.7.1]

### Removed

- Remove package rollup at `./build/index.mjs` due to bundler incompatibilities.

## [0.7.0]

### Added

- Add a package rollup at `./build/index.mjs` to support tree shaking.

## [0.6.0]

### Fixed

- Update `query` and `scan` to serialize whatever key properties are provided
  without injecting any defaulted values.
- Update `DataMapper` for TypeScript 2.9 compatibility.

### Added

- Use purpose-built async iterable objects as the return value for `query`,
  `scan`, and `parallelScan`.
- Report the `count`, `scannedCount`, and `consumedCapacity` tallied over the
  lifetime of a `query`, `scan`, or `parallelScan` as properties on the
  returned iterable.
- Provide a method to get the underlying paginator for a `query`, `scan`, or
  `parallelScan` iterator. The paginator may be used to suspend and resume
  iteration at any page boundary.
- Add `limit` parameter to `scan` and `query` to automatically cease iteration
  once a certain number of items have been returned or the results have been
  exhausted, whichever comes first.

## [0.5.0]

### Fixed

- Add default message to `ItemNotFoundException`
- Ensure options provided are used when `query` is called with a named
  parameter bag.

### Added

- Add support for executing custom update expressions.

## [0.4.2]

### Fixed

- Ensure `query` and `scan` marshall exclusive start keys for the specified
  index.

## [0.4.1]

### Fixed

- Ensure `query` returns instances of the provided model class.

## [0.4.0]

### Added

- Add `createTable` to create tables based on table names and schemas bound to
  constructor prototypes
- Add `ensureTableExists` to create a table only if it does not already exist
- Add `deleteTable` to delete tables based on table names bound to constructor
  prototypes
- Add `ensureTableNotExists` to delete a table only if it is not already
  deleted

## [0.3.2]

### Fixed

- Only include expression name or value substitions when a substitution has
  occurred

## [0.3.1]

### Fixed

- Ensure retried writes in a `batchDelete`, `batchPut`, or `batchWrite` are
  only yielded once

## [0.3.0]

### Added

- Add `batchGet`, which allows a synchronous or asynchronous iterable of items
  (like those supplied to `get`) to be automatically grouped into
  `BatchGetItem` operations.
- Add `batchDelete`, which allows a synchronous or asynchronous iterable of
  items (like those supplied to `delete`) to be automatically grouped into
  `BatchWriteItem` operations.
- Add `batchPut`, which allows a synchronous or asynchronous iterable of
  items (like those supplied to `put`) to be automatically grouped into
  `BatchWriteItem` operations.
- Add `batchWrite`, which allows a synchronous or asynchronous iterable of
  tuples of tags (`'put'` or `'delete'`) and items (like those supplied to the
  `put` or `delete` methods, respectively) to be automatically grouped into
  `BatchWriteItem` operations.

## [0.2.1]

### Added

- Add the ability to call all DataMapper methods with positional rather than
  named parameters
- Add API documentation

### Deprecated

- Deprecate calling DataMapper methods with a single bag of named parameters

## [0.2.0]

### Removed

- **BREAKING CHANGE**: Removed the `returnValues` parameter from `put`. `put`
  will now always return the value that was persisted, thereby providing
  access to injected defaults and accurate version numbers.

### Added

- Add a `parallelScan` method to the DataMapper.
- Add optional parameters to the `scan` method to allow its use as a parallel
  scan worker
- Add a `pageSize` parameter to `query` and `scan` to limit the size of pages
  fetched during a read. `pageSize` was previously called `limit`.

### Changed

- Use TSLib instead of having TypeScript generate helpers to reduce bundle size

### Deprecated

- Deprecate `limit` parameter on `query` and `scan`. It has been renamed to
  `pageSize`, though a value provided for `limit` will still be used if no
  `pageSize` parameter is provided.

## [0.1.1]

### Fixed

- Update dependency version to match released version identifier

## [0.1.0]

Initial release
