node-autoscaler
===============

scale across processes

## Options

currently the autoscale cli takes the following:

  + `name:string` - the name of your scaler (for logging only)
  + `port:number` - the port to listen on
  + `max:number` - the max number of processes
  + `min:number` - the min number of processes
  + `method:string` - the scaling method ('round robin','memory','uptime')
  + `entry:string` - the entry module location path
  + `verbose:bool` - write logs?


It's important to note that method does require some code augmentation to the process
we want to scale. If the child is starting to get overwhelmed, you should send a `full:true`
message to the scaler. Furthermore, if you send use a scaling method of `memory`, or `uptime`
and you don't send `memory:number` and/or `uptime:number` messages (perhaps every tick?) then
the scaler won't know how to provision, and will simply send traffic to the first created non-full
process.  

__tl;dr__: send messages `memory` or `uptime` from `process.send(...)` in the child if you're using
`method:(memory|uptime)`.

## Messages

The child process can `process.send(...)` messages to the autoscaler to help it do it's job!

currently you can send the following to the autscaler:

  + `full:bool` - identifies whether the child is full (and can/cannot handle more requests)
  + `memory:number` - identifies memory usage of child. number is from `process.memoryUsage().heapTotal`
  + `uptime:number` - identifies ms uptime of child. number is from `process.uptime()`
