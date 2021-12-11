import {Capacity, ConsumedCapacity} from '@aws-sdk/client-dynamodb';

export type SecondaryIndexesCapacityMap = Record<string, Capacity>;

/**
 * @internal
 */
export function mergeConsumedCapacities(
	a?: ConsumedCapacity,
	b?: ConsumedCapacity,
): ConsumedCapacity | undefined {
	if (a || b) {
		a = a ?? {};
		b = b ?? {};

		if (a.TableName && b.TableName && a.TableName !== b.TableName) {
			throw new Error(
				'Consumed capacity reports may only be merged if they describe the same table',
			);
		}

		return {
			TableName: a.TableName ?? b.TableName,
			CapacityUnits: (a.CapacityUnits ?? 0) + (b.CapacityUnits ?? 0),
			Table: mergeCapacities(a.Table, b.Table),
			LocalSecondaryIndexes: mergeCapacityMaps(
				a.LocalSecondaryIndexes,
				b.LocalSecondaryIndexes,
			),
			GlobalSecondaryIndexes: mergeCapacityMaps(
				a.GlobalSecondaryIndexes,
				b.GlobalSecondaryIndexes,
			),
		};
	}
}

function mergeCapacities(a?: Capacity, b?: Capacity): Capacity {
	return {
		CapacityUnits: (a?.CapacityUnits ?? 0) + (b?.CapacityUnits ?? 0),
	};
}

function mergeCapacityMaps(
	a?: SecondaryIndexesCapacityMap,
	b?: SecondaryIndexesCapacityMap,
): SecondaryIndexesCapacityMap | undefined {
	if (a || b) {
		const out: SecondaryIndexesCapacityMap = {};

		a = a ?? {};
		b = b ?? {};
		const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);

		for (const key of keys) {
			out[key] = mergeCapacities(a[key], b[key]);
		}

		return out;
	}
}
