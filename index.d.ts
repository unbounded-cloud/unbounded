declare module '@unbounded/unbounded';

export = Unbounded;

declare class Unbounded {
  constructor(region: string, username: string, password?: string);

  database(name: string): Database;

  listDatabases(): Promise<object[]>;
 
  wait(task: Task): Promise<any>;

  setSubToken(subtoken: string, type: string): void;
}

declare class Database {
  async: DatabaseAsync;

  match(match?: object, options?: object): Promise<object[]>;

  query(): QueryBuilder;

  query(options: object): Promise<object[]>;

  add(values: object | object[], options?: object): Promise;

  insert(): InsertBuilder;

  insert(options: object): Promise;

  update(): UpdateBuilder;

  update(options: object): Promise;

  delete(): DeleteBuilder;

  delete(options: object): Promise;
 
  getKey(): Promise<any>;
 
  setKey(key: string | string[]) : Promise;
 
  getSchema(): Promise<object>;
 
  setSchema(schema: object) : Promise;
 
  getIndexes(): Promise<Array>;
 
  setIndexes(indexes: Array) : Promise;
 
  deleteDatabase() : Promise;
 
  savedQuery(name: string): SavedQuery;
 
  listSavedQueries(): Promise<object[]>;
 
  startUpload(exists?: Function | string, options?: object): Uploader;
}

declare class SavedQuery {
  async: SavedQueryAsync;

  match(match?: object, options?: object): Promise<object[]>;

  query(): QueryBuilder;

  query(options: object): Promise<object[]>;

  deleteSavedQuery(): Promise;
}

declare class Task {}

declare class DatabaseAsync {
  match(match?: object, options?: object): Promise<Task>;

  query(): AsyncQueryBuilder;

  query(options: object): Promise<Task>;

  add(values: object | object[], options?: object): Promise<Task>;

  insert(): AsyncInsertBuilder;

  insert(options: object): Promise<Task>;

  update(): AsyncUpdateBuilder;

  update(options: object): Promise<Task>;

  delete(): AsyncDeleteBuilder;

  delete(options: object): Promise<Task>;
}

declare class SavedQueryAsync {
  match(match?: object, options?: object): Promise<Task>;

  query(): AsyncQueryBuilder;

  query(options: object): Promise<Task>;
}

declare class QueryBuilder {
  match(props): QueryBuilder

  where(func): QueryBuilder

  bind(...args): QueryBuilder

  map(func): QueryBuilder

  filter(func): QueryBuilder

  reduce(func): QueryBuilder

  sort(opts): QueryBuilder

  limit(count): QueryBuilder

  single(): QueryBuilder

  webhook(url): QueryBuilder

  count(): QueryBuilder

  sum(prop): QueryBuilder

  avg(prop): QueryBuilder

  min(prop): QueryBuilder

  max(prop): QueryBuilder

  some(prop): QueryBuilder

  every(prop): QueryBuilder

  send(): Promise<object[]>
}

declare class InsertBuilder {
  values(data): InsertBuilder

  exists(func): InsertBuilder

  bind(...args): InsertBuilder

  send(): Promise
}

declare class UpdateBuilder {
  match(props): UpdateBuilder

  where(func): UpdateBuilder

  set(func): UpdateBuilder

  bind(...args): UpdateBuilder

  single(): UpdateBuilder

  send(): Promise
}

declare class DeleteBuilder {
  match(props): DeleteBuilder

  where(func): DeleteBuilder

  bind(...args): DeleteBuilder

  single(): DeleteBuilder

  send(): Promise
}

declare class QueryBuilderAsync {
  match(props): QueryBuilderAsync

  where(func): QueryBuilderAsync

  bind(...args): QueryBuilderAsync

  map(func): QueryBuilderAsync

  filter(func): QueryBuilderAsync

  reduce(func): QueryBuilderAsync

  sort(opts): QueryBuilderAsync

  limit(count): QueryBuilderAsync

  single(): QueryBuilderAsync

  webhook(url): QueryBuilderAsync

  count(): QueryBuilderAsync

  sum(prop): QueryBuilderAsync

  avg(prop): QueryBuilderAsync

  min(prop): QueryBuilderAsync

  max(prop): QueryBuilderAsync

  some(prop): QueryBuilderAsync

  every(prop): QueryBuilderAsync

  send(): Promise<Task>
}

declare class InsertBuilderAsync {
  values(data): InsertBuilderAsync

  exists(func): InsertBuilderAsync

  bind(...args): InsertBuilderAsync

  send(): Promise<Task>
}

declare class UpdateBuilderAsync {
  match(props): UpdateBuilderAsync

  where(func): UpdateBuilderAsync

  set(func): UpdateBuilderAsync

  bind(...args): UpdateBuilderAsync

  single(): UpdateBuilderAsync

  send(): Promise<Task>
}

declare class DeleteBuilderAsync {
  match(props): DeleteBuilderAsync

  where(func): DeleteBuilderAsync

  bind(...args): DeleteBuilderAsync

  single(): DeleteBuilderAsync

  send(): Promise<Task>
}

declare class Uploader {
  add(value: object) : Promise;

  finish(): Promise;
}
