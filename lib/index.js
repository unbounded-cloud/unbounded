const _ = require('lodash');
const axios = require('axios');
const PromisePool = require('es6-promise-pool');
const axiosRetry = require('axios-retry');

const FILE_CONCURRENCY = 4;
const REQUEST_LIMIT = 1024*1024;
const FILE_RETRIES = 10;

let retryClient = axios.create();
axiosRetry(axios, {retryDelay: axiosRetry.exponentialDelay, retries: FILE_RETRIES});

class Client {
  constructor(region, username, password, options) {
    if (arguments.length === 0) {
      this.options = _.cloneDeep(region);
    } else if (arguments.length === 1) {
      this.options = _.cloneDeep(username);
      this.options.region = region;
    } else if (arguments.length === 2) {
      this.options = _.cloneDeep(password);
      this.options.region = region;
      this.options.username = username;
    } else if (!options) {
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

    if (_.isUndefined(this.options.flatten)) {
      this.options.flatten = true;
    }

    this.token = null;
    this.tokenExpires = null;
  }

  async getToken(cb) {
    try {
      let r = await axios.post(this.options.url + '/token', '', {
        auth: {
          username: this.options.username,
          password: this.options.password,
        },
        headers: {
          'User-Agent': 'Unbounded JS Client',
        },
      });
      this.token = r.data.results.token;
      this.tokenExpires = (new Date()).getTime() + (r.data.results.expires * 1000);

      this.axios = axios.create({
        baseURL: this.options.url,
        headers: {
          Authorization: 'Bearer ' + this.token,
          'User-Agent': 'Unbounded JS Client',
        }
      });
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }

    if (cb) {
      cb(null);
    }
  }

  async auth(cb) {
    if (!this.token || (new Date()).getTime() > (this.tokenExpires - (30 * 1000))) {
      await this.getToken(cb);
    } else {
      if (cb) {
        cb(null);
      }
    }
  }

  async request(config) {
    await this.auth();

    return (await this.axios(config)).data;
  }

  async wait(task, cb) {
    while (true) {
      let t = null;
      try {
        t = (await this.request({method: 'get', url: '/databases/' + task.database + '/tasks/' + task.id})).results;
      } catch (e) {
        if (!e.response || e.response.status >= 500) {
          continue;
        } else {
          if (cb) {
            cb(getErr(e));
            return;
          }
          throw getErr(e);
        }
      }
      if (t.status === 'complete') {
        if (task.command === 'query') {
          return new FileResult(t.files, this.options.fileConcurrency, this.options.flatten);
        } else {
          return {};
        }
      }
    }
  }

  async listDatabases(cb) {
    try {
      let r = await this.request({method: 'get', url: '/databases'});
      if (cb) {
        cb(null, r);
      } else {
        return r;
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }
  }

  database(name) {
    return new Database(this, name, false);
  }
}

class FileResult {
  constructor(files, concurrency, flatten) {
    this.files = files;
    this.concurrency = concurrency || FILE_CONCURRENCY;
    this.flatten = flatten;
  }

  async fetch(cb) {
    let files = this.files;
    let concurrency = this.concurrency;
    if (!files || !files.length) {
      if (cb) {
        cb(null, []);
        return;
      }
      return [];
    }
    let filenum = -1;
    let results = [];
    try {
      await (new PromisePool(() => {
        filenum++;
        if (filenum >= files.length) {
          return null;
        } else {
          return new Promise((resolve, reject) => {
              retryClient.get(files[filenum])
              .then(r => {
                if (this.flatten) {
                  results = results.concat(r.data);
                } else {
                  results.push(r.data);
                }
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

  async _process(cmd, options, cb) {
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
      let r = await this.client.request({method: method, url: url, data: options});
      if (r.results_async) {
        var task = {
          id: r.results_async.task,
          database: this.db,
          command: cmd,
        };
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
        let results = r.results;
        if (!this.client.options.flatten) {
          results = [results];
        }
        if (cb) {
          cb(null, results);
          return;
        }
        return results;
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
        return;
      }
      throw getErr(e);
    }
  }

  async match(match, options, cb) {
    if (_.isUndefined(options)) {
      options = {};
    }
    if (!_.isUndefined(match) && match !== null) {
      options.match = match;
    }

    return await this._process('query', options, cb);
  }

  async query(where, options, cb) {
    if (_.isUndefined(options)) {
      options = {};
    }
    if (!_.isUndefined(where) && where !== null) {
      options.where = where;
    }

    return await this._process('query', options, cb);
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

  async create(where, options, cb) {
    if (_.isUndefined(options)) {
      options = {};
    }
    if (!_.isUndefined(where) && where !== null) {
      options.where = where;
    }
    
    return await this._process(null, options, cb);
  }

  async deleteSavedQuery(cb) {
    try {
      await this.client.request({method: 'delete', url: this.url});
      if (cb) {
        cb(null);
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
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

  async insert(values, exists, options, cb) {
    if (_.isUndefined(options)) {
      options = {};
    }

    options.values = values;

    if (!_.isUndefined(exists) && exists !== null) {
      options.exists = exists;
    }

    return await this._process('insert', options, cb);
  }

  async update(match, set, options, cb) {
    if (_.isUndefined(options)) {
      options = {};
    }

    if (!_.isUndefined(match) && match !== null) {
      options.match = match;
    }

    options.set = set;

    return await this._process('update', options, cb);
  }

  async updateWhere(where, set, options, cb) {
    if (_.isUndefined(options)) {
      options = {};
    }

    if (!_.isUndefined(where) && where !== null) {
      options.where = where;
    }

    options.set = set;

    return await this._process('update', options, cb);
  }

  async delete(match, options, cb) {
    if (_.isUndefined(options)) {
      options = {};
    }

    if (!_.isUndefined(match) && match !== null) {
      options.match = match;
    }

    return await this._process('delete', options, cb);
  }

  async deleteWhere(where, options, cb) {
    if (_.isUndefined(options)) {
      options = {};
    }

    if (!_.isUndefined(where) && where !== null) {
      options.where = where;
    }

    return await this._process('delete', options, cb);
  }

  async getKey(cb) {
    try {
      let r = (await this.client.request({method: 'get', url: this.url})).key || null;
      if (cb) {
        cb(null, r);
      } else {
        return r;
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }
  }

  async setKey(key, cb) {
    try {
      await this.client.request({method: 'put', url: this.url, data: {key: key}});
      if (cb) {
        cb(null);
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }
  }

  async getSchema(cb) {
    try {
      let r = (await this.client.request({method: 'get', url: this.url})).schema || null;
      if (cb) {
        cb(null, r);
      } else {
        return r;
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }
  }

  async setSchema(schema, cb) {
    try {
      await this.client.request({method: 'put', url: this.url, data: {schema: schema}});
      if (cb) {
        cb(null);
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }
  }

  async deleteDatabase(cb) {
    try {
      await this.client.request({method: 'delete', url: this.url});
      if (cb) {
        cb(null);
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }
  }

  async listSavedQueries(cb) {
    try {
      let r = await this.client.request({method: 'get', url: this.url + '/savedqueries'});
      if (cb) {
        cb(null, r);
      } else {
        return r;
      }
    } catch (e) {
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
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

  async add(value, cb) {
    this.checkInvalid();

    try {
      this.sz += JSON.stringify(value).length + 1;
      if (this.sz > this.limit) {
        if (!this.values.length) {
          throw new UnboundedError("Object is too large");
        }

        await this.db.insert(this.values, null, this.options);

        this.values = [];
        this.sz = 1;
      }

      this.values.push(value);

      if (cb) {
        cb(null);
      } else {
        return;
      }
    } catch (e) {
      this.error = true;
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }
  }

  async finish(cb) {
    this.checkInvalid();

    try {
      if (this.values.length) {
        await this.db.insert(this.values, null, this.options);
      }

      this.finished = true;

      if (cb) {
        cb(null);
      } else {
        return;
      }
    } catch (e) {
      this.error = true;
      if (cb) {
        cb(getErr(e));
      } else {
        throw getErr(e);
      }
    }
  }
}

exports.default = Client;
