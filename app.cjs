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
const EventEmitter = require('events');
const server = http.createServer(app);
const io = socketIO(server);
const emitter = new EventEmitter();
const Schema = mongoose.Schema;
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

const ZoneSchema = new Schema({
    xCords: { type: Array, required: false },
    yCords: { type: Array, required: false },
    startX: { type: Number, required: false },
    startY: { type: Number, required: false },
    endX: { type: Number, required: false },
    endY: { type: Number, required: false },
    name: { type: String, required: false },
    shape: { type: String, required: true },
});

const floorplan = new Schema({
    floorplan: { type: String, required: false },
    floorlevel: { type: String, required: false },

    zones: [ZoneSchema]
});

const floorDetails = mongoose.model('floors', floorplan);
EventEmitter.defaultMaxListeners = 20;
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
        floor: String,
        floor: Number,
        zone: String
    },
    temperature: Number,
    timestamp: Date,
    setTemperature: Number,
    upperMargin: Number,
    lowerMargin: Number,
    humidity: Number,

});

// Create a model for the sensor data
const SensorData = mongoose.model('sensordatas', sensorDataSchema);


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
io.on('connection', async (socket) => {


    socket.on('test', () => {
        console.log('test');

    })

    socket.on('change', (data) => {
        setTemp = JSON.parse(JSON.stringify(data));
        dataSend = "set_temp_" + setTemp.temperature + ',' + "set_error_high_" + setTemp.margin + ',' + "set_error_low_" + setTemp.margin;
        console.log('Temperature:', data.temperature);
        client.publish('coolerControl', dataSend);
    });

    socket.on('floorplan', async (data) => {
        console.log('floorplan', data);
        const { floorplan, zones, floorlevel } = data;
        FinZone = [];
        for (var zone in zones) {
            var tempZone = zones[zone];
            tempZone.name = zone;
            console.log('tempZone', tempZone)
            FinZone.push(tempZone)
        }
        console.log('zone', FinZone)
        var newFloor = new floorDetails({
            zones: FinZone,
            floorplan: floorplan,
            floorlevel: floorlevel,
        })
        await newFloor.save();
        console.log('newFloor', newFloor)
        socket.emit("ready", { message: "Floorplan saved" });
    });

    sensorData = await getSensorData();
});

// Subscribe to the sensorReadings topic
client.on('connect', () => {
    client.subscribe('sensorReadings');
    console.log('connected to MQTT broker');
});

var savetime
// Listen for messages on the sensorReadings topic
client.on('message', async (topic, message) => {
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
            humidity: data.humidity
        });

        // Save the sensor data to MongoDB  
        var currenttime = new Date();
        if (currenttime - savetime > 60000) { //300000ms = 5 minutes
            newSensorData.save().then(() => {
                savetime = new Date();
            });
            sensorData = await SensorData.find().sort({ timestamp: -1 }).limit(50);
            dynoSensorData = sensorData;
            io.emit('sensorData', { sensorData: sensorData });
            console.log('saved');
        } else if (savetime == undefined) {
            newSensorData.save().then(() => {
                savetime = new Date();
            });
            sensorData = await SensorData.find().sort({ timestamp: -1 }).limit(50);
            dynoSensorData = sensorData;
            io.emit('sensorData', { sensorData: sensorData });
            console.log('saved undefined');
        } else {
            const newSensorDataObject = newSensorData.toObject();
            dynoSensorData.unshift(newSensorDataObject);
            console.log(sensorData.length - dynoSensorData.length);
            io.emit('sensorData', { sensorData: dynoSensorData });
            console.log('emitted');

        }
    }
});

// Fetch 50 latest sensor data from MongoDB 
async function getSensorData() {
    //limit to 1200 for 
    var data = await SensorData.find().sort({ timestamp: -1 }).limit(50);
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

app.get('/converter', (req, res) => {
    console.time('Time taken to fetch floor details');
    res.render('converter');
});

app.get('/Floorview', async (req, res) => {
    var floorDetails = await fetchFloorDetails();
    var sensorData = await getSensorData();

    res.render('floorview', { data: floorDetails, sensorData: sensorData });
});

app.get('/publish', (req, res) => {
    res.render('publish');
});

app.get('/moreDetails', async (req, res) => {
    console.log('moreDetails')
    var { zone, floorlevel } = req.query;

  
    var data = await SensorData.find({ 'metaData.zone': "Zone1", "metaData.floor": 1 }).sort({ timestamp: -1 }).limit(50);
    console.log(data);
    res.render('moreDetails', { data: data, zone: zone, floorlevel: floorlevel });

});

// start server on port 8000
server.listen(port, () => {
    console.log('server running on port ' + port);
});
