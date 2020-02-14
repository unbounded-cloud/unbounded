declare module '@unbounded/unbounded';

export = Unbounded;

declare class Unbounded {
  constructor(region: string, username: string, password: string);

  database(name: string): Database;

  listDatabases(): Promise<object[]>;
 
  wait(task: Task): Promise<any>;
}

declare class Database {
  async: DatabaseAsync;

  match(match?: object, options?: object): Promise<object[]>;

  query(where?: object, options?: object): Promise<object[]>;

  insert(values: object | object[], exists?: Function | string, options?: object): Promise;

  update(match: object, set: Function | string, options?: object): Promise;

  updateWhere(where: Function | string, set: Function | string, options?: object): Promise;
 
  delete(match?: object, options?: object): Promise;
 
  deleteWhere(where?: Function | string, options?: object): Promise;
 
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

declare class Task {}

declare class DatabaseAsync {
  match(match?: object, options?: object): Promise<Task>;

  query(where?: Function | string, options?: object): Promise<Task>;

  insert(values: object | object[], exists?: Function | string, options?: object): Promise<Task>;

  update(match: object, set: Function | string, options?: object): Promise<Task>;

  updateWhere(where: Function, set: Function, options?: object): Promise<Task>;

  delete(match: object, options?: object): Promise<Task>;

  deleteWhere(where: Function | string, options?: object): Promise<Task>;
}

declare class SavedQuery {
  async: SavedQueryAsync;

  match(match?: object, options?: object): Promise<object[]>;

  query(where?: Function | string, options?: object): Promise<object[]>;

  deleteSavedQuery(): Promise;
}

declare class SavedQueryAsync {
  match(match?: object, options?: object): Promise<Task>;

  query(where?: Function | string, options?: object): Promise<Task>;
}

declare class Uploader {
  add(value: object) : Promise;

  finish(): Promise;
}
