// let the editor know that `Chart` is defined by some code
// included in another file (in this case, `index.html`)
// Note: the code will still work without this line, but without it you
// will see an error in the editor
/* global THREE */
/* global TransformStream */
/* global TextEncoderStream */
/* global TextDecoderStream */
'use strict';

// import * as THREE from 'three';
// import {OBJLoader} from 'objloader';

let port;
let reader;
let inputDone;
let outputDone;
let inputStream;
let outputStream;
let showCalibration = false;

let orientations = [0, 0, 0];
let quaternion  = [1, 0, 0, 0];
let calibration = [0, 0, 0, 0];

const maxLogLength  = 100;
const baudRates     = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 250000, 500000, 1000000, 2000000];

const log           = document.getElementById('log');
const butConnect    = document.getElementById('butConnect');
const butClear      = document.getElementById('butClear');
const baudRate      = document.getElementById('baudRate');
const autoscroll    = document.getElementById('autoscroll');
const showTimestamp = document.getElementById('showTimestamp');
const angleType     = document.getElementById('angle_type');
const lightSS       = document.getElementById('light');
const darkSS        = document.getElementById('dark');
const darkMode      = document.getElementById('darkmode');
// const canvas        = document.querySelector('#canvas');
const calContainer  = document.getElementById('calibration');
const logContainer  = document.getElementById("log-container");
const myInput       = document.getElementById('myInput');

// fitToContainer(canvas);

// function fitToContainer(canvas){
//   // Make it visually fill the positioned parent
//   canvas.style.width ='100%';
//   canvas.style.height='100%';
  
//   // ...then set the internal size to match
//   canvas.width  = canvas.offsetWidth;
//   canvas.height = canvas.offsetHeight;
// }

// let config = {responsive: true}
let config = {responsive: false}

let layout_xyz = {
  autosize: true,
  // margin: { t: 5, b: 5, l: 5, r: 5 },

  title: 'XYZ Plot',
  
  xaxis: {
    title: 'time',
    showgrid: false,
    zeroline: false
  },

  yaxis: {
    title: 'Magnetic Flux(uT)',
    showline: false
  }  
};

let trace_x = {
  // type: 'line',
  type: 'scattergl',
  // x: [0],
  y: [0],
  mode: 'lines',
  name: 'X',
  // fill: 'tozeroy',
  line: {
    // color: 'rgb(219, 64, 82)',
    width: 1
  }
};

let trace_y = {
  type: 'line',
  // type: 'scattergl',
  // x: [0],
  y: [0],
  mode: 'lines',
  name: 'Y',
  line: {
    // color: 'rgb(55, 128, 191)',
    width: 1
  }
};

let trace_z = {
  // type: 'line',
  type: 'scattergl',
  // x: [0],
  y: [0],
  mode: 'lines',
  name: 'Z',
  line: {
    // color: 'rgb(55, 128, 191)',
    width: 1
  }
};

// let data_xyz = [trace_x, trace_y, trace_z];
let data_xyz = [trace_x];

document.addEventListener('DOMContentLoaded', async () => {
  butConnect.addEventListener('click', clickConnect);
  butClear.addEventListener('click', clickClear);
  autoscroll.addEventListener('click', clickAutoscroll);
  showTimestamp.addEventListener('click', clickTimestamp);
  baudRate.addEventListener('change', changeBaudRate);
  angleType.addEventListener('change', changeAngleType);
  darkMode.addEventListener('click', clickDarkMode);
  myInput.addEventListener('keydown', writeCmd);

  if ('serial' in navigator) {
    const notSupported = document.getElementById('notSupported');
    notSupported.classList.add('hidden');
  }

  // if (isWebGLAvailable()) {
  //   const webGLnotSupported = document.getElementById('webGLnotSupported');
  //   webGLnotSupported.classList.add('hidden');
  // }

  // Plotly.newPlot('plot1', data_xyz, layout_xyz, config);

  initBaudRate();
  loadAllSettings();
  updateTheme();
  // await finishDrawing();
  // await render();
});

/**
 * @name connect
 * Opens a Web Serial connection to a micro:bit and sets up the input and
 * output stream.
 */
async function connect() {
  // - Request a port and open a connection.
  port = await navigator.serial.requestPort();

  // - Wait for the port to open.toggleUIConnected
  await port.open({ baudRate: baudRate.value });

  let decoder = new TextDecoderStream();
  inputDone   = port.readable.pipeTo(decoder.writable);
  inputStream = decoder.readable.pipeThrough(new TransformStream(new LineBreakTransformer()));

  const encoder = new TextEncoderStream();
  outputDone    = encoder.readable.pipeTo(port.writable);
  outputStream  = encoder.writable;

  reader = inputStream.getReader();

  readLoop().catch(async function(error) {
    toggleUIConnected(false);
    await disconnect();
  });
}

/**
 * @name disconnect
 * Closes the Web Serial connection.
 */
async function disconnect() {
  if (reader) {
    await reader.cancel();
    await inputDone.catch(() => {});
    reader = null;
    inputDone = null;
  }

  if (outputStream) {
    await outputStream.getWriter().close();
    await outputDone;
    outputStream = null;
    outputDone = null;
  }

  await port.close();
  port = null;
  showCalibration = false;
}

/**
 * @name readLoop
 * Reads data from the input stream and displays it on screen.
 */
async function readLoop() {
  while (true) {
    const {value, done} = await reader.read();

    if (value) {
      let plotdata;

      if (value.substr(0, 1) == "$") {
        orientations = value.substr(1).trim().split(" ").map(x=>+x);
      }

      if (value.substr(0, 12) == "Orientation:") {
        orientations = value.substr(12).trim().split(",").map(x=>+x);
      }
    
      if (value.substr(0, 11) == "Quaternion:") {
        quaternion = value.substr(11).trim().split(",").map(x=>+x);
      }
    
      if (value.substr(0, 12) == "Calibration:") {
        calibration = value.substr(12).trim().split(",").map(x=>+x);
        
        if (!showCalibration) {
          showCalibration = true;
          updateTheme();
        }
      }
    }

    Plotly.extendTraces('plot1', {y:[[orientations[0]], [orientations[1]], [orientations[2]]]}, [0, 1, 2], 300);
    
    if (done) {
      console.log('[readLoop] DONE', done);
      reader.releaseLock();
      break;
    }
  }
}

function logData(line) {
  // Update the Log
  if (showTimestamp.checked) {
    let d = new Date();
    let timestamp = d.getHours() + ":" + `${d.getMinutes()}`.padStart(2, 0) + ":" +
        `${d.getSeconds()}`.padStart(2, 0) + "." + `${d.getMilliseconds()}`.padStart(3, 0);

    log.innerHTML += '<span class="timestamp">' + timestamp + ' -> </span>';
    
    // Plotly.extendTraces('plot1', {x:[[d.getMilliseconds()], [d.getMilliseconds()], [d.getMilliseconds()]], y:[[orientations[0]], [orientations[1]], [orientations[2]]]}, [0, 1, 2], 300);
    
    d = null;
  }

  log.innerHTML += line+ "<br>";

  // Remove old log content
  if (log.textContent.split("\n").length > maxLogLength + 1) {
    let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
    
    log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
  }

  if (autoscroll.checked) {
    log.scrollTop = log.scrollHeight
  }
}

/**
 * @name updateTheme
 * Sets the theme to  Adafruit (dark) mode. Can be refactored later for more themes
 */
function updateTheme() {
  // Disable all themes
  document.querySelectorAll('link[rel=stylesheet].alternate').forEach((styleSheet) => {
      enableStyleSheet(styleSheet, false);
    });

  if (darkMode.checked) {
    enableStyleSheet(darkSS, true);
  } 
  else {
    enableStyleSheet(lightSS, true);
  }

  if (showCalibration && !logContainer.classList.contains('show-calibration')) {
    logContainer.classList.add('show-calibration')
  } 
  else if (!showCalibration && logContainer.classList.contains('show-calibration')) {
    logContainer.classList.remove('show-calibration')
  }
}

function enableStyleSheet(node, enabled) {
  node.disabled = !enabled;
}

/**
 * @name reset
 * Reset the Plotter, Log, and associated data
 */
async function reset() {
  // Clear the data
  log.innerHTML = "";
}

/**
 * @name clickConnect
 * Click handler for the connect/disconnect button.
 */
async function clickConnect() {
  if (port) {
    await disconnect();
    toggleUIConnected(false);
    return;
  }

  await connect();

  reset();

  toggleUIConnected(true);
}

/**
 * @name clickAutoscroll
 * Change handler for the Autoscroll checkbox.
 */
async function clickAutoscroll() {
  saveSetting('autoscroll', autoscroll.checked);
}

/**
 * @name clickTimestamp
 * Change handler for the Show Timestamp checkbox.
 */
async function clickTimestamp() {
  saveSetting('timestamp', showTimestamp.checked);
}

/**
 * @name changeBaudRate
 * Change handler for the Baud Rate selector.
 */
async function changeBaudRate() {
  saveSetting('baudrate', baudRate.value);
}

/**
 * @name changeAngleType
 * Change handler for the Baud Rate selector.
 */
async function changeAngleType() {
  saveSetting('angletype', angleType.value);
}

/**
 * @name clickDarkMode
 * Change handler for the Dark Mode checkbox.
 */
async function clickDarkMode() {
  updateTheme();
  saveSetting('darkmode', darkMode.checked);
}

/**
 * @name clickClear
 * Click handler for the clear button.
 */
async function clickClear() {
  reset();
}

async function finishDrawing() {
  return new Promise(requestAnimationFrame);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @name writeCmd
 * Gets a writer from the output stream and send the command to the Smart USB Dongle 2.0.
 * @param  {string} cmd command to send to the Smart USB Dongle 2.0
 */
function writeCmd(event) {
  // Write to output stream
  const writer = outputStream.getWriter();

  if (event.keyCode === 13) {
    console.log(myInput.value);
    
    writer.write(myInput.value + '\r');
    myInput.value = ''
  }

  // Ignores sending carriage return if sending Ctrl+C
  // if (cmd !== "\x03") {
    // writer.write("\r"); // Important to send a carriage return after a command
  // }
  
  writer.releaseLock();
}

/**
 * @name LineBreakTransformer
 * TransformStream to parse the stream into lines.
 */
class LineBreakTransformer {
  constructor() {
    // A container for holding stream data until a new line.
    this.container = '';
  }

  transform(chunk, controller) {
    this.container += chunk;
    const lines = this.container.split('\n');
    this.container = lines.pop();
    lines.forEach(line => {
      controller.enqueue(line)
      logData(line);
    });
  }

  flush(controller) {
    controller.enqueue(this.container);
  }
}

function toggleUIConnected(connected) {
  let lbl = 'Connect';

  if (connected) {
    lbl = 'Disconnect';
  }

  butConnect.textContent = lbl;
  
  updateTheme()
}

function initBaudRate() {
  for (let rate of baudRates) {
    var option = document.createElement("option");
    option.text = rate + " Baud";
    option.value = rate;
    baudRate.add(option);
  }
}

function loadAllSettings() {
  // Load all saved settings or defaults
  autoscroll.checked    = loadSetting('autoscroll', true);
  showTimestamp.checked = loadSetting('timestamp', false);
  baudRate.value        = loadSetting('baudrate', 9600);
  angleType.value       = loadSetting('angletype', 'quaternion');
  darkMode.checked      = loadSetting('darkmode', false);
}

function loadSetting(setting, defaultValue) {
  let value = JSON.parse(window.localStorage.getItem(setting));

  if (value == null) {
    return defaultValue;
  }

  return value;
}

// let isWebGLAvailable = function() {
//   try {
//     var canvas = document.createElement( 'canvas' );
//     return !! (window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
//   } 
//   catch (e) {
//     return false;
//   }
// }

function updateCalibration() {
  // Update the Calibration Container with the values from calibration
  const calMap = [
    {caption: "Uncalibrated",         color: "#CC0000"},
    {caption: "Partially Calibrated", color: "#FF6600"},
    {caption: "Mostly Calibrated",    color: "#FFCC00"},
    {caption: "Fully Calibrated",     color: "#009900"},
  ];
  
  const calLabels = [
    "System", "Gyro", "Accelerometer", "Magnetometer"
  ]

  calContainer.innerHTML = "";
  for (var i = 0; i < calibration.length; i++) {
    let calInfo = calMap[calibration[i]];
    let element = document.createElement("div");
    element.innerHTML = calLabels[i] + ": " + calInfo.caption;
    element.style = "color: " + calInfo.color;
    calContainer.appendChild(element);
  }
}

function saveSetting(setting, value) {
  window.localStorage.setItem(setting, JSON.stringify(value));
}

// let bunny;

// const renderer = new THREE.WebGLRenderer({canvas});

// const camera = new THREE.PerspectiveCamera(45, canvas.width/canvas.height, 0.1, 100);
// camera.position.set(0, 0, 30);

// const scene = new THREE.Scene();
// scene.background = new THREE.Color('black');

// {
//   const skyColor = 0xB1E1FF;  // light blue
//   const groundColor = 0x666666;  // black
//   const intensity = 0.5;
//   const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
//   scene.add(light);
// }

// {
//   const color = 0xFFFFFF;
//   const intensity = 1;
//   const light = new THREE.DirectionalLight(color, intensity);
//   light.position.set(0, 10, 0);
//   light.target.position.set(-5, 0, 0);
//   scene.add(light);
//   scene.add(light.target);
// }

// {
//   const objLoader = new OBJLoader();
//   objLoader.load('assets/bunny.obj', (root) => {
//     bunny = root;
//     scene.add(root);
//   });
// }

// function resizeRendererToDisplaySize(renderer) {
//   const canvas = renderer.domElement;
//   const width = canvas.clientWidth;
//   const height = canvas.clientHeight;
//   const needResize = canvas.width !== width || canvas.height !== height;
//   if (needResize) {
//     renderer.setSize(width, height, false);
//   }
//   return needResize;
// }

// async function render() {
//   if (resizeRendererToDisplaySize(renderer)) {
//     const canvas = renderer.domElement;
//     camera.aspect = canvas.clientWidth / canvas.clientHeight;
//     camera.updateProjectionMatrix();
//   }

//   if (bunny != undefined) {
//     if (angleType.value == "euler") {
//       if (showCalibration) {
//           // BNO055
//         let rotationEuler = new THREE.Euler(
//           THREE.MathUtils.degToRad(360 - orientations[2]),
//           THREE.MathUtils.degToRad(orientations[0]),
//           THREE.MathUtils.degToRad(orientations[1]),
//           'YZX'
//         );
//         bunny.setRotationFromEuler(rotationEuler);
//       } 
//       else {
//         let rotationEuler = new THREE.Euler(
//           THREE.MathUtils.degToRad(orientations[2]),
//           THREE.MathUtils.degToRad(orientations[0]-180),
//           THREE.MathUtils.degToRad(-orientations[1]),
//           'YZX'
//         );
//         bunny.setRotationFromEuler(rotationEuler);
//       }
//     } 
//     else {
//       let rotationQuaternion = new THREE.Quaternion(quaternion[1], quaternion[3], -quaternion[2], quaternion[0]);
//       bunny.setRotationFromQuaternion(rotationQuaternion);
//     }
//   }

//   renderer.render(scene, camera);
//   // Plotly.extendTraces('plot1', {y:[[orientations[0]], [orientations[1]], [orientations[2]]]}, [0, 1, 2], 300);
  
//   updateCalibration();
  
//   await sleep(10); // Allow 10ms for UI updates
//   await finishDrawing();
//   await render();
// }

function rand() {
  return Math.random();
}

Plotly.newPlot('plot1', [{
  y: [1,2,3].map(rand),
  mode: 'lines',
  line: {color: '#80CAF6'}
}]);

var cnt = 0;

var interval = setInterval(function() {

  Plotly.extendTraces('plot1', {
    y: [[orientations[0]]]
  }, [0])

  if(++cnt === 100) 
    clearInterval(interval);
}, 500);

// Plotly.newPlot('plot1', data_xyz, layout_xyz, config);
Plotly.newPlot('myDiv', data_xyz);
