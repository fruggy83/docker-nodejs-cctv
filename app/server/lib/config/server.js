var path = require('path')

class Config{

  constructor(app){
    this.httpPort = 3000;
    this.staticFolder = path.join(__dirname + '/../../../client');
  }
}

module.exports = Config;
