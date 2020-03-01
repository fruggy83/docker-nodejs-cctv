// modules
var express     = require('express')  
  , http        = require('http')  
  , io          = require('socket.io');

var routes = require('./lib/routes/socket');

// configuration files
var configServer = require('./lib/config/server');

class Server{

  constructor(){
    this.app = express();
    this.http = http.createServer(this.app);
    this.io = io(this.http);

    this.config = new configServer(this.app);
  }

  setup(){
    this.app.use(express.static(this.config.staticFolder));
    new routes(this.app, this.io, this.config.staticFolder).setupRoutes();
  }

  appExecute(){
    
    this.setup();
    this.http.listen(this.config.httpPort, () => {
      console.log('HTTP server listening on port ' + this.config.httpPort);
    })
  }
}

const app = new Server();
app.appExecute();