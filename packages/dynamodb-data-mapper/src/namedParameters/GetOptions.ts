import {ProjectionExpression} from '@aws/dynamodb-expressions';
import {StringToAnyObjectMap} from '../constants';
import {ReadConsistencyConfiguration} from './ReadConsistencyConfiguration';

export interface GetOptions extends ReadConsistencyConfiguration {
	/**
     * The item attributes to get.
     */
	projection?: ProjectionExpression;
}

/**
 * @deprecated
 */
export interface GetParameters<
	T extends StringToAnyObjectMap = StringToAnyObjectMap,
> extends GetOptions {
	/**
     * The item being loaded.
     */
	item: T;
}
