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
  let results = await db.add({
    property: 'value'
  });

  let [newid] = results.inserted;

  console.log("inserted id: " + newid);

  let [obj] = await db.match({id: newid});

  console.log("retrieved object: " + JSON.stringify(obj));
})();
```

# Conventions and Notes

## Method call styles

The Unbounded web service takes parameters in the form of JSON objects. This module lets you pass
a raw JSON object to the methods `query`, `insert`, `update` and `delete`:

```js
client.database('mydatabase').query({match: {}, limit: 1}).then(results => {
  // ...
});
```

However, in normal circumstances it is cleaner to use the "builder" style syntax,
which is available by passing no arguments to the `query`, `insert`, etc. methods. In this style,
you can chain options together, then end the chain with a call to `send`, which returns a Promise:

```js
client.database('mydatabase').query()
                             .match({})
                             .limit(1)
                             .send().then(results => {
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
await db.query().where(o => o.someproperty === 1).send();
```

It's important to note that because functions are converted to strings, attempting to
use a global or lexically scoped variable in a callback will result in
an error when the callback is executed in Unbounded. To re-use a callback with
different variables, you should call the `bind` method after adding your function
parameter. `bind` accepts any number of values, which will be passed as the first
parameters to your function when it is executed on the server:

```js
const myfunc = (val, o) => o.someproperty === val;

// queries for someproperty === 1
await db.query().where(myfunc).bind(1).send();
```

## Simple Aggregations

Unbounded lets users specify aggregate functions in terms of `map` and `reduce` functions,
which are analagous to the corresponding calls on the Javascript built-in `Array` class. Because
these functions can be more difficult to write than the simple aggregation functions built in to SQL,
this module contains some shortcuts which let you easiy compute various aggregations of a single property.
For example:

```js
await db.query()
        .sum('counter')
        .send()
```

Will compute the sum of the `counter` properties on the objects in db. This call is shorthand for:

```js
await db.query()
        .map(o => ({sum: o.counter})
        .reduce((a, b) => ({sum: a.sum + b.sum})
        .send()
```

The other built-in aggregation shortcuts are: `count`, `avg`, `min`, `max`, `some`, and `every`.

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
let taskobj = await db.async.query().where(o => o.someproperty === 1).send();
```

This enables users to write to a database and continue processing without waiting for the write to complete. If
desired, the resulting task object can be passed to `client.wait` to receive a Promise that resolves when the task
completes:

```js
let db = client.database('mydatabase');
let taskobj = await db.async.query().where(o => o.someproperty === 1).send();

let results = await client.wait(taskobj);
```

The task object itself can be serialized using JSON, so that if an app terminates or another problem occurs, the task
can still be waited on by deserializing it later.

If the task is a query and no webhook was specified, then the `files` property of the result object will contain a list
of URLs with query results. This object contains a built-in `fetch` method which retrieves the URLs and returns the
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

## Frontend Database Access

This module can be used to access Unbounded directly from an app or web browser. You can use it with React/Angular/Vue
or any other frontend framework.

The main difference between server-side and browser/frontend usage is authentication. In the example at the top of this
page, we created a client object by passing our Unbounded account username and password to the Unbounded() constructor:

```js
let client = new Unbounded('aws-us-east-2', 'user@domain.com', 'somepassword');
```

However, when accessing the db from a browser, we should never use our account password, as our users will be able to
obtain it and gain unfettered access to our account. Rather, we need to use an authentication provider to tie our users
to an identity, and then set a signed identity token for Unbounded to uniquely identify our user. Here's an example using
Google as our authentication provider:

```html
<!-- sample code taken from https://developers.google.com/identity/sign-in/web/sign-in -->
<head>
  <script src="https://apis.google.com/js/platform.js" async defer></script>
  <meta name="google-signin-client_id" content="YOUR_CLIENT_ID.apps.googleusercontent.com">
</head>
<body>
<div class="g-signin2" data-onsuccess="onSignIn"></div>
<script>
  // pass only your username here, not your password
  var client = new Unbounded('aws-us-east-2', 'user@domain.com');

  function onSignIn(googleUser) {
    var id_token = googleUser.getAuthResponse().id_token;

    var token_type = 'google';

    // set the signed in Google user as active in the db client
    client.setSubToken(id_token, token_type);

    // now when we make calls to our client, the authentication will
    // use the user's Google account credentials
    client.database('mydatabase').match({something: true}).then(...);
  }
</script>
</body>
```

The key here is the call to `client.setSubToken`, which will ensure that the Google `id_token`
is used to authenticate all database queries. If you wish to sign out the user later, you can
remove their user token from the client by calling `client.setSubToken(null)`.

In order for this to work, you must configure your database's `users` property with your app's
Google client ID. More information (including using other authentication providers) is available
in the [Unbounded Frontend Access Guide](https://admin.unbounded.cloud/docs/#/frontend).

# Class/Method List

```typescript
export default class Unbounded {
  constructor(region: string, username: string, password: string);

  database(name: string): Database;

  listDatabases(): Promise<object[]>;
 
  wait(task: Task): Promise<FileResult | object[] | undefined>;

  setSubToken(subtoken: string, type: string);
}

class FileResult {
  files: string[]

  fetch(cb?): object[]
}

class Database {
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

class DatabaseAsync {
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

class Task {}

class SavedQuery {
  async: SavedQueryAsync;

  match(match?: object, options?: object): Promise<object[]>;

  query(where?: Function | string, options?: object): Promise<object[]>;

  deleteSavedQuery(): Promise;
}

class SavedQueryAsync {
  match(match?: object, options?: object): Promise<Task>;

  query(): AsyncQueryBuilder;

  query(options: object): Promise<Task>;
}

class Uploader {
  add(value: object) : Promise;

  finish(): Promise;
}

class QueryBuilder {
  match(props: object): QueryBuilder

  where(func: Function | string): QueryBuilder

  bind(...args: any[]): QueryBuilder

  map(func: Function | string): QueryBuilder

  filter(func: Function | string): QueryBuilder

  reduce(func: Function | string): QueryBuilder

  sort(opts: object): QueryBuilder

  limit(count: number): QueryBuilder

  single(): QueryBuilder

  webhook(url: string): QueryBuilder

  count(): QueryBuilder

  sum(prop: string): QueryBuilder

  avg(prop: string): QueryBuilder

  min(prop: string): QueryBuilder

  max(prop: string): QueryBuilder

  some(prop: string): QueryBuilder

  every(prop: string): QueryBuilder

  send(): Promise<object[]>
}

class InsertBuilder {
  values(data: object | object[]): InsertBuilder

  exists(func: Function | string): InsertBuilder

  bind(...args: any[]): InsertBuilder

  send(): Promise
}

class UpdateBuilder {
  match(props: object): UpdateBuilder

  where(func: Function | string): UpdateBuilder

  set(func: Function | string): UpdateBuilder

  bind(...args: any[]): UpdateBuilder

  single(): UpdateBuilder

  send(): Promise
}

class DeleteBuilder {
  match(props: object): DeleteBuilder

  where(func: Function | string): DeleteBuilder

  bind(...args: any[]): DeleteBuilder

  single(): DeleteBuilder

  send(): Promise
}
```
