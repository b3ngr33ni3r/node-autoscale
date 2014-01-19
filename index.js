var split = require("split"),
  Proxy = require("http-proxy"),
  ChildProcess = require("child_process")
  Http = require("http"),
  config = require("optimist").default({
      name: "autoscale",
      port: 2000,
      max: 10,
      min: 1,
      //retry: 3, //TODO, otherwise it can retry forever
      method: "round robin",
      entry: "./test",
      verbose: true
  }).argv;

//
//patch console.log to use verbose, and/or loggers
//
(function(){
  var logger = console;

  _log = logger.log || logger.info;
  logger.log = function() {
    if (config.verbose) {
      _log.apply(null,arguments);
    }
  };
  _warn = logger.warn;
  logger.warn = function() {
    if (config.verbose) {
      _warn.apply(null,arguments);
    }
  };
  _error = logger.error;
  logger.error = function() {
    if (config.verbose) {
      _error.apply(null,arguments);
    }
  };
  _debug = logger.debug;
  logger.debug = function() {
    if (config.verbose) {
      _debug.apply(null,arguments);
    }
  };

})();

//
//port manager, pass a port to free it, otherwise it returns a free port
//
var freePort = (function(max,min,start) {
  var _pool = [];
  for (var i = min ; i <= max ; i++) {
    _pool.push({port:start+i,used:false});
  }
  return function(port) {
    if (port == null) {
      for (var i = 0 ; i < _pool.length ;  i++) {
        if (!_pool[i].used) {
          _pool[i].used = true;
          return _pool[i].port;
        }
      }
    } else {
      for (var i = 0 ; i < _pool.length ;  i++) {
        if (_pool[i].port == port && _pool[i].used) {
          return _pool[i].used = false;
        }
      }
    }
  };
})(config.max,config.min,config.port);

//
//available address store
//
var addresses = [];

//
//process spawner
//
var spawnNewProcess = (function(entry,max,verbose) {
  var procCount = 0;
  function _spawn() {
    if (procCount < max) {
      var port = freePort();
      var proc = ChildProcess.fork(entry,["--verbose",verbose,"--port",port],{silent:true});
      procCount++;
      addresses.push({
        host: "localhost",
        port: port,
        filter: {
          memory: null,
          uptime: null
        }
      });
      proc.on("message", function (data) {
        if (data.full === true) {
          for (var i = 0 ; i < addresses.length ; i++) {
            if (addresses[i].port == port) {
              addresses.splice(i,1);
            }
          }
          _spawn();
        } else {
          addresses.push({
            host: "localhost",
            port: port,
            filter: {
              memory: data.memory || null,
              uptime: data.uptime || null
            }
          });
        }

      });
      proc.on("error", function (err) {
        console.error(err);
      });
      proc.on("exit", function () {
        for (var i = 0 ; i < addresses.length ; i++) {
          if (addresses[i].port == port) {
            addresses.splice(i,1);
          }
        }
        _spawn(); //try again
      });
      proc.stdout.pipe(split()).on("data", function (data) {
        console.log(data);
      });
      proc.stderr.pipe(split()).on("data", function (data) {
        console.error(data);
      });
    }
  }
  return _spawn;
})(config.entry,config.max,config.verbose);

//
//spawn our min number of processes
//
for (var i = 0 ; i < config.min; i++) {
  spawnNewProcess();
}

//
//build our tcp server by config.method
//

var serverLogic,wsLogic; //our functions for server creation

if (typeof config.method == "string" && config.method === "round robin") {
  serverLogic = function (req, res) {
    var target = addresses.shift();
    if (target != null) {
      proxy.web(req, res, {target: target});
      addresses.push(target);
    } else {
      res.writeHead(500, {"Content-Type": "application/json"});
      res.end(JSON.stringify({error:"No Available Servers!"}));
    }
  };

  wsLogic = function (req, socket, head) {
    var target = addresses.shift();
    if (target != null) {
      proxy.ws(req, socket, head, {target: target});
      addresses.push(target);
    } else {
      socket.end(JSON.stringify({error:"No Available Servers!"}));
    }
  };
} else if (typeof config.method == "string" && config.method === "memory") {
  serverLogic = function (req, res) {
    var lowAddr = null;
    for (var i = 0 ; i < addresses.length ; i++) {
      var addr = addresses[i];
      if (lowAddr == null) {
        lowAddr = addr;
      } else {
        //do a uptime diff, saving lowest
        if (addr.filter.memory != null) {
          if (addr.memory <= lowAddr.memory) {
            lowAddr = addr;
          }
        }
      }
    }
    if (lowAddr != null) {
      proxy.web(req, res, {target: lowAddr});
    } else {
      res.writeHead(500, {"Content-Type": "application/json"});
      res.end(JSON.stringify({error:"No Available Servers!"}));
    }
  };

  wsLogic = function (req, socket, head) {
    var lowAddr = null;
    for (var i = 0 ; i < addresses.length ; i++) {
      var addr = addresses[i];
      if (lowAddr == null) {
        lowAddr = addr;
      } else {
        //do a uptime diff, saving lowest
        if (addr.filter.memory != null) {
          if (addr.memory <= lowAddr.memory) {
            lowAddr = addr;
          }
        }
      }
    }
    if (lowAddr != null) {
      proxy.ws(req, socket, head, {target: lowAddr});
    } else {
      socket.end(JSON.stringify({error:"No Available Servers!"}));
    }
  };
} else if (typeof config.method == "string" && config.method === "uptime") {
  serverLogic = function (req, res) {
    var lowAddr = null;
    for (var i = 0 ; i < addresses.length ; i++) {
      var addr = addresses[i];
      if (lowAddr == null) {
        lowAddr = addr;
      } else {
        //do a uptime diff, saving lowest
        if (addr.filter.uptime != null) {
          if (addr.uptime <= lowAddr.uptime) {
            lowAddr = addr;
          }
        }
      }
    }
    if (lowAddr != null) {
      proxy.web(req, res, {target: lowAddr});
    } else {
      res.writeHead(500, {"Content-Type": "application/json"});
      res.end(JSON.stringify({error:"No Available Servers!"}));
    }
  };

  wsLogic = function (req, socket, head) {
    var lowAddr = null;
    for (var i = 0 ; i < addresses.length ; i++) {
      var addr = addresses[i];
      if (lowAddr == null) {
        lowAddr = addr;
      } else {
        //do a uptime diff, saving lowest
        if (addr.filter.uptime != null) {
          if (addr.uptime <= lowAddr.uptime) {
            lowAddr = addr;
          }
        }
      }
    }
    if (lowAddr != null) {
      proxy.ws(req, socket, head, {target: lowAddr});
    } else {
      socket.end(JSON.stringify({error:"No Available Servers!"}));
    }
  };
} else {
  return console.log("unsupported method! try 'round robin','uptime' or 'memory'.");
}

//bring up our proxy server
var proxy = new Proxy.createProxyServer();
var proxyServer = Http.createServer(serverLogic);
proxyServer.on('upgrade', wsLogic);
proxyServer.listen(config.port);