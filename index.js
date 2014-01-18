var Promise = require("promise"),
  Net = require("net"),
  ChildProcess = require("child_process")
  Async = require("async"),
  Uniformer = require("uniformer"),
  config = Uniformer({
    defaults: {
      name: "autoscale",
      port: 2000,
      max: 10,
      min: 1,
      retry: 3,
      entry: "npm start",
      verbose: true
    }
  });

//patch console.log to use verbose, and/or loggers
(function(){
  var logger = console;

  _log = logger.log;
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

//the class for our monitored processes
var Process = (function() {
  function Process(command,port,args,maxRespawnCount) {
    this.port = port;
    this.command = command;
    this.args = args;
    this.pid = null;
    this._process = null;
    var _maxRespawnCount = maxRespawnCount || 0,
      self = this;

    this.start = function() {
      if (self._process == null || !self._process.connected) {
        var _respawnCount = self._process._respawnCount || -1;
        if (_respawnCount < _maxRespawnCount) {
          self._process = ChildProcess.fork(self.command,self.args);
          self._process._respawnCount = _respawnCount+1;
          self._process.stdout.on('data',console.log);
          self._process.stderr.on('data',console.error);
          self._process.on('close',self.close);
          self._process.on('exit',self.close);
          self._process.on('disconnect',self.close);
          self._process.on('error',self.error);
          self.pid = self._process.pid;
        }
      }
    };
    this.close = function(err) {
      var status = "instantiating new instance...";
      if (self._process._respawnCount >= _maxRespawnCount) {
        status = "and will stay down, hit retry limit "+_maxRespawnCount;
      }
      console.log("[DOWN] "+self.pid+" crashed, "+status);
      if (self._process.connected) {
        self._process.connected = false;
      }
      self.start();
    };
    this.error = function(err) {
      console.error(err);
    };
    this.kill = function(signal) {
      self._process.kill(signal);
    };

  }
  return Process;
})();

//track our processes here
var processes = [];
function spawnNewProcess() {
  if (processes.length < config.max) {
    var proc = new Process(config.entry,config.port+i,["--verbose",config.verbose,"--port",config.port+i],config.retry);
    proc._process.on("message", function(m) {
      if (m.full != null && m.full === true) {
        spawnNewProcess();
      }
    });
    proc.start();
    processes.push(proc);
  }
}
//spawn our min number of processes
for (var i = 0 ; i < config.min; i++) {
  spawnNewProcess();
}

//build our tcp server
var server = Net.createServer(function (conn) {
  console.log(conn);
  conn.on("error", function (err) {
    console.error(err);
  });
});

//listen on port
server.listen(config.port, function () {
  console.log(config.name+" is up on "+config.port);  
});
