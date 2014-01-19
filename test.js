var http = require("http"),
  requestCount = 0;

//this leaks memory, so don't do this in real production, obvs
//find a better way to send these stats messages
(function(){
  var repeat = function() {
    setImmediate(function() {
      if (typeof process.send == "function") {
        process.send({memory:process.memoryUsage().heapTotal,uptime:process.uptime()});
        repeat();
      }
    });
  };
  repeat();
})();

//create a server, and increment requestCount when it's hit
var server = http.createServer(function (request, response) {
  requestCount++;
  if (requestCount > 3 && typeof process.send == "function") {
    process.send({full:true}); //if we send true, new reqs won't get sent here. if we did true, and we do false, itll be reset, and we'll get em again
  }
  response.writeHead(200, {"Content-Type": "text/plain"});
  response.end("Hello World\n");
});

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(process.argv[5]);

// Put a friendly message on the terminal
console.log("Server running at http://127.0.0.1:"+process.argv[5]+"/");