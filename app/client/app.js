
var socket = io();

var canvas = document.getElementById('canvas-video');
var context = canvas.getContext('2d');
var img = new Image();
var privateMaskImg = new Image();
var pmImgLoaded = false;
var paint = false;

var boundingPoly = [];
var clickX = new Array();
var clickY = new Array();
var clickDrag = new Array();
var paint;
var editPM = false;
var editBP = false;

// show loading notice
context.fillStyle = '#333';
context.fillText('Loading...', canvas.width/2-30, canvas.height/3);

function draw(){
  if(pmImgLoaded) {
    context.drawImage(privateMaskImg, 0, 0, canvas.width, canvas.height);
  }
  
  context.strokeStyle = "#000000";
  context.lineJoin = "round";
  context.lineWidth = 5;
			
  for(var i=0; i < clickX.length; i++) {		
    context.beginPath();
    if(clickDrag[i] && i){
      context.moveTo(clickX[i-1], clickY[i-1]);
     }else{
       context.moveTo(clickX[i]-1, clickY[i]);
     }
     context.lineTo(clickX[i], clickY[i]);
     context.closePath();
     context.stroke();
  }

  if(boundingPoly.length > 2) {
    context.strokeStyle = "#ff0000";
    context.lineJoin = "round";
    context.lineWidth = 3;
    
    context.beginPath();    
    context.moveTo(boundingPoly[0].x, boundingPoly[0].y);
    for(var i=1; i < boundingPoly.length; i++) {
      context.lineTo(boundingPoly[i].x, boundingPoly[i].y);      
    }
    context.closePath();
    context.stroke();
  }
}

socket.on('frame', function (data) {
  var uint8Arr = new Uint8Array(data.buffer);
  var str = String.fromCharCode.apply(null, uint8Arr);
  var base64String = btoa(str);

  img.onload = function () {
    context.drawImage(this, 0, 0, canvas.width, canvas.height);
    draw();
  };
  img.src = 'data:image/jpg;base64,' + base64String;
});

function addClick(x, y, dragging)
{
  if(editBP) {
    boundingPoly.push({"x": x, "y": y});
  }
  else {
    clickX.push(x);
    clickY.push(y);
    clickDrag.push(dragging);
  }
}

$('#canvas-video').mousedown(function(e){
  paint = editPM;
  if(paint || editBP) {
    addClick(e.pageX - this.offsetLeft, e.pageY - this.offsetTop);
  }
}).mousemove(function(e){
  if(paint){
    addClick(e.pageX - this.offsetLeft, e.pageY - this.offsetTop, true);
  }
}).mouseup(function(e){
  paint = false;
}).mouseleave(function(e){
  paint = false;
});

$('#editPM').click(function(){
  editPM = true;
  editBP = false;
});
$('#clearPM').click(function(){
  editBP = false;
  editPM = false;
  pmImgLoaded = false;

  clickX = new Array();
  clickY = new Array();
  clickDrag = new Array();
});
$('#savePM').click(function(){
  socket.close(); // prevent redraw with live view
  
  context.clearRect(0, 0, canvas.width, canvas.height);
  draw();
  
  var dataURL = canvas.toDataURL();
  $.ajax({
      type: "POST", 
      url: "/savePM", 
      data: {img: dataURL}
  });

  clickX = new Array();
  clickY = new Array();
  clickDrag = new Array();
  socket.open();
});

$('#editBP').click(function(){
  editBP = true;
  editPM = false;  
});
$('#clearBP').click(function(){
  editBP = false;
  editPM = false;  

  boundingPoly = new Array();
});
$('#saveBP').click(function() {
  if(boundingPoly.length > 2) {
    $.ajax({
      url: "/boundingPoly",
      type: "POST",
      data: JSON.stringify(boundingPoly),
      contentType: 'application/json; charset=utf-8'});
  }
});

$('#liveView').click(function(){
  $.ajax({
    type: "POST", 
    url: "/liveView"
  });
});

$(function(){
  privateMaskImg.onload = function () {
    context.drawImage(this, 0, 0, canvas.width, canvas.height);
    pmImgLoaded = true;
  };
  privateMaskImg.src = '/privateMask.png';
});