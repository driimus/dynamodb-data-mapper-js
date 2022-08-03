---
sidebar_position: 1
---

# Installation

Configure Data Mapper for your project **in less than 5 minutes**.

## What you'll need

- [Node.js](https://nodejs.org/en/download/) version 14 or above:
  - When installing Node.js, you are recommended to tick all checkboxes related to dependencies.

## Getting Started

[The `@driimus/dynamodb-data-mapper` package](packages/dynamodb-data-mapper) provides
a simple way to persist and load an application's domain objects to and from
Amazon DynamoDB. The documentation covers all of the data mapper's constituent packages:

```sh
pnpm i @driimus/dynamodb-data-mapper
```

You can use it in conjunction with [`@driimus/dynamodb-data-mapper-annotations`](packages/dynamodb-data-mapper-annotations) to describe the relationship between a class and its representation in
DynamoDB by adding a few decorators.

```sh
pnpm i @driimus/dynamodb-data-mapper-annotations
```

### Building expressions without the Data Mapper

[The `@driimus/dynamodb-expressions` package](packages/dynamodb-data-mapper) has been updated to support expression building without marshalling attribute values. It comes with no extraneous dependencies, so feel free to plug whichever marshaller you feel like.

If you're looking for a minimal setup, you can use it with `@aws-sdk/lib-dynamodb`, which handles data marshalling under the hood:

```ts
import {
  ExpressionAttributes,
  serializeConditionExpression,
  equals,
  beginsWith,
} from '@driimus/dynamodb-expressions';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type QueryParams = {
  PK: string;
  SKPrefix: string;
};

async function query({ PK, SKPrefix }: QueryParams) {
  const attributes = new ExpressionAttributes();

  const KeyConditionExpression = serializeConditionExpression(
    {
      type: 'And',
      conditions: [
        { subject: 'PK', ...equals(PK) },
        { subject: 'SK', ...beginsWith(SKPrefix) },
      ],
    },
    attributes
  );

  return documentClient.send(
    new QueryCommand({
      TableName: 'my_table',
      KeyConditionExpression,
      ExpressionAttributeNames: attributes.names,
      ExpressionAttributeValues: attributes.values,
    })
  );
}
```
