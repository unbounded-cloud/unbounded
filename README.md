unbounded - The Official Unbounded Javascript Client
================================================

This module implements full-featured access to the
[Unbounded database](https://www.unbounded.cloud/).

For detailed information on methods and parameters, see the
[API reference](https://admin.unbounded.cloud/docs/#/apiref) on the Unbounded documentation portal.

# Installation

    npm install @unbounded/unbounded --save

# Example

```js
const Unbounded = require('@unbounded/unbounded');

let client = new Unbounded('aws-us-east-2', 'user@domain.com', 'somepassword');

let db = client.database('mydatabase');

(async () => {
  let results = await db.insert({
    property: 'value'
  });

  let [newid] = results.inserted;

  console.log("inserted id: " + newid);

  let [obj] = await db.match({id: newid});

  console.log("retrieved object: " + JSON.stringify(obj));
})();
```

# Conventions and Notes

## Callbacks / Promises

All methods which communicate with the database can take an optional callback as their last argument,
if users prefer that style of call:

```js
client.listDatabases((err, results) => {
  // process results
});
```

If the callback is not specified, then the methods return an ES2015 Promise.

## Option Parameters

Most methods in Unbounded take a number of optional arguments. For convenience, methods
in this module take one or two common positional arguments and group the rest into an
optional `options` object parameter. Some methods (e.g. `delete` and `deleteWhere`) map to the same
Unbounded method (`delete`), but allow the user to pass a different positional argument to save
typing.

Here's an example of passing an optional argument (`limit`):

```js
client.database('mydatabase').match({}, {limit: 1}, (err, results) => {
  // ...
});
```

## Functions as Arguments

Unbounded accepts Javascript functions as JSON strings for various purposes. When
using this module, you have the option to pass actual Javascript code to your calls,
allowing it to be syntax highlighted, linted, etc. The module will automatically convert
the `where` argument in a call like this to a string when sending it to the Unbounded
servers:

```js
let db = client.database('mydatabase');
db.query(o => o.someproperty === 1);
```

It's important to note that because functions are converted to strings, attempting to
use a global or lexically scoped variable in a callback will result in
an error when the callback is executed in Unbounded. To re-use a callback with
different variables, you should use the `code`/`bind` form of the parameter:

```js
const myfunc = (val, o) => o.someproperty === val;

db.query({
  code: myfunc,
  bind: [1],
}); // queries for someproperty === 1
```

## Async Tasks

In Unbounded, any method call can return either a synchronous reply or an asynchronous task. This module abstracts
that behavior in the following way:

By default, calling methods on a database or saved query object will always return synchronously (meaning they will
complete when their promise resolves or callback parameter completes; this behavior is not related to the inherant
async behavior of Javascript). If a method does return an async task, the library hides this by automatically
waiting for the task to complete and returning the result.

Note that for large queries that are saved to files, this behavior can result in unwanted resource usage, because
the library will attempt to download all the files and concatenate them before returning. For large queries,
[webhooks](http://admin.unbounded.cloud/docs/#/guide?id=webhooks) are a more performant option than the default file
behavior.

Optionally, clients can manage async tasks manually by calling methods on the `async` property of a database:

```js
let db = client.database('mydatabase');
let taskobj = await db.async.query(o => o.someproperty === 1);
```

This enables users to write to a database and continue processing without waiting for the write to complete. If
desired, the resulting task object can be passed to `client.wait` to receive a Promise that resolves when the task
completes:

```js
let db = client.database('mydatabase');
let taskobj = await db.async.query(o => o.someproperty === 1);

let results = await client.wait(taskobj);
```

The task object itself can be serialized using JSON, so that if an app terminates or another problem occurs, the task
can still be waited on by deserializing it later.

If the task is a query and no webhook was specified, then the `files` property of the result object will contain a list
of URLs with query results.  This object contains a built-in `fetch` method which retrieves the URLs and returns the
concantenated results as an array:

```js
let objs = await results.fetch();
```

## Bulk Upload

`startUpload` is a convenience method which simplifies importing a large number of objects into an Unbounded database.
It accepts the same options as the `insert` method (without the `values` parameter). `startUpload` returns an `Uploader`
class instance, which has an `add` method to add objects to the upload. Call the `finish` method after all objects are
added:

```js
let array = [{someproperty: 1}, {someproperty: 2}, ...];

let uploader = client.database('mydatabase').upload();

for (let i in array) {
  await uploader.add(array[i]);
}

await uploader.finish();
```

# Class/Method List

```typescript
class Client {
  constructor(region: string, username: string, password: string)

  database(name: string): Database

  listDatabases(cb?): object[]

  wait(task: Task, cb?): FileResult | Result
}

class FileResult {
  files: string[]

  fetch(cb?): Result
}

class Database {
  async: DatabaseAsync

  match(match: object, options?: object, cb?): Result

  query(where: Function, options?: object, cb?): Result

  insert(values: object | object[], exists?: Function, options?: object, cb?): Result

  update(match: object, set: Function, options?: object, cb?): Result

  updateWhere(where: Function, set: Function, options?: object, cb?): Result

  delete(match: object, options?: object, cb?): Result

  deleteWhere(where: Function, options?: object, cb?): Result

  getKey(cb?, cb?): string | string[]

  setKey(key: string | string[], cb?)

  getSchema(cb?): object

  setSchema(schema: object, cb?)

  getIndexes(cb?): Array

  setIndexes(indexes: Array, cb?)

  deleteDatabase(cb?)

  savedQuery(name: string, cb?): SavedQuery

  listSavedQueries(cb?): object[]

  startUpload(exists?: Function, options?: object): Uploader
}

class DatabaseAsync {
  match(match: object, options?: object, cb?): Task

  query(where: Function, options?: object, cb?): Task

  insert(values: object | object[], exists?: Function, options?: object, cb?): Task

  update(match: object, set: Function, options?: object, cb?): Task

  updateWhere(where: Function, set: Function, options?: object, cb?): Task

  delete(match: object, options?: object, cb?): Task

  deleteWhere(where: Function, options?: object, cb?): Task
}

class SavedQuery {
  async: SavedQueryAsync

  match(match: object, options?: object, cb?): Result

  query(where: Function, options?: object, cb?): Result

  deleteSavedQuery(cb?)
}

class SavedQueryAsync {
  match(match: object, options?: object, cb?): Task

  query(where: Function, options?: object, cb?): Task
}
```
