const express = require('express');
const mqtt = require('mqtt');
const mongoose = require('mongoose');
const bodyparser = require('body-parser');
const path = require('path');
const http = require('http');
const app = express();
const socketIO = require('socket.io');
const port = 8000;
var data

const server = http.createServer(app);
const io = socketIO(server);

const Schema = mongoose.Schema;

const ZoneSchema = new Schema({
    startX: { type: Number, required: false },
    startY: { type: Number, required: false },
    endX: { type: Number, required: false },
    endY: { type: Number, required: false },
    name: { type: String, required: false }
});

const floorplan = new Schema({
    floorplan: { type: String, required: false },
    floorlevel: { type: Number, required: false },
    zones: [ZoneSchema]
});

const floorDetails = mongoose.model('floors', floorplan);

async function fetchFloorDetails() {
    try {
        const data = await floorDetails.find({});
        return data
    } catch (err) {
        console.error('Error:', err);
    }
}

mongoose.connect('mongodb+srv://pleasepeople123:VfLWNiTsHAUOZjkY@cluster0.75o7lsi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0').then(() => {
    console.log('connected to db');
}).catch(err => console.log(err));


// Connect to the MQTT broker
const client = mqtt.connect('mqtt://172.23.18.169');

// Create a schema for the sensor data
const sensorDataSchema = new mongoose.Schema({
    metaData: {
        floor: Number,
        zone: String
    },
    temperature: Number,
    timestamp: Date,
    setTemperature: Number,
    upperMargin: Number,
    lowerMargin: Number

});

// Create a model for the sensor data
const SensorData = mongoose.model('SensorDatas', sensorDataSchema);


//watch for changes on mongodb and emit the changes to the client
io.on('connection', (socket) => {
    SensorData.watch().on('change', async () => {
        io.emit('data');
    });
});

// Subscribe to the sensorReadings topic
client.on('connect', () => {
    client.subscribe('sensorReadings');
    console.log('connected to MQTT broker');
});

// Listen for messages on the sensorReadings topic
client.on('message', (topic, message) => {

    if (topic == 'sensorReadings') {
        data = JSON.parse(message);
        const newSensorData = new SensorData({
            metaData: {
                floor: 1,
                zone: data.zone
            },
            temperature: data.temperature,
            timestamp: new Date(),
            setTemperature: data.temperature_set_to,
            upperMargin: data.upper_margin,
            lowerMargin: data.lower_margin,
        });

        // Save the sensor data to MongoDB  

        newSensorData.save();
    }

});

// Fetch 50 latest sensor data from MongoDB 
async function getSensorData() {
    const data = await SensorData.find().sort({ timestamp: -1 });
    return data;
}


app.set('views', path.join(__dirname, 'website'));
app.use(express.static(path.join(__dirname, 'website')));
app.set('view engine', 'ejs');

app.use(bodyparser.json());


app.get('/', async (req, res) => {
    var floorDetails = await fetchFloorDetails();
    var sensorData = await getSensorData();

    res.render('floorview', { data: floorDetails, sensorData: sensorData });
});


app.get('/publish', (req, res) => {
    res.render('publish');
});


// start server on port 8000
server.listen(port, () => {
    console.log('server running on port ' + port);
});



app.post('/command', (req, res) => {
    // Handle sending command to MQTT broker
    // from req.body
    // Send the command to the MQTT broker using the appropriate method
    // Return the response to the client
});