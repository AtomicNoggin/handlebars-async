
var handlebarsAsync = !(function() {
  'use strict';
  var utils = {
    toArray: function (args) {
      return Array.prototype.slice.apply(args);
    },

    quoteRegExp: function(str) {
      return (str+'').replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
    }
  };
  var uuid = 0;

  function Waiter () {
    this._waiting = [];
    this._resolved = {};
    this._onResolved = [];
    this._firstErr = null;
  }

  Waiter.prototype.create = function () {
    var self = this;
    var id;
    while((id = Date.now() + '.' + (++uuid)) && this._waiting.indexOf(id) >= 0);
    this._waiting.push(id);
    return {
      id: id,
      done: function (err) {
        self._waiting.splice(self._waiting.indexOf(id), 1);
        self._resolved[id] = arguments;
        self._firstErr = self._firstErr || err;

        if (self._waiting.length <= 0 && self._onResolved.length > 0) {
          process.nextTick(function () {
            self._onResolved.forEach(function (fn) {
              fn.call(self, self._firstErr, self._resolved);
            });
            self._onResolved = [];
          });
        }
      }
    };
  };

  Waiter.prototype.remove = function (id) {
    delete this._resolved[id];
  };

  Waiter.prototype.done = function (cb) {
    if (this._waiting.length <= 0) {
      cb.apply(this, this._resolved);
    } else {
      this._onResolved.push(cb);
    }
  };

  var obscurate = function (id) {
    return '__!hbs-async!__' + id + '__!hbs-async!__';
  };

  var regId = function (id) {
    return new RegExp(utils.quoteRegExp(obscurate(id)));
  };

  var findId = function (str, id) {
    return str.match(regId(id));
  };

  var replaceId = function (str, id, content) {
    return str.replace(regId(id), content);
  };

  var bindAsync = function (fn, waiter) {
    return function () {
      var waiter = waiter || this._async_waiter;
      var isAsync = false;
      var waiterId;

      var context = this || {};

      context.async = function () {
        isAsync = true;

        var wait = waiter.create();
        waiterId = wait.id;
        return wait.done;
      };

      var res = fn.apply(context, arguments);

      if (isAsync) {
        return obscurate(waiterId);
      } else {
        return res;
      }
    };
  };

  return function (Handlebars) {
    var _registerHelper = Handlebars.registerHelper;
    var _compile = Handlebars.compile;
    var _vm_invokePartial = Handlebars.VM.invokePartial;

    Handlebars.registerHelper = function (name, fn) {
      return _registerHelper.call(Handlebars, name, bindAsync(fn));
    };

    Handlebars.registerAsyncHelper = function (name, fn) {
      var _fn = fn;
      fn = function () {
        var wait = this._async_waiter.create();
        var args = utils.toArray(arguments);
        args.push(wait.done);

        _fn.apply(this, args);

        return obscurate(wait.id);
      };

      return _registerHelper.call(Handlebars, name, fn);
    };

    Handlebars.compile = function () {
      var compiled = _compile.apply(Handlebars, arguments);

      return function (context, options, callback) {
        if (typeof context == 'function') {
          callback = context;
          context = {};
        }
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        var waiter = new Waiter();

        context = context || {};
        if (!context._async_waiter) {
          Object.defineProperty(context, '_async_waiter', {
            value: waiter
          });
        }

        var res = compiled.call(Handlebars, context, options);

        if (typeof res !== 'string') {
          return callback(null, res);
        }

        waiter.done(function (err, replacements) {
          if (err) {
            return callback(err);
          }

          for (var id in replacements) {
            if (replacements.hasOwnProperty(id) && findId(res, id)) {
              res = replaceId(res, id, replacements[id][1]);
              waiter.remove(id);
            }
          }

          callback(null, res);
        });
      };
    };

    Handlebars.VM.invokePartial = function (partial, name, context, helpers, partials, data) {
      var options = { helpers: helpers, partials: partials, data: data };

      if(partial === undefined) {
        throw new Handlebars.Exception("The partial " + name + " could not be found");
      } else if(partial instanceof Function) {
        partial = bindAsync(partial, context._async_waiter);
        return partial(context, options);
      } else if (!Handlebars.compile) {
        throw new Handlebars.Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
      } else {
        var wait = context._async_waiter.create();

        partials[name] = Handlebars.compile(partial, {data: data !== undefined});
        partials[name](context, options, wait.done);

        return obscurate(wait.id);
      }
    };

    return Handlebars;
  };
}();
