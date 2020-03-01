var cv = require('opencv4nodejs'),
    request = require('request'),
    fs = require('fs'),
    bodyParser  = require("body-parser");  // post requests

// face detection properties
//var rectColor = [0, 255, 0];
//var rectThickness = 2;

// initialize camera

//camera.setWidth(camWidth);
//camera.setHeight(camHeight);

motionDetected = false;

class Routes {

  constructor(app, socket, staticFolder){
    this.app = app;
    this.socket = socket;
    this.staticFolder = staticFolder;

    // camera properties
    this.camWidth = 320;
    this.camHeight = 240;
    this.camFps = parseInt(process.env.CCTV_CAMFPS);
    this.camInterval = 1000 / this.camFps;
    
    
    this.camera = new cv.VideoCapture(process.env.CCTV_INPUTURL);
    this.camera.reset();
    this.connectionCounter = 0;
    
    this.detectionRunning = false;
    this.movementCnt = 0;
    
    this.intervalId = null;

    this.privateMask = null;
    this.privateOverlay = null;
    this.liveView = false;
  }

  appRoutes(){

    this.app.get('*', (req, res) => {
      res.sendFile('index.html', { root: this.staticFolder });
    });

    this.app.post('/movement', (req, res) => {
      this.detectionRunning = true;
      this.movementCnt = 0;
      this.startFrameGrabber();
      res.end('detection started');
    });

    this.app.post('/movementStop', (req, res) => {
      this.detectionRunning = false;     
      this.stopFrameGrabber();
      res.end('detection stopped');
    });

    this.app.post('/liveView', (req, res) => {
      this.liveView = true;
      console.log('enabled live view');
    });

    this.app.post("/savePM", bodyParser.urlencoded({ extended: false, limit: '16mb'}), (req, res) => {
      
      var base64Data = req.body.img.replace(/^data:image\/png;base64,/,"");
      console.log(base64Data);
      fs.writeFile(this.staticFolder + "/privateMask.png", base64Data, 'base64', function(err) {
        if(err){
          console.log(err);
        }
      });
    });

    this.app.post("/boundingPoly", bodyParser.json(), (req, res) => {
      if(req.body) {
        for(var point in req.body) {
          console.log("x: " + req.body[point].x + " y: " + req.body[point].y);
        }
      } else {
        console.log("body undef");
      }
    });
  }
  socketEvents(){    

    this.socket.on('connection', (io) => {
      this.log('new socket.io connection established');
      this.connectionCounter++;
      this.startFrameGrabber();
      
      io.on('disconnect', () => {
        this.log('socket.io connection disconnected');
        this.connectionCounter--;
        this.stopFrameGrabber();
      });
    });
  }

  startFrameGrabber(){
    if(this.intervalId) {
      this.log('frameGrabber already running');
      return;
    }

    // load privateMask
    try {
      this.privateOverlay = cv.imread(this.staticFolder + "/privateMask.png", -1);
      if(this.privateOverlay.channels == 4) {
        this.log("found 4 channels");

        let cs = this.privateOverlay.splitChannels();
        // just take alpha channel as overlay and invert to get a pure black overlay
        this.privateOverlay = (new cv.Mat([cs[3], cs[3], cs[3]])).bitwiseNot();
        this.privateMask = cs[3];
      } else {
        this.privateOverlay = null;
      }
    } catch (e) {
      this.privateOverlay = null;
    }


    this.liveView = false;
    this.camera.reset();
    this.intervalId = setInterval(() => { this.frameGrabber(); }, this.camInterval);
    this.log('frameGrabber started');
  }

  stopFrameGrabber(){
    if(this.connectionCounter <= 0 && !this.detectionRunning && this.intervalId){
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.log('frameGrabber stopped');
    } else {
      this.log(`open connections: ${this.connectionCounter}, detection running: ${this.detectionRunning}`);
    }
  }

  frameGrabber(){
    let frame = this.camera.read();
    // loop back to start on end of stream reached
		if (frame.empty) {
		  this.camera.reset();
		  frame = this.camera.read();
     }

     this.processFrame(frame, (result, movementDetected) => {

      let privateResult = result.copy();
      if(this.privateOverlay) {
        privateResult = this.privateOverlay.copyTo(privateResult, this.privateMask);
      }

      if(this.connectionCounter){
        if(this.liveView) {
          this.socket.emit ('frame', { buffer: cv.imencode('.jpg', result)});
        } else {
          this.socket.emit ('frame', { buffer: cv.imencode('.jpg', privateResult)});
        }
      }

      if(this.detectionRunning && movementDetected && ++this.movementCnt >= this.camFps) {
        var imageData = 'data:image/jpeg;base64,';
        imageData += cv.imencode('.jpg', privateResult).toString('base64');

        request({
          method: 'PUT',
          uri: process.env.CCTV_OUTPUTURL, 
          header: { 'Content-Type': 'text/plain' },
          body: imageData
          }, (err, res, body) => {
          if(err){
            if(res) {
              this.log(res.statusCode);
            }
            this.log(body);
          } else{              
            this.log('movement posted');
          }
        });
      }
      else if(movementDetected) {
        this.log('ignored detected movement');
        return;
      }
      
      this.movementCnt = 0;
    });
  }

  processFrame(frame, callback){
    
    var gray = frame.cvtColor(cv.COLOR_BGR2GRAY);
    gray = gray.gaussianBlur(new cv.Size(21, 21), 0);

    if(!this.avg){
      this.avg = gray;
      return;
    }
       
    this.avg = this.avg.addWeighted(0.5, gray, 0.5, 0);
    var delta = gray.absdiff(this.avg.convertScaleAbs(1.0, 0));

    var thresh = delta.threshold(5, 255, cv.THRESH_BINARY);
    thresh = thresh.dilate(
      cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(4, 4)),
      new cv.Point(-1, -1),
      2
    );

    var contours = thresh.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    var movementDetected = false;
    if(contours){
      //console.log('num of cnt: ' + contours.length);
      contours.forEach(cnt => {
        if(cnt.area < 500) {
          //console.log('ignore cnt: ' + cnt.area);
          return;
        }

        //log('draw cnt: ' + cnt.area);
        var rect = cnt.boundingRect();
        frame.drawRectangle(rect, new cv.Vec(0, 255, 0), 2)
        movementDetected = true;
      });
    }
    else {
      //console.log('no cnt found');
    }
    
    const frameResized = frame.resize(480, 640);
    callback(frameResized, movementDetected);
  }

  log(text){
    var currentTime = new Date().toLocaleString();
    console.log(`${currentTime} - ${text}`);
  }

  setupRoutes(){
    this.appRoutes();
    this.socketEvents();
  }
}

module.exports = Routes;
