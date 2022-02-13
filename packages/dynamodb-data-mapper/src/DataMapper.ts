import {
	AttributeDefinition,
	AttributeValue as _AttributeValue,
	CreateGlobalSecondaryIndexAction,
	CreateTableCommand,
	DeleteItemCommand,
	DeleteItemInput,
	DeleteTableCommand,
	DescribeTableCommand, DynamoDBClient, GetItemCommand,
	GetItemInput,
	GlobalSecondaryIndex,
	KeySchemaElement,
	LocalSecondaryIndex,
	Projection,
	ProvisionedThroughput,
	PutItemCommand,
	PutItemInput,
	UpdateItemCommand,
	UpdateItemInput,
	UpdateTableCommand,
	waitUntilTableExists,
	waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';
import {
	BatchGet,
	BatchWrite,
	PerTableOptions,
	TableOptions,
	WriteRequest,
} from '@aws/dynamodb-batch-iterator';
import {
	AttributeTypeMap,
	getSchemaName,
	isKey,
	keysFromSchema,
	KeyTypeMap,
	marshallConditionExpression,
	marshallItem,
	marshallKey,
	marshallUpdateExpression,
	marshallValue,
	PerIndexKeys,
	Schema,
	SchemaType,
	toSchemaName,
	unmarshallItem,
	ZeroArgumentsConstructor,
} from '@aws/dynamodb-data-marshaller';
import {
	AttributePath,
	AttributeValue,
	ConditionExpression,
	ConditionExpressionPredicate,
	ExpressionAttributes,
	FunctionExpression,
	MathematicalExpression,
	PathElement,
	serializeProjectionExpression,
	UpdateExpression,
} from '@aws/dynamodb-expressions';
import {BatchState} from './BatchState';
import {
	ReadConsistency,
	StringToAnyObjectMap,
	SyncOrAsyncIterable,
	VERSION,
	WriteType,
} from './constants';
import {ItemNotFoundException} from './ItemNotFoundException';
import {
	BatchGetOptions,
	BatchGetTableOptions,
	CreateTableOptions,
	DataMapperConfiguration,
	DeleteOptions,
	DeleteParameters,
	ExecuteUpdateExpressionOptions,
	GetOptions, ParallelScanOptions,
	ParallelScanWorkerOptions, PerIndexOptions,
	PutOptions, QueryOptions,
	QueryParameters,
	ScanOptions, SecondaryIndexProjection,
	UpdateOptions,
	UpdateParameters,
} from './namedParameters';
import {ParallelScanIterator} from './ParallelScanIterator';
import {DynamoDbTable, getSchema, getTableName} from './protocols';
import {QueryIterator} from './QueryIterator';
import {ScanIterator} from './ScanIterator';

export type LocalSecondaryIndexList = LocalSecondaryIndex[];
export type GlobalSecondaryIndexList = GlobalSecondaryIndex[];
export type AttributeMap = Record<string, _AttributeValue>;

/**
	* Object mapper for domain object interaction with DynamoDB.
	*
	* To use, define a schema that describes how an item is represented in a
	* DynamoDB table. This schema will be used to marshall a native JavaScript
	* object into its desired persisted form. Attributes present on the object
	* but not in the schema will be ignored.
	*/
export class DataMapper {
	private readonly client: DynamoDBClient;
	private readonly readConsistency: ReadConsistency;
	private readonly skipVersionCheck: boolean;
	private readonly tableNamePrefix: string;

	constructor({
		client,
		readConsistency = 'eventual',
		skipVersionCheck = false,
		tableNamePrefix = '',
	}: DataMapperConfiguration) {
		if (client.config) {
			client.config.customUserAgent = [
				['dynamodb-data-mapper-js', VERSION],
			];
		}

		this.client = client;
		this.readConsistency = readConsistency;
		this.skipVersionCheck = skipVersionCheck;
		this.tableNamePrefix = tableNamePrefix;
	}

	/**
					* Deletes items from DynamoDB in batches of 25 or fewer via one or more
					* BatchWriteItem operations. The items may be from any number of tables;
					* tables and schemas for each item are determined using the
					* {DynamoDbSchema} property and the {DynamoDbTable} property on defined on
					* each item supplied.
					*
					* This method will automatically retry any delete requests returned by
					* DynamoDB as unprocessed. Exponential backoff on unprocessed items is
					* employed on a per-table basis.
					*
					* @param items A synchronous or asynchronous iterable of items to delete.
					*/
	async * batchDelete<T extends StringToAnyObjectMap>(
		items: SyncOrAsyncIterable<T>,
	) {
		const iter = this.batchWrite(
			(async function * (): AsyncIterable<['delete', T]> {
				for await (const item of items) {
					yield ['delete', item];
				}
			})(),
		);

		for await (const written of iter) {
			yield written[1];
		}
	}

	/**
					* Retrieves items from DynamoDB in batches of 100 or fewer via one or more
					* BatchGetItem operations. The items may be from any number of tables;
					* tables and schemas for each item are determined using the
					* {DynamoDbSchema} property and the {DynamoDbTable} property on defined on
					* each item supplied.
					*
					* This method will automatically retry any get requests returned by
					* DynamoDB as unprocessed. Exponential backoff on unprocessed items is
					* employed on a per-table basis.
					*
					* @param items A synchronous or asynchronous iterable of items to get.
					*/
	async * batchGet<T extends StringToAnyObjectMap>(
		items: SyncOrAsyncIterable<T>,
		{
			readConsistency = this.readConsistency,
			perTableOptions = {},
		}: BatchGetOptions = {},
	) {
		const state: BatchState<T> = {};
		const options: PerTableOptions = {};

		const batch = new BatchGet(
			this.client,
			this.mapGetBatch(items, state, perTableOptions, options),
			{
				ConsistentRead: readConsistency === 'strong' ? true : undefined,
				PerTableOptions: options,
			},
		);

		for await (const [tableName, marshalled] of batch) {
			const {keyProperties, itemSchemata} = state[tableName];
			const {constructor, schema}
																= itemSchemata[itemIdentifier(marshalled, keyProperties)];
			yield unmarshallItem<T>(schema, marshalled, constructor);
		}
	}

	/**
					* Puts items into DynamoDB in batches of 25 or fewer via one or more
					* BatchWriteItem operations. The items may be from any number of tables;
					* tables and schemas for each item are determined using the
					* {DynamoDbSchema} property and the {DynamoDbTable} property on defined on
					* each item supplied.
					*
					* This method will automatically retry any put requests returned by
					* DynamoDB as unprocessed. Exponential backoff on unprocessed items is
					* employed on a per-table basis.
					*
					* @param items A synchronous or asynchronous iterable of items to put.
					*/
	async * batchPut<T extends StringToAnyObjectMap>(
		items: SyncOrAsyncIterable<T>,
	) {
		const generator: SyncOrAsyncIterable<[WriteType, T]> = isIterable(items)
			? (function * () {
				for (const item of items) {
					yield ['put', item] as [WriteType, T];
				}
			})()
			: (async function * () {
				for await (const item of items) {
					yield ['put', item] as [WriteType, T];
				}
			})();

		for await (const written of this.batchWrite(generator)) {
			yield written[1];
		}
	}

	/**
					* Puts or deletes items from DynamoDB in batches of 25 or fewer via one or
					* more BatchWriteItem operations. The items may belong to any number of
					* tables; tables and schemas for each item are determined using the
					* {DynamoDbSchema} property and the {DynamoDbTable} property on defined on
					* each item supplied.
					*
					* This method will automatically retry any write requests returned by
					* DynamoDB as unprocessed. Exponential backoff on unprocessed items is
					* employed on a per-table basis.
					*
					* @param items A synchronous or asynchronous iterable of tuples of the
					* string 'put'|'delete' and the item on which to perform the specified
					* write action.
					*/
	async * batchWrite<T extends StringToAnyObjectMap>(
		items: SyncOrAsyncIterable<[WriteType, T]>,
	): AsyncIterableIterator<[WriteType, T]> {
		const state: BatchState<T> = {};
		const batch = new BatchWrite(
			this.client,
			this.mapWriteBatch(items, state),
		);

		for await (const [tableName, {DeleteRequest, PutRequest}] of batch) {
			const {keyProperties, itemSchemata} = state[tableName];
			const attributes = PutRequest
				? PutRequest.Item
				: DeleteRequest?.Key ?? {};
			const {constructor, schema}
																= itemSchemata[itemIdentifier(attributes!, keyProperties)];

			yield [
				PutRequest ? 'put' : 'delete',
				unmarshallItem<T>(schema, attributes!, constructor),
			];
		}
	}

	/**
					* Perform a CreateTable operation using the schema accessible via the
					* {DynamoDbSchema} property and the table name accessible via the
					* {DynamoDbTable} property on the prototype of the constructor supplied.
					*
					* The promise returned by this method will not resolve until the table is
					* active and ready for use.
					*
					* @param valueConstructor  The constructor used for values in the table.
					* @param options           Options to configure the CreateTable operation
					*/
	async createTable(
		valueConstructor: ZeroArgumentsConstructor<any>,
		options: CreateTableOptions,
	) {
		const schema = getSchema(valueConstructor.prototype);
		const {attributes, indexKeys, tableKeys} = keysFromSchema(schema);
		const TableName = this.getTableName(valueConstructor.prototype);

		let throughput: {ProvisionedThroughput?: ProvisionedThroughput} = {};
		if (options.billingMode !== 'PAY_PER_REQUEST') {
			throughput = {
				...provisionedThroughput(
					options.readCapacityUnits,
					options.writeCapacityUnits,
				),
			};
		}

		const {
			streamViewType = 'NONE',
			indexOptions = {},
			billingMode,
			sseSpecification,
		} = options;

		const {
			TableDescription: {TableStatus} = {TableStatus: 'CREATING'},
		} = await this.client.send(
			new CreateTableCommand({
				...indexDefinitions(indexKeys, indexOptions, schema),
				TableName,
				...throughput,
				BillingMode: billingMode,
				AttributeDefinitions: attributeDefinitionList(attributes),
				KeySchema: keyTypesToElementList(tableKeys),
				StreamSpecification:
				streamViewType === 'NONE'
					? {StreamEnabled: false}
					: {
						StreamEnabled: true,
						StreamViewType: streamViewType,
					},
				SSESpecification: sseSpecification
					? {
						Enabled: true,
						SSEType: sseSpecification.sseType,
						KMSMasterKeyId: sseSpecification.kmsMasterKeyId,
					}
					: {Enabled: false},
			}),
		);

		if (TableStatus !== 'ACTIVE') {
			await waitUntilTableExists(
				{client: this.client, maxWaitTime: 60},
				{TableName},
			);
		}
	}

	/**
					* Perform a UpdateTable operation using the schema accessible via the
					* {DynamoDbSchema} property, the table name accessible via the
					* {DynamoDbTable} property on the prototype of the constructor supplied,
					* and the specified global secondary index name.
					*
					* The promise returned by this method will not resolve until the table is
					* active and ready for use.
					*
					* @param valueConstructor  The constructor used for values in the table.
					* @param options           Options to configure the UpdateTable operation
					*/
	async createGlobalSecondaryIndex(
		valueConstructor: ZeroArgumentsConstructor<any>,
		indexName: string,
		{indexOptions = {}}: CreateTableOptions,
	) {
		const schema = getSchema(valueConstructor.prototype);
		const {attributes, indexKeys} = keysFromSchema(schema);
		const TableName = this.getTableName(valueConstructor.prototype);

		const globalSecondaryIndexes = indexDefinitions(
			indexKeys,
			indexOptions,
			schema,
		).GlobalSecondaryIndexes;
		const indexSearch
			= globalSecondaryIndexes === undefined ? [] : globalSecondaryIndexes.filter(index => index.IndexName === indexName);
		const indexDefinition: CreateGlobalSecondaryIndexAction
												= indexSearch[0];

		const {
			TableDescription: {TableStatus} = {TableStatus: 'UPDATING'},
		} = await this.client.send(
			new UpdateTableCommand({
				GlobalSecondaryIndexUpdates: [
					{
						Create: {
							...indexDefinition,
						},
					},
				],
				TableName,
				AttributeDefinitions: attributeDefinitionList(attributes),
			}),
		);

		if (TableStatus !== 'ACTIVE') {
			await waitUntilTableExists(
				{client: this.client, maxWaitTime: 60},
				{TableName},
			);
		}
	}

	/**
					* If the index does not already exist, perform a UpdateTable operation
					* using the schema accessible via the {DynamoDbSchema} property, the
					* table name accessible via the {DynamoDbTable} property on the prototype
					* of the constructor supplied, and the index name.
					*
					* The promise returned by this method will not resolve until the table is
					* active and ready for use. Note that the index will not be usable for queries
					* until it has finished backfilling
					*
					* @param valueConstructor  The constructor used for values in the table.
					* @param options           Options to configure the UpdateTable operation
					*/
	async ensureGlobalSecondaryIndexExists(
		valueConstructor: ZeroArgumentsConstructor<any>,
		indexName: string,
		options: CreateTableOptions,
	) {
		const TableName = this.getTableName(valueConstructor.prototype);
		// Try {
		const {
			Table: {GlobalSecondaryIndexes} = {
				GlobalSecondaryIndexes: [],
			},
		} = await this.client.send(new DescribeTableCommand({TableName}));
		const indexSearch
			= GlobalSecondaryIndexes === undefined
				? []
				: GlobalSecondaryIndexes.filter(index => index.IndexName === indexName);
		if (indexSearch.length === 0) {
			await this.createGlobalSecondaryIndex(
				valueConstructor,
				indexName,
				options,
			);
		}
		// } catch (error) {
		// 	throw error;
		// }
	}

	/**
					* Perform a DeleteItem operation using the schema accessible via the
					* {DynamoDbSchema} property and the table name accessible via the
					* {DynamoDbTable} property on the item supplied.
					*
					* @param item      The item to delete
					* @param options   Options to configure the DeleteItem operation
					*/
	delete<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		item: T,
		options?: DeleteOptions
	): Promise<T | undefined>;

	async delete<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		itemOrParameters: T | DeleteParameters<T>,
		options: DeleteOptions = {},
	): Promise<T | undefined> {
		let item: T;
		if (
			'item' in itemOrParameters
												&& (itemOrParameters as any).item[DynamoDbTable]
		) {
			item = (itemOrParameters as DeleteParameters<T>).item;
			options = itemOrParameters as DeleteParameters<T>;
		} else {
			item = itemOrParameters as T;
		}

		let {
			condition,
			returnValues = 'ALL_OLD',
			skipVersionCheck = this.skipVersionCheck,
		} = options;

		const schema = getSchema(item);

		const request: DeleteItemInput = {
			TableName: this.getTableName(item),
			Key: marshallKey(schema, item),
			ReturnValues: returnValues,
		};

		if (!skipVersionCheck) {
			for (const prop of Object.keys(schema)) {
				const inputMember = item[prop];
				const fieldSchema = schema[prop];

				if (
					isVersionAttribute(fieldSchema)
																				&& inputMember !== undefined
				) {
					const {condition: versionCondition}
																								= handleVersionAttribute(prop, inputMember);

					condition = condition
						? {
							type: 'And',
							conditions: [condition, versionCondition],
						}
						: versionCondition;
				}
			}
		}

		if (condition) {
			const attributes = new ExpressionAttributes();
			request.ConditionExpression = marshallConditionExpression(
				condition,
				schema,
				attributes,
			).expression;

			if (Object.keys(attributes.names).length > 0) {
				request.ExpressionAttributeNames = attributes.names;
			}

			if (Object.keys(attributes.values).length > 0) {
				request.ExpressionAttributeValues = attributes.values;
			}
		}

		const {Attributes} = await this.client.send(
			new DeleteItemCommand(request),
		);
		if (Attributes) {
			return unmarshallItem<T>(
				schema,
				Attributes,
				item.constructor as ZeroArgumentsConstructor<T>,
			);
		}
	}

	/**
					* Perform a DeleteTable operation using the schema accessible via the
					* {DynamoDbSchema} property and the table name accessible via the
					* {DynamoDbTable} property on the prototype of the constructor supplied.
					*
					* The promise returned by this method will not resolve until the table is
					* deleted and can no longer be used.
					*
					* @param valueConstructor  The constructor used for values in the table.
					*/
	async deleteTable(valueConstructor: ZeroArgumentsConstructor<any>) {
		const TableName = this.getTableName(valueConstructor.prototype);
		await this.client.send(new DeleteTableCommand({TableName}));
		await waitUntilTableNotExists(
			{client: this.client, maxWaitTime: 60},
			{TableName},
		);
	}

	/**
					* If the table does not already exist, perform a CreateTable operation
					* using the schema accessible via the {DynamoDbSchema} property and the
					* table name accessible via the {DynamoDbTable} property on the prototype
					* of the constructor supplied.
					*
					* The promise returned by this method will not resolve until the table is
					* active and ready for use.
					*
					* @param valueConstructor  The constructor used for values in the table.
					* @param options           Options to configure the CreateTable operation
					*/
	async ensureTableExists(
		valueConstructor: ZeroArgumentsConstructor<any>,
		options: CreateTableOptions,
	) {
		const TableName = this.getTableName(valueConstructor.prototype);
		try {
			const {Table: {TableStatus} = {TableStatus: 'CREATING'}}
																= await this.client.send(new DescribeTableCommand({TableName}));

			if (TableStatus !== 'ACTIVE') {
				await waitUntilTableExists(
					{client: this.client, maxWaitTime: 60},
					{TableName},
				);
			}
		} catch (error) {
			if (
				error instanceof Error
																&& error.name === 'ResourceNotFoundException'
			) {
				await this.createTable(valueConstructor, options);
			} else {
				throw error;
			}
		}
	}

	/**
					* If the table exists, perform a DeleteTable operation using the schema
					* accessible via the {DynamoDbSchema} property and the table name
					* accessible via the {DynamoDbTable} property on the prototype of the
					* constructor supplied.
					*
					* The promise returned by this method will not resolve until the table is
					* deleted and can no longer be used.
					*
					* @param valueConstructor  The constructor used for values in the table.
					*/
	async ensureTableNotExists(
		valueConstructor: ZeroArgumentsConstructor<any>,
	) {
		const TableName = this.getTableName(valueConstructor.prototype);
		try {
			const {
				Table: {TableStatus: status} = {TableStatus: 'CREATING'},
			} = await this.client.send(new DescribeTableCommand({TableName}));

			if (status === 'DELETING') {
				await waitUntilTableNotExists(
					{
						client: this.client,
						maxWaitTime: 60,
					},
					{TableName},
				);
				return;
			}

			if (status === 'CREATING' || status === 'UPDATING') {
				await waitUntilTableExists(
					{
						client: this.client,
						maxWaitTime: 60,
					},
					{TableName},
				);
			}

			await this.deleteTable(valueConstructor);
		} catch (error) {
			if (
				error instanceof Error
																&& error.name !== 'ResourceNotFoundException'
			) {
				throw error;
			}
		}
	}

	/**
					* Perform a GetItem operation using the schema accessible via the
					* {DynamoDbSchema} method and the table name accessible via the
					* {DynamoDbTable} method on the item supplied.
					*
					* @param item      The item to get
					* @param options   Options to configure the GetItem operation
					*/
	get<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		item: T,
		options?: GetOptions
	): Promise<T>;

	async get<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		item: T,
		options: GetOptions = {},
	): Promise<T | undefined> {
		const {projection, readConsistency = this.readConsistency} = options;

		const schema = getSchema(item);
		const request: GetItemInput = {
			TableName: this.getTableName(item),
			Key: marshallKey(schema, item),
		};

		if (readConsistency === 'strong') {
			request.ConsistentRead = true;
		}

		if (projection) {
			const attributes = new ExpressionAttributes();
			request.ProjectionExpression = serializeProjectionExpression(
				projection.map(propName => toSchemaName(propName, schema)),
				attributes,
			);

			if (Object.keys(attributes.names).length > 0) {
				request.ExpressionAttributeNames = attributes.names;
			}
		}

		const {Item} = await this.client.send(new GetItemCommand(request));
		if (Item) {
			return unmarshallItem<T>(
				schema,
				Item,
				item.constructor as ZeroArgumentsConstructor<T>,
			);
		}

		throw new ItemNotFoundException(request);
	}

	/**
					* Perform a Scan operation using the schema accessible via the
					* {DynamoDbSchema} method and the table name accessible via the
					* {DynamoDbTable} method on the prototype of the constructor supplied.
					*
					* This scan will be performed by multiple parallel workers, each of which
					* will perform a sequential scan of a segment of the table or index. Use
					* the `segments` parameter to specify the number of workers to be used.
					*
					* @param valueConstructor  The constructor to be used for each item
					*                          returned by the scan
					* @param segments          The number of parallel workers to use to perform
					*                          the scan
					* @param options           Options to configure the Scan operation
					*
					* @return An asynchronous iterator that yields scan results. Intended
					* to be consumed with a `for await ... of` loop.
					*/
	parallelScan<T extends StringToAnyObjectMap>(
		valueConstructor: ZeroArgumentsConstructor<T>,
		segments: number,
		options?: ParallelScanOptions
	): ParallelScanIterator<T>;

	parallelScan<T extends StringToAnyObjectMap>(
		ctorOrParameters: ZeroArgumentsConstructor<T>,
		segments: number,
		options: ParallelScanOptions = {},
	): ParallelScanIterator<T> {
		return new ParallelScanIterator(
			this.client,
			ctorOrParameters,
			segments,
			{
				readConsistency: this.readConsistency,
				...options,
				tableNamePrefix: this.tableNamePrefix,
			},
		);
	}

	/**
					* Perform a PutItem operation using the schema accessible via the
					* {DynamoDbSchema} method and the table name accessible via the
					* {DynamoDbTable} method on the item supplied.
					*
					* @param item      The item to save to DynamoDB
					* @param options   Options to configure the PutItem operation
					*/
	put<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		item: T,
		options?: PutOptions
	): Promise<T>;

	async put<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		item: T,
		options: PutOptions = {},
	): Promise<T> {
		let {condition, skipVersionCheck = this.skipVersionCheck} = options;

		const schema = getSchema(item);
		const request: PutItemInput = {
			TableName: this.getTableName(item),
			Item: marshallItem(schema, item),
		};

		if (!skipVersionCheck) {
			for (const key of Object.keys(schema)) {
				const inputMember = item[key];
				const fieldSchema = schema[key];
				const {attributeName = key} = fieldSchema;

				if (isVersionAttribute(fieldSchema)) {
					const {condition: versionCond} = handleVersionAttribute(
						key,
						inputMember,
					);
					if (request.Item![attributeName]) {
						request.Item![attributeName].N = (
							Number(request.Item![attributeName].N) + 1
						).toString();
					} else {
						request.Item![attributeName] = {N: '0'};
					}

					condition = condition
						? {type: 'And', conditions: [condition, versionCond]}
						: versionCond;
				}
			}
		}

		if (condition) {
			const attributes = new ExpressionAttributes();
			request.ConditionExpression = marshallConditionExpression(
				condition,
				schema,
				attributes,
			).expression;

			if (Object.keys(attributes.names).length > 0) {
				request.ExpressionAttributeNames = attributes.names;
			}

			if (Object.keys(attributes.values).length > 0) {
				request.ExpressionAttributeValues = attributes.values;
			}
		}

		await this.client.send(new PutItemCommand(request));

		return unmarshallItem<T>(
			schema,
			request.Item!,
			item.constructor as ZeroArgumentsConstructor<T>,
		);
	}

	/**
					* Perform a Query operation using the schema accessible via the
					* {DynamoDbSchema} method and the table name accessible via the
					* {DynamoDbTable} method on the prototype of the constructor supplied.
					*
					* @param valueConstructor  The constructor to use for each query result.
					* @param keyCondition      A condition identifying a particular hash key
					*                          value.
					* @param options           Additional options for customizing the Query
					*                          operation
					*
					* @return An asynchronous iterator that yields query results. Intended
					* to be consumed with a `for await ... of` loop.
					*/
	query<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		valueConstructor: ZeroArgumentsConstructor<T>,
		keyCondition:
		| ConditionExpression
		| Record<string, ConditionExpressionPredicate | any>,
		options?: QueryOptions
	): QueryIterator<T>;

	query<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		valueConstructorOrParameters:
		| ZeroArgumentsConstructor<T>
		| QueryParameters<T>,
		keyCondition?:
		| ConditionExpression
		| Record<string, ConditionExpressionPredicate | any>,
		options: QueryOptions = {},
	) {
		let valueConstructor: ZeroArgumentsConstructor<T>;
		if (keyCondition) {
			valueConstructor = valueConstructorOrParameters as ZeroArgumentsConstructor<T>;
		} else {
			valueConstructor = (
				valueConstructorOrParameters as QueryParameters<T>
			).valueConstructor;
			keyCondition = (valueConstructorOrParameters as QueryParameters<T>)
				.keyCondition;
			options = valueConstructorOrParameters as QueryParameters<T>;
		}

		return new QueryIterator(this.client, valueConstructor, keyCondition, {
			readConsistency: this.readConsistency,
			...options,
			tableNamePrefix: this.tableNamePrefix,
		});
	}

	/**
					* Perform a Scan operation using the schema accessible via the
					* {DynamoDbSchema} method and the table name accessible via the
					* {DynamoDbTable} method on the prototype of the constructor supplied.
					*
					* @param valueConstructor  The constructor to use for each item returned by
					*                          the Scan operation.
					* @param options           Additional options for customizing the Scan
					*                          operation
					*
					* @return An asynchronous iterator that yields scan results. Intended
					* to be consumed with a `for await ... of` loop.
					*/
	scan<T extends StringToAnyObjectMap>(
		valueConstructor: ZeroArgumentsConstructor<T>,
		options?: ScanOptions | ParallelScanWorkerOptions
	): ScanIterator<T>;

	scan<T extends StringToAnyObjectMap>(
		valueConstructor: ZeroArgumentsConstructor<T>,
		options: ScanOptions | ParallelScanWorkerOptions = {},
	): ScanIterator<T> {
		return new ScanIterator(this.client, valueConstructor, {
			readConsistency: this.readConsistency,
			...options,
			tableNamePrefix: this.tableNamePrefix,
		});
	}

	/**
					* Perform an UpdateItem operation using the schema accessible via the
					* {DynamoDbSchema} method and the table name accessible via the
					* {DynamoDbTable} method on the item supplied.
					*
					* @param item      The item to save to DynamoDB
					* @param options   Options to configure the UpdateItem operation
					*/
	update<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		item: T,
		options?: UpdateOptions
	): Promise<T>;

	async update<T extends StringToAnyObjectMap = StringToAnyObjectMap>(
		itemOrParameters: T | UpdateParameters<T>,
		options: UpdateOptions = {},
	): Promise<T> {
		let item: T;
		if (
			'item' in itemOrParameters
												&& (itemOrParameters as any).item[DynamoDbTable]
		) {
			item = (itemOrParameters as UpdateParameters<T>).item;
			options = itemOrParameters as UpdateParameters<T>;
		} else {
			item = itemOrParameters as T;
		}

		let {
			condition,
			onMissing = 'remove',
			skipVersionCheck = this.skipVersionCheck,
		} = options;

		const schema = getSchema(item);
		const expr = new UpdateExpression();
		const itemKey: Record<string, any> = {};

		for (const key of Object.keys(schema)) {
			const inputMember = item[key];
			const fieldSchema = schema[key];

			if (isKey(fieldSchema)) {
				itemKey[key] = inputMember;
			} else if (isVersionAttribute(fieldSchema)) {
				const {condition: versionCond, value}
																				= handleVersionAttribute(key, inputMember);
				expr.set(key, value);

				if (!skipVersionCheck) {
					condition = condition
						? {type: 'And', conditions: [condition, versionCond]}
						: versionCond;
				}
			} else if (inputMember === undefined) {
				if (onMissing === 'remove') {
					expr.remove(key);
				}
			} else {
				const marshalled = marshallValue(fieldSchema, inputMember);
				if (marshalled) {
					expr.set(key, new AttributeValue(marshalled));
				}
			}
		}

		return this.doExecuteUpdateExpression(
			expr,
			itemKey,
			getSchema(item),
			getTableName(item),
			item.constructor as ZeroArgumentsConstructor<T>,
			{condition},
		);
	}

	/**
					* Execute a custom update expression using the schema and table name
					* defined on the provided `valueConstructor`.
					*
					* This method does not support automatic version checking, as the current
					* state of a table's version attribute cannot be inferred from an update
					* expression object. To perform a version check manually, add a condition
					* expression:
					*
					* ```typescript
					*  const currentVersion = 1;
					*  updateExpression.set('nameOfVersionAttribute', currentVersion + 1);
					*  const condition = {
					*      type: 'Equals',
					*      subject: 'nameOfVersionAttribute',
					*      object: currentVersion
					*  };
					*
					*  const updated = await mapper.executeUpdateExpression(
					*      updateExpression,
					*      itemKey,
					*      constructor,
					*      {condition}
					*  );
					* ```
					*
					* **NB:** Property names and attribute paths in the update expression
					* should reflect the names used in the schema.
					*
					* @param expression        The update expression to execute.
					* @param key               The full key to identify the object being
					*                          updated.
					* @param valueConstructor  The constructor with which to map the result to
					*                          a domain object.
					* @param options           Options with which to customize the UpdateItem
					*                          request.
					*
					* @returns The updated item.
					*/
	async executeUpdateExpression<
		T extends StringToAnyObjectMap = StringToAnyObjectMap,
	>(
		expression: UpdateExpression,
		key: Record<string, any>,
		valueConstructor: ZeroArgumentsConstructor<T>,
		options: ExecuteUpdateExpressionOptions = {},
	): Promise<T> {
		return this.doExecuteUpdateExpression(
			expression,
			key,
			getSchema(valueConstructor.prototype),
			getTableName(valueConstructor.prototype),
			valueConstructor,
			options,
		);
	}

	private async doExecuteUpdateExpression<
		T extends StringToAnyObjectMap = StringToAnyObjectMap,
	>(
		expression: UpdateExpression,
		key: Record<string, any>,
		schema: Schema,
		tableName: string,
		valueConstructor?: ZeroArgumentsConstructor<T>,
		options: ExecuteUpdateExpressionOptions = {},
	): Promise<T> {
		const request: UpdateItemInput = {
			TableName: this.tableNamePrefix + tableName,
			ReturnValues: 'ALL_NEW',
			Key: marshallKey(schema, key),
		};

		const attributes = new ExpressionAttributes();

		if (options.condition) {
			request.ConditionExpression = marshallConditionExpression(
				options.condition,
				schema,
				attributes,
			).expression;
		}

		request.UpdateExpression = marshallUpdateExpression(
			expression,
			schema,
			attributes,
		).expression;

		if (Object.keys(attributes.names).length > 0) {
			request.ExpressionAttributeNames = attributes.names;
		}

		if (Object.keys(attributes.values).length > 0) {
			request.ExpressionAttributeValues = attributes.values;
		}

		const rawResponse = await this.client.send(new UpdateItemCommand(request));
		if (rawResponse.Attributes) {
			return unmarshallItem<T>(
				schema,
				rawResponse.Attributes,
				valueConstructor,
			);
		}

		// This branch should not be reached when interacting with DynamoDB, as
		// the ReturnValues parameter is hardcoded to 'ALL_NEW' above. It is,
		// however, allowed by the service model and may therefore occur in
		// certain unforeseen conditions; to be safe, this case should be
		// converted into an error unless a compelling reason to return
		// undefined or an empty object presents itself.
		throw new Error(
			'Update operation completed successfully, but the updated value was not returned',
		);
	}

	private getTableName(item: StringToAnyObjectMap): string {
		return getTableName(item, this.tableNamePrefix);
	}

	private async * mapGetBatch<T extends StringToAnyObjectMap>(
		items: SyncOrAsyncIterable<T>,
		state: BatchState<T>,
		options: Record<string, BatchGetTableOptions>,
		convertedOptions: PerTableOptions,
	): AsyncIterableIterator<[string, AttributeMap]> {
		for await (const item of items) {
			const unprefixed = getTableName(item);
			const tableName = this.tableNamePrefix + unprefixed;
			const schema = getSchema(item);

			if (unprefixed in options && !(tableName in convertedOptions)) {
				convertedOptions[tableName] = convertBatchGetOptions(
					options[unprefixed],
					schema,
				);
			}

			if (!(tableName in state)) {
				state[tableName] = {
					keyProperties: getKeyProperties(schema),
					itemSchemata: {},
				};
			}

			const {keyProperties, itemSchemata} = state[tableName];
			const marshalled = marshallKey(schema, item);
			itemSchemata[itemIdentifier(marshalled, keyProperties)] = {
				constructor: item.constructor as ZeroArgumentsConstructor<T>,
				schema,
			};

			yield [tableName, marshalled];
		}
	}

	private async * mapWriteBatch<T extends StringToAnyObjectMap>(
		items: SyncOrAsyncIterable<[WriteType, T]>,
		state: BatchState<T>,
	): AsyncIterableIterator<[string, WriteRequest]> {
		for await (const [type, item] of items) {
			const unprefixed = getTableName(item);
			const tableName = this.tableNamePrefix + unprefixed;
			const schema = getSchema(item);

			if (!(tableName in state)) {
				state[tableName] = {
					keyProperties: getKeyProperties(schema),
					itemSchemata: {},
				};
			}

			const {keyProperties, itemSchemata} = state[tableName];
			const attributes
																= type === 'delete'
																	? marshallKey(schema, item)
																	: marshallItem(schema, item);
			const marshalled
																= type === 'delete'
																	? {DeleteRequest: {Key: attributes}}
																	: {PutRequest: {Item: attributes}};
			itemSchemata[itemIdentifier(attributes, keyProperties)] = {
				constructor: item.constructor as ZeroArgumentsConstructor<T>,
				schema,
			};

			yield [tableName, marshalled];
		}
	}
}

function attributeDefinitionList(
	attributes: AttributeTypeMap,
): AttributeDefinition[] {
	return Object.keys(attributes).map(name => ({
		AttributeName: name,
		AttributeType: attributes[name],
	}));
}

function convertBatchGetOptions(
	options: BatchGetTableOptions,
	itemSchema: Schema,
): TableOptions {
	const out: TableOptions = {};

	if (options.readConsistency === 'strong') {
		out.ConsistentRead = true;
	}

	if (options.projection) {
		const attributes = new ExpressionAttributes();
		out.ProjectionExpression = serializeProjectionExpression(
			options.projection.map(propName =>
				toSchemaName(propName, options.projectionSchema ?? itemSchema),
			),
			attributes,
		);
		out.ExpressionAttributeNames = attributes.names;
	}

	return out;
}

function getKeyProperties(schema: Schema): string[] {
	const keys: string[] = [];
	for (const property of Object.keys(schema).sort()) {
		const fieldSchema = schema[property];
		if (isKey(fieldSchema)) {
			keys.push(fieldSchema.attributeName ?? property);
		}
	}

	return keys;
}

function handleVersionAttribute(
	attributeName: string,
	inputMember: any,
): {
		condition: ConditionExpression;
		value: MathematicalExpression | AttributeValue;
	} {
	let condition: ConditionExpression;
	let value: any;
	if (inputMember === undefined) {
		condition = new FunctionExpression(
			'attribute_not_exists',
			new AttributePath([
				{type: 'AttributeName', name: attributeName} as PathElement,
			]),
		);
		value = 0;
	} else {
		condition = {
			type: 'Equals',
			subject: attributeName,
			object: inputMember,
		};
		value = new MathematicalExpression(
			new AttributePath(attributeName),
			'+',
			1,
		);
	}

	return {condition, value};
}

function indexDefinitions(
	keys: PerIndexKeys,
	options: PerIndexOptions,
	schema: Schema,
): {
		GlobalSecondaryIndexes?: GlobalSecondaryIndexList;
		LocalSecondaryIndexes?: LocalSecondaryIndexList;
	} {
	const globalIndices: GlobalSecondaryIndexList = [];
	const localIndices: LocalSecondaryIndexList = [];

	for (const IndexName of Object.keys(keys)) {
		const KeySchema = keyTypesToElementList(keys[IndexName]);
		const indexOptions = options[IndexName];
		if (!indexOptions) {
			throw new Error(`No options provided for ${IndexName} index`);
		}

		const indexInfo = {
			IndexName,
			KeySchema,
			Projection: indexProjection(schema, indexOptions.projection),
		};
		if (indexOptions.type === 'local') {
			localIndices.push(indexInfo);
		} else {
			globalIndices.push({
				...indexInfo,
				...provisionedThroughput(
					indexOptions.readCapacityUnits,
					indexOptions.writeCapacityUnits,
				),
			});
		}
	}

	return {
		GlobalSecondaryIndexes: globalIndices.length > 0 ? globalIndices : undefined,
		LocalSecondaryIndexes: localIndices.length > 0 ? localIndices : undefined,
	};
}

function indexProjection(
	schema: Schema,
	projection: SecondaryIndexProjection,
): Projection {
	if (typeof projection === 'string') {
		return {
			ProjectionType: projection === 'all' ? 'ALL' : 'KEYS_ONLY',
		};
	}

	return {
		ProjectionType: 'INCLUDE',
		NonKeyAttributes: projection.map(propName =>
			getSchemaName(propName, schema),
		),
	};
}

function isIterable<T>(arg: any): arg is Iterable<T> {
	return Boolean(arg) && typeof arg[Symbol.iterator] === 'function';
}

function isVersionAttribute(fieldSchema: SchemaType): boolean {
	return (
		fieldSchema.type === 'Number' && Boolean(fieldSchema.versionAttribute)
	);
}

function itemIdentifier(
	marshalled: AttributeMap,
	keyProperties: string[],
): string {
	const keyAttributes: string[] = [];
	for (const key of keyProperties) {
		const value = marshalled[key];
		keyAttributes.push(`${key}=${value.B ?? value.N ?? value.S}`);
	}

	return keyAttributes.join(':');
}

function keyTypesToElementList(keys: KeyTypeMap): KeySchemaElement[] {
	const elementList = Object.keys(keys).map(name => ({
		AttributeName: name,
		KeyType: keys[name],
	}));

	elementList.sort((a, b) => {
		if (a.KeyType === 'HASH' && b.KeyType !== 'HASH') {
			return -1;
		}

		if (a.KeyType !== 'HASH' && b.KeyType === 'HASH') {
			return 1;
		}

		return 0;
	});

	return elementList;
}

function provisionedThroughput(
	readCapacityUnits?: number,
	writeCapacityUnits?: number,
): {
		ProvisionedThroughput?: ProvisionedThroughput;
	} {
	let capacityUnits;
	if (
		typeof readCapacityUnits === 'number'
								&& typeof writeCapacityUnits === 'number'
	) {
		capacityUnits = {
			ReadCapacityUnits: readCapacityUnits,
			WriteCapacityUnits: writeCapacityUnits,
		};
	}

	return {
		...(capacityUnits && {ProvisionedThroughput: capacityUnits}),
	};
}
