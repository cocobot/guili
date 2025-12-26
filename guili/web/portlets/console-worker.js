/*
 * Web worker for console portlet
 */

(function(self, myeval) {
  "use strict";

  // copy some global variables to local scope
  // global scope will be cleaned afterwards
  const postMessage = self.postMessage;

  // for debug
  const log = function(data) { postMessage({ method: 'log', data: data }); };

  // Pack all message arguments into an object or array
  const packRomeArgs = function(params, args) {
    let nargs = args.length;
    let kw;
    if (args[nargs-1] instanceof Object && !(args[nargs-1] instanceof Array)) {
      // last parameter contains keyword parameters
      kw = args.pop();
      --nargs;
    }

    if (params instanceof Array) {
      // Named parameters
      const packed = {};
      // Pack positional arguments
      if (nargs > params.length) {
        throw "invalid parameter count";
      }
      for (let i=0; i < nargs; ++i) {
        packed[params[i]] = args[i];
      }
      // Pack keyword arguments
      if (kw !== undefined) {
        for (let i = nargs; i < params.length; ++i) {
          const name = params[i];
          const v = kw[name];
          if (v === undefined || v === null) {
            throw `missing parameter: ${name}`;
          }
          packed[name] = v;
          delete kw[name];
        }
        // Fail if there are unused keywords
        for (const name in kw) {
          // Note: this loop will iterate at most once
          if (packed[name] === undefined) {
            throw `unknown parameter: ${name}`;
          } else {
            throw `parameter ${name} set twice`;
          }
        }
      }
      return packed;
    } else {
      // Positional parameters
      if (kw !== undefined && kw.length != 0) {
        throw "unexpected named parameters";
      } else if (args.length != params) {
        throw `invalid parameter count, expected ${params}, got ${args.length}`;
      } else {
        return args;
      }
    }
  };

  // pretty-print response data
  const stringify = function(o) {
    switch(typeof(o)) {
      case 'undefined': return 'undefined';
      case 'boolean':
      case 'number':
        return o.toString();
      case 'string': return '"'+o.replace(/["\\]/g, '\\$&')+'"';
      case 'function': return 'function '+(o.name||'')+'()';
      case 'object':
        if(o === null) {
          return 'null';
        } else if(o instanceof Array) {
          return '['+o.map(stringify).join(', ')+']';
        } else {
          return '{'+Object.keys(o).map(function(k){ return String(k)+': '+stringify(o[k]); }).join(', ')+'}';
        }
      default: return String(o);
    }
  };

  // Unbound message methods, needed to rebind robots
  const unbound_messages = {};

  // Update robot bindings, in place
  const update_robots_bindings = function() {
    for (const name in self.robots) {
      const bindings = self.robots[name];
      for (const k in bindings) {
        delete bindings[name];
      }
      for (const msg in unbound_messages) {
        bindings[msg] = unbound_messages[msg].bind(null, name);
      }
    }
  };

  const message_handler = function(ev) {
    const request = ev.data;
    const method = request.method;

    const response = { method: 'response', id: request.id };
    try {
      if(method == 'eval') {
        // evaluate an expression
        response.data = stringify(myeval(request.code));

      } else if(method == 'scope') {
        // add values to worker scope
        for(var k in request.scope) {
          self[k] = request.scope[k];
        }

      } else if(method == 'complete') {
        // autocomplete the given dotted variable
        // return a list of suggestions
        var v = self;
        var words = request.variable.split('.');
        var last = words.pop();
        for(var i; i<words.length; i++) {
          v = self[words[k]];
          if(! v instanceof Object) {
            break;
          }
        }
        if(v instanceof Object) {
          response.data = Object.keys(v).filter(function(k) {
            return k.substring(0, last.length) == last;
          });
          response.data.sort();
        } else {
          response.data = [];
        }

      } else if(method == 'robots') {
        // Delete existing "aliases"
        for (let k in self.robots) {
          if (self[k] === self.robots[k]) {
            delete self[k];
          }
          if (self.rome[k] === self.robots[k]) {
            delete self[k];
          }
        }
        // Define new ones
        self.robots = {};
        for (const k of request.robots) {
          const name = k.toLowerCase();  // Use lowercase variable names, for convenience
          self.robots[name] = {};
          update_robots_bindings();
          // Define aliases
          if (self[name] === undefined) {
            self[name] = self.robots[name];
          }
        }

      } else if(method == 'messages') {
        // Remove existing messages
        if (self.rome instanceof Object) {
          // Delete existing "aliases"
          for (let k in self.rome) {
            if (self[k] === self.rome[k]) {
              delete self[k];
            }
          }
        }
        for (const name in unbound_messages) {
          delete unbound_messages[name];
        }
        self.rome = {};

        // Define new ones
        for (const name in request.messages) {
          const params = request.messages[name];
          const f = function() {
            const args = Array.from(arguments);
            const robot = args.shift();
            postMessage({ method: 'rome', robot, name, args: packRomeArgs(params, args) });
          };
          unbound_messages[name] = f;
          self.rome[name] = f.bind(null, null);
          update_robots_bindings();
          // Define aliases
          if (self[name] === undefined) {
            self[name] = self.rome[name];
          }
        }

      } else {
        response.error = "unknown console worker method";
      }
    } catch(e) {
      response.error = String(e);
    }
    postMessage(response);
  };

  // use addEventListener to avoid defining "onmessage" in the global scope
  self.addEventListener('message', message_handler, false);

  // predefine some variables
  self.rome = {};  // Messages
  self.robots = {};  // Robots

  // clean the global scope
  self.Worker =
  self.postMessage =
  self.addEventListener =
  self.removeEventListener =
  self.importScripts =
  self.XMLHttpRequest =
  undefined;

}(self, eval));

