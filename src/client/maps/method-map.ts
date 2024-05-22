export type RemoveIndexSignature<T> = {  
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K
  ]: T[K];
}

export type MappedFunction = (...args: any) => any;

export type PromiseReturnType<T> = T extends Promise<infer Return> ? Return : T;

export type ServiceMap<T> = { [K in keyof T]: MethodMap<T[K]> }

//export type Services<T> = { [K in keyof T]: MethodMap<T[K]> }

//export type PickServices<T> = { [P in keyof T as T[P] extends AsyncFunction ? never : P]: T[P] };
//export type PickServices<T> = { [P in keyof T as T[P] extends Exclude<T[P], AsyncFunction> ? never : P]: T[P] };



export type MethodMap<T> = { [K in keyof T]: MappedFunction }

//export type PickMethods<T> = { [P in keyof T]: T[P] extends AsyncFunction ? T[P] : never };
//export type PickMethods<T> = { [P in keyof T as T[P] extends AsyncFunction ? P : never]: T[P] extends AsyncFunction ? T[P] : never };

export type FunctionReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : never;

export type PublicMethodMap<T, U> = { [K in keyof T]: MappedFunction } & { [T in keyof U]?: never };

