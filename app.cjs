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
var moment = require('moment-timezone');
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
const client = mqtt.connect('mqtt://localhost:1883');

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

// Handle sending command to MQTT broker
// from req.body
// Send the command to the MQTT broker
// To Include:
// message pairs (topic: :"coolerControl")
//"Increase temperature" "up"
//"Decrease temperature" "down"
//"Set temperature" "number" "max 30 min 16" DONE
//  "Set upper margin" "set_error_high_"
//  "Set lower margin" "set_error_low_" 

//watch for changes on mongodb and emit the changes to the client
io.on('connection', (socket) => {
    SensorData.watch().on('change', async () => {
        io.emit('data');
    });
    socket.on('setTemperature', (data) => {
        setTemp = JSON.parse(JSON.stringify(data));
        //{"temperature":"25"}
        dataSend = "set_temp_" + setTemp.temperature;
        console.log('Temperature:', data.temperature);
        client.publish('coolerControl', dataSend);
    });
    socket.on('setUpperMargin', (data) => {
        setUpper = JSON.parse(JSON.stringify(data));
        //{"upperMargin":"25"}
        dataSend = "set_error_high_" + setUpper.upperMargin;
        console.log('Upper Margin:', data.upperMargin);
        client.publish('coolerControl', dataSend);
    }
    );
    socket.on('setLowerMargin', (data) => {
        setLower = JSON.parse(JSON.stringify(data));
        //{"lowerMargin":"25"}
        dataSend = "set_error_low_" + setLower.lowerMargin;
        console.log('Lower Margin:', data.lowerMargin);
        client.publish('coolerControl', dataSend);
    }
    );
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
        var date = new Date(Date.now());
        date.setHours(date.getHours() + 8);
        // issue inserting date.now() into mongodb changes back to gmt tho the date is correct for now manually add 8 hours to get the correct time
        const newSensorData = new SensorData({
            metaData: {
                floor: 1,
                zone: data.zone
            },
            temperature: data.temperature,
            timestamp: date,
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
    //limit to 1200 for 
    const data = await SensorData.find().sort({ timestamp: -1 }).limit(50);
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




