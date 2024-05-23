const express = require('express');
const mqtt = require('mqtt');
const mongoose = require('mongoose');
const bodyparser = require('body-parser');
const path = require('path');
const app = express();
const port = 8000;
var data

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

mongoose.connect('mongodb://localhost:27017/').then(() => {
    console.log('connected to db');
}).catch(err => console.log(err));


// Connect to the MQTT broker
const client = mqtt.connect('mqtt://172.23.18.169');

// Create a schema for the sensor data
const sensorDataSchema = new mongoose.Schema({
    metaData: {
        floor: Number,
        zone: Number
    },
    temperature: Number,
    timestamp: Date,
    setTemperature: Number,
    upperMargin: Number,
    lowerMargin: Number

});

// Create a model for the sensor data
const SensorData = mongoose.model('SensorData', sensorDataSchema);

// Handle connection event
client.on('connect', () => {
    console.log('Connected to MQTT broker');

    client.subscribe('sensorReadings');
});



client.on('message', (topic, message) => {
    data = JSON.parse(message);
    const newSensorData = new SensorData({
        metaData: {
            floor: 1,
            zone: 1
        },
        temperature: data.temperature,
        timestamp: new Date(),
        setTemperature: data.temperature_set_to,
        upperMargin: data.upper_margin,
        lowerMargin: data.lower_margin,
    });

    // Save the sensor data to MongoDB
    newSensorData.save();
});

function getSensorData() {
    const data = SensorData.find({ metaData: { floor: 1, zone: 1 } });
    return data;
}


app.set('views', path.join(__dirname, 'website'));
app.use(express.static(path.join(__dirname, 'website')));
app.set('view engine', 'ejs');

app.use(bodyparser.json());

app.get('/', async (req, res) => {
    const floorDetails = await fetchFloorDetails();
    const sensorData = await getSensorData();
    res.render('floorview', { data: floorDetails, sensorData: sensorData });
});

app.get('/publish', (req, res) => {
    res.render('publish');
});

app.listen(port, () => {
    console.log('server running on port', port);
});


