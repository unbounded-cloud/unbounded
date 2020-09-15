const _ = require('lodash');
const axios = require('axios');
const PromisePool = require('es6-promise-pool');
const axiosRetry = require('axios-retry');
let https = null;
if (typeof window === 'undefined') {
  https = require('https');
}

const FILE_CONCURRENCY = 4;
const REQUEST_LIMIT = 1024*1024;
const FILE_RETRIES = 10;

let retryClient = axios.create();
axiosRetry(axios, {retryDelay: axiosRetry.exponentialDelay, retries: FILE_RETRIES});

class Client {
  constructor(region, username, password, options) {
    if (arguments.length < 2) {
      throw new Error("You must provide a region and username");
    }
    if (!options) {
      this.options = {
        region: region,
        username: username,
        password: password,
      };
    } else {
      this.options = _.cloneDeep(options);
      this.options.region = region;
      this.options.username = username;
      this.options.password = password;
    }

    if (!this.options.url) {
      this.options.url = 'https://' + region + '.unbounded.cloud';
    }

    this.token = null;
    this.tokenExpires = null;
    this.subToken = null;
    this.subTokenType = null;
    this.dbTokens = {};
    this.dbClients = {};
    this.agent = null;
    if (typeof window === 'undefined') {
      this.agent = new https.Agent({ keepAlive: true });
    }
  }

  setSubToken(subtoken, type) {
    this.subToken = subtoken;
    this.subTokenType = type;
    this.dbTokens = {};
    this.dbClients = {};
  }

  transportProps() {
    let props = {
      baseURL: this.options.url,
      headers: {
        Authorization: 'Bearer ' + this.token,
      }
    }
    if (typeof window === 'undefined') {
      props.headers['User-Agent'] = 'Unbounded JS Client';
      props.httpsAgent = this.agent;
    }
    return props;
  }

  createTransport() {
    this.axios = axios.create(this.transportProps());
  }

  createSubTransport() {
    this.dbClients[db] = axios.create(this.transportProps());
  }

  async getToken(db) {
    try {
      let props = {
        auth: {
          username: this.options.username,
          password: this.options.password,
        },
      };
      if (typeof window === 'undefined') {
        props.headers = {
          'User-Agent': 'Unbounded JS Client',
        };
        props.httpsAgent = this.agent;
      }

      if (!this.subToken || !db) {
        let r = await axios.post(this.options.url + '/token', '', props);
        this.token = r.data.results.token;
        this.tokenExpires = (new Date()).getTime() + (r.data.results.expires * 1000);

        this.createTransport();
      } else {
        let r = await axios.post(this.options.url + '/databases/' + db + '/token', {
          subtoken: this.subToken,
          type: this.subTokenType,
        }, props);

        this.dbTokens[db] = { expires: (new Date()).getTime() + (r.data.results.expires * 1000) };

        this.createSubTransport();
      }
    } catch (e) {
      throw getErr(e);
    }
  }

  async auth(db) {
    let time = (new Date()).getTime();
    let fudge = 30 * 1000;
    if ((!this.token || time > this.tokenExpires - fudge) && (!db || !this.dbTokens[db] || time > this.dbTokens[db].expires - fudge)) {
      await this.getToken(db);
    }
  }

  async request(db, config) {
    await this.auth(db);

    if (db && this.dbClients[db]) {
      return (await this.dbClients[db](config)).data;
    } else {
      return (await this.axios(config)).data;
    }
  }

  async wait(task) {
    while (true) {
      let t = null;
      try {
        t = (await this.request(task.database, {method: 'get', url: '/databases/' + task.database + '/tasks/' + task.id})).results;
      } catch (e) {
        if (!e.response || e.response.status >= 500) {
          continue;
        } else {
          throw getErr(e);
        }
      }
      if (t.status === 'complete') {
        if (task.command === 'query') {
          return new FileResult(t.results, t.files, this.options.fileConcurrency, task.options);
        } else {
          return {};
        }
      }
    }
  }

  async listDatabases() {
    try {
      return (await this.request(null, {method: 'get', url: '/databases'})).results;
    } catch (e) {
      throw getErr(e);
    }
  }

  database(name) {
    return new Database(this, name, false);
  }
}

function compare(a, b) {
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return 0;
  } else if (a === null || a === undefined) {
    return -1;
  } else if (b === null || b === undefined) {
    return 1;
  } else if (typeof(a) === 'number' && typeof(b) === 'number') {
    return a - b;
  } else if (typeof(a) === 'string' && typeof(b) === 'string') {
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  } else if ((a === true || a === false) && (b === true || b === false)) {
    return Number(a) - Number(b);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    let al = Math.max(a.length, b.length)
    for (let i = 0; i < al; i++) {
      if (i >= a.length) {
        return -1;
      } else if (i >= b.length) {
        return 1;
      }

      let c = compare(a[i], b[i]);
      if (c !== 0) {
        return c;
      }
    }
    return 0;
  } else if (typeof(a) === 'object' && typeof(b) === 'object') {
    let keys = Object.keys(a).concat(Object.keys(b));
    keys.sort();
    let uk = [];
    for (let i = 0; i < keys.length; i++) {
      let v = keys[i];
      if (uk.length === 0 || v !== uk[uk.length-1]) {
        uk.push(v);
      }
    }

    for (let i = 0; i < uk.length; i++) {
      let av = a[uk[i]];
      let bv = b[uk[i]];
      if (av === undefined && bv === undefined) {
        continue;
      }
      if (av === undefined) {
        return 1;
      }
      if (bv === undefined) {
        return -1;
      }

      let c = compare(av, bv);
      if (c !== 0) {
        return c;
      }
    }

    return 0;
  } else {
    let at = typeof(a);
    let bt = typeof(b);

    if (at < bt) {
      return -1;
    } else if (at > bt) {
      return 1;
    } else {
      return 0;
    }
  }
}

function sort(s, data) {
  let reverse = [false];
  if (!(typeof(s) === 'string' || s.code)) {
    reverse = s.reverse;
    if (!_.isArray(reverse)) {
      reverse = [reverse];
    }
  }

  data.sort((a, b) => {
    let aval = a.$__sortval;
    let bval = b.$__sortval;

    if (!_.isArray(aval)) {
      aval = [aval];
    }
    if (!_.isArray(bval)) {
      bval = [bval];
    }

    let l = Math.max(aval.length, bval.length);

    for (let i = 0; i < l; i++) {
      let rv = 0;
      if (i >= aval.length) {
        rv = -1;
      } else if (i >= bval.length) {
        rv = 1;
      }

      rv = compare(aval[i], bval[i]);

      if (i < reverse.length && reverse[i]) {
        rv *= -1;
      }

      if (rv !== 0) {
        return rv;
      }
    }
    return 0;
  });
}

class FileResult {
  constructor(results, files, concurrency, options) {
    this.results = results;
    this.files = files;
    this.concurrency = concurrency || FILE_CONCURRENCY;
    this.options = options;
  }

  async fetch() {
    let results = this.results || [];

    let files = this.files;
    let concurrency = this.concurrency;
    if (files && files.length) {
      let filenum = -1;
      try {
        await (new PromisePool(() => {
          filenum++;
          if (filenum >= files.length) {
            return null;
          } else {
            return new Promise((resolve, reject) => {
                retryClient.get(files[filenum])
                .then(r => {
                  results = results.concat(r.data);
                  resolve();
                })
                .catch(e => {
                  reject(e);
                });
            });
          }
        }, concurrency)).start();
      } catch (e) {
        throw new UnboundedError(e);
      }
    }

    if (this.options.sort) {
      sort(this.options.sort, results);
    }
    if (this.options.limit) {
      results = results.slice(0, this.options.limit);
    }

    return results;
  }
}

class UnboundedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnboundedError';
  }
}

exports.UnboundedError = UnboundedError;

function getErr(e) {
  if (e instanceof UnboundedError) {
    return e;
  }
  if (e.response) {
    if (e.response.data.error) {
      return new UnboundedError(e.response.data.error);
    } else {
      return new UnboundedError(JSON.stringify(e.response.data));
    }
  } else if (e.request) {
    return new UnboundedError('No response received');
  } else {
    return new UnboundedError(e.message);
  }
}

function stringify(opts) {
  if (_.isFunction(opts)) {
    return '' + opts;
  } else if (_.isPlainObject(opts)) {
    for (let p in opts) {
      opts[p] = stringify(opts[p]);
    }
  } else if (_.isArray(opts)) {
    for (let i = 0; i < opts.length; i++) {
      opts[i] = stringify(opts[i]);
    }
  }
  return opts;
}

class QueryBase {
  constructor(client, db, async) {
    this.client = client;
    this.db = db;
    this.asyncflag = async;
  }

  async _process(cmd, options) {
    stringify(options);

    if (this.asyncflag) {
      options.async = true;
    }

    let method = 'post';
    let url = this.url;

    if (!cmd) {
      method = 'put';
    } else {
      url = url + '/' + cmd;
    }

    try {
      let r = await this.client.request(this.db, {method: method, url: url, data: options});
      if (r.results_async) {
        var task = {
          id: r.results_async.task,
          database: this.db,
          command: cmd,
        };
        if (cmd === 'query') {
          task.options = {
            sort: options.sort,
            limit: options.limit,
          };
        }
        if (this.asyncflag) {
          return task;
        } else {
          if (task.command === "query") {
            return await (await this.client.wait(task)).fetch();
          } else {
            return await this.client.wait(task);
          }
        }
      } else {
        return r.results;
      }
    } catch (e) {
      throw getErr(e);
    }
  }

  async match(match, options) {
    if (!options) {
      options = {};
    }
    if (!_.isUndefined(match) && match !== null) {
      options.match = match;
    }

    return await this._process('query', options);
  }

  query(options) {
    if (arguments.length === 0) {
      return new QueryBuilder(this);
    }

    return (async () => {
      if (!options) {
        options = {};
      }

      return await this._process('query', options);
    })();
  }
}

class BuilderBase {
  constructor(db, cmd) {
    this.db = db;
    this.cmd = cmd;
    this.options = {};
    this.lastfunc = null;
  }

  bind(...args) {
    if (!this.lastfunc) {
      throw new UnboundedError("The previous option is not bindable");
    }

    if (this.lastfunc === 'sort') {
      let t = typeof(this.options.sort);
      if (t === 'object' && this.options.sort.func) {
        this.options.sort.func.bind = args;
      } else {
        this.options.sort = {
          code: this.options.sort,
          bind: args,
        };
      }
    } else {
      this.options[this.lastfunc].bind = args;
    }

    this.lastfunc = null;
    return this;
  }

  async send() {
    return await this.db._process(this.cmd, this.options);
  }
}

class QueryBuilderBase extends BuilderBase {
  match(props) {
    this.options.match = props;
    return this;
  }

  where(code) {
    this.options.where = {
      code: code,
      bind: [],
    };
    this.lastfunc = 'where';
    return this;
  }

  single() {
    this.options.single = true;
    this.lastfunc = null;
    return this;
  }
}

class QueryBuilder extends QueryBuilderBase {
  constructor(db) {
    super(db, 'query');
  }

  map(code) {
    this.options.map = {
      code: code,
      bind: [],
    };
    this.lastfunc = 'map';
    return this;
  }

  filter(code) {
    this.options.filter = {
      code: code,
      bind: [],
    };
    this.lastfunc = 'filter';
    return this;
  }

  reduce(code) {
    this.options.reduce = {
      code: code,
      bind: [],
    };
    this.lastfunc = 'reduce';
    return this;
  }

  sort(opts) {
    this.options.sort = opts;
    this.lastfunc = 'sort';
    return this;
  }

  limit(count) {
    this.options.limit = count;
    this.lastfunc = null;
    return this;
  }

  webhook(url) {
    this.options.webhook = url;
    this.lastfunc = null;
    return this;
  }

  count() {
    this.map(o => ({count: 1}));
    this.reduce((a, b) => ({count: a.count + b.count}));
    this.lastfunc = null;
    return this;
  }

  sum(prop) {
    this.map((p, o) => ({sum: o[p]})).bind(prop);
    this.reduce((a, b) => ({sum: a.sum + b.sum}));
    this.lastfunc = null;
    return this;
  }

  avg(prop) {
    this.map((p, o) => ({sum: o[p], count: 1})).bind(prop);
    this.reduce((a, b) => {
      let count = a.count + b.count;
      let sum   = a.sum   + b.sum;

      return { sum: sum, count: count, avg: sum / count };
    });
    this.lastfunc = null;
    return this;
  }

  min(prop) {
    this.map((p, o) => ({min: o[p]})).bind(prop);
    this.reduce((a, b) => ({min: Math.min(a.min, b.min)}));
    this.lastfunc = null;
    return this;
  }

  max(prop) {
    this.map((p, o) => ({max: o[p]})).bind(prop);
    this.reduce((a, b) => ({max: Math.max(a.min, b.min)}));
    this.lastfunc = null;
    return this;
  }

  some(prop) {
    this.map((p, o) => ({some: Boolean(o[p])})).bind(prop);
    this.reduce((a, b) => ({some: a.some || b.some}));
    this.lastfunc = null;
    return this;
  }

  every(prop) {
    this.map((p, o) => ({every: Boolean(o[p])})).bind(prop);
    this.reduce((a, b) => ({every: a.every || b.every}));
    this.lastfunc = null;
    return this;
  }
}

class InsertBuilder extends BuilderBase {
  constructor(db) {
    super(db, 'insert');
  }

  values(data) {
    this.options.values = data;
    this.lastfunc = null;
    return this;
  }

  exists(code) {
    this.options.exists = {
      code: code,
      bind: [],
    };
    this.lastfunc = 'exists';
    return this;
  }
}

class UpdateBuilder extends QueryBuilderBase {
  constructor(db) {
    super(db, 'update');
  }

  set(code) {
    this.options.set = {
      code: code,
      bind: [],
    };
    this.lastfunc = 'set';
    return this;
  }
}

class DeleteBuilder extends QueryBuilderBase {
  constructor(db) {
    super(db, 'delete');
  }
}

class SavedQuery extends QueryBase {
  constructor(client, db, name, async) {
    super(client, db, async);
    this.name = name;
    this.url = '/databases/' + db + '/savedqueries/' + name;
  }

  get async() {
    if (this.asyncflag) {
      throw new ReferenceError('The property "async" is not defined on this object');
    }
    return new SavedQuery(this.client, this.db, this.name, true);
  }

  async create(where, options) {
    if (_.isUndefined(options)) {
      options = {};
    }
    if (!_.isUndefined(where) && where !== null) {
      options.where = where;
    }
    
    return await this._process(null, options);
  }

  async deleteSavedQuery() {
    try {
      await this.client.request(this.db, {method: 'delete', url: this.url});
    } catch (e) {
      throw getErr(e);
    }
  }
}

class Database extends QueryBase {
  constructor(client, db, async) {
    super(client, db, async);
    this.url = '/databases/' + db;
  }

  get async() {
    if (this.asyncflag) {
      throw new ReferenceError('The property "async" is not defined on this object');
    }
    return new Database(this.client, this.db, true);
  }

  async add(values, options) {
    if (!options) {
      options = {};
    }
    options.values = values;
    return await this._process('insert', options);
  }

  insert(options) {
    if (arguments.length === 0) {
      return new InsertBuilder(this);
    }

    return (async () => {
      if (!options) {
        options = {};
      }

      return await this._process('insert', options);
    })();
  }

  update(options) {
    if (arguments.length === 0) {
      return new UpdateBuilder(this);
    }

    return (async () => {
      if (!options) {
        options = {};
      }

      return await this._process('update', options);
    })();
  }

  delete(options) {
    if (arguments.length === 0) {
      return new DeleteBuilder(this);
    }

    return (async () => {
      if (!options) {
        options = {};
      }

      return await this._process('delete', options);
    })();
  }

  async getKey() {
    try {
      return (await this.client.request(this.db, {method: 'get', url: this.url})).results.key || null;
    } catch (e) {
      throw getErr(e);
    }
  }

  async setKey(key) {
    try {
      await this.client.request(this.db, {method: 'put', url: this.url, data: {key: key}});
    } catch (e) {
      throw getErr(e);
    }
  }

  async getSchema() {
    try {
      return (await this.client.request(this.db, {method: 'get', url: this.url})).results.schema || null;
    } catch (e) {
      throw getErr(e);
    }
  }

  async setSchema(schema) {
    try {
      await this.client.request(this.db, {method: 'put', url: this.url, data: {schema: schema}});
    } catch (e) {
      throw getErr(e);
    }
  }

  async getIndexes() {
    try {
      return (await this.client.request(this.db, {method: 'get', url: this.url})).results.indexes || [];
    } catch (e) {
      throw getErr(e);
    }
  }

  async setIndexes(indexes) {
    try {
      await this.client.request(this.db, {method: 'put', url: this.url, data: {indexes: indexes}});
    } catch (e) {
      throw getErr(e);
    }
  }

  async deleteDatabase() {
    try {
      await this.client.request(this.db, {method: 'delete', url: this.url});
    } catch (e) {
      throw getErr(e);
    }
  }

  async listSavedQueries() {
    try {
      return (await this.client.request(this.db, {method: 'get', url: this.url + '/savedqueries'})).results;
    } catch (e) {
      throw getErr(e);
    }
  }

  savedQuery(name) {
    return new SavedQuery(this.client, this.db, name, false);
  }

  startUpload(exists, options) {
    if (_.isUndefined(options)) {
      options = {};
    }

    if (!_.isUndefined(exists) && exists !== null) {
      options.exists = exists;
    }
      
    // this is to increase the size for the limit calculation, gets overwritten by insert
    options.values = [];

    stringify(options);

    let limit = this.client.options.requestLimit || REQUEST_LIMIT;
    limit -= (JSON.stringify(options).length + 1024);

    return new Uploader(this, options, limit);
  }
}

class Uploader {
  constructor(db, options, limit) {
    this.db = db;
    this.options = options;
    this.limit = limit;
    this.values = [];
    this.sz = 1;
    this.error = false;
    this.finished = false;
  }

  checkInvalid() {
    if (this.error) {
      throw new UnboundedError("An error was thrown in a previous call");
    }
    if (this.finished) {
      throw new UnboundedError("finish() has already been called");
    }
  }

  async add(value) {
    this.checkInvalid();

    try {
      this.sz += JSON.stringify(value).length + 1;
      if (this.sz > this.limit) {
        if (!this.values.length) {
          throw new UnboundedError("Object is too large");
        }

        await this.db.insert({...this.options, values: this.values});

        this.values = [];
        this.sz = 1;
      }

      this.values.push(value);
    } catch (e) {
      this.error = true;
      throw getErr(e);
    }
  }

  async finish() {
    this.checkInvalid();

    try {
      if (this.values.length) {
        await this.db.insert({...this.options, values: this.values});
      }

      this.finished = true;
    } catch (e) {
      this.error = true;
      throw getErr(e);
    }
  }
}

exports.default = Client;
