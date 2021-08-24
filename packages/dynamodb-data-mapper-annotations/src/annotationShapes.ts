
/**
 * A constructor that takes no arguments.
 */
 export interface ZeroArgumentsConstructor<T> {
    new (): T;
}

export interface ClassAnnotation {
    (target: ZeroArgumentsConstructor<any>): void;
}

export interface PropertyAnnotation {
    (target: Object, propertyKey: string|symbol): void;
}