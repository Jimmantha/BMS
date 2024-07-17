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
    airconState: { type: Boolean, required: false },
    setTemperature: { type: Number, required: false },
    lightState: { type: Boolean, required: false },
    orginalMapWidth: { type: Number, required: false },
    orginalMapHeight: { type: Number, required: false },
    orginalImageWidth: { type: Number, required: false },
    orginalImageHeight: { type: Number, required: false },
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

//172.23.18.169:1883 dev mqtt broker address 
//172.23.16.143:1883 dev mqtt broker address 
// Connect to the MQTT broker
const client = mqtt.connect('mqtt://localhost:1883');

// Create a schema for the sensor data
const sensorDataSchema = new mongoose.Schema({
    metaData: {
        floor: Schema.Types.Mixed,
        zone: String
    },
    temperature: Number,
    timestamp: Date,
    setTemperature: Number,
    upperMargin: Number,
    lowerMargin: Number,
    humidity: Number,
    Status: Boolean
});

const energyReading = new mongoose.Schema({
    metaData: {
        floor: Schema.Types.Mixed,
    },
    energy: Number,
    timestamp: Date,
    State: Boolean
});

// Create a model for the sensor data
const SensorData = mongoose.model('sensordatas', sensorDataSchema);
const EnergyReading = mongoose.model('energyreadings', energyReading);


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

    socket.on('change', async (data) => {
        setTemp = data.setTemperature;
        console.log(data)
        dataPayload = "set_temp_" + setTemp;
        console.log('set_temp_' + setTemp)
        console.log('data.airconState', data.airconState)
        if (data.airconState == "true" || data.airconState == true) {
            client.publish('coolerControl', 'on');
        } else {
            client.publish('coolerControl', 'off');
        }
        if (data.lightState == "true" || data.lightState == true) {
            client.publish('lightControl', 'on');
        } else {
            client.publish('lightControl', 'off');
        }
        await updateZoneTemperature(data.floor, data.zone, setTemp);
        await updateZoneAirconState(data.floor, data.zone, data.airconState);
        await updateZoneLightState(data.floor, data.zone, data.lightState);
        io.emit('floorDetails', { floorlevel: data.floor, zone: data.zone, setTemperature: setTemp, airconState: data.airconState, lightState: data.lightState });
    });

    socket.on('submit', async (data) => {
        console.log('floorplan', data);
        const { floorplan, zones, floorlevel } = data;
        FinZone = [];
        for (var zone in zones) {
            var tempZone = zones[zone];
            tempZone.name = zone;
            tempZone.setTemperature = 20;
            tempZone.airconState = false;
            tempZone.lightState = false;
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
        socket.emit("ready", { message: "Floorplan saved" });

    });

    socket.on('deleteFloor', async (data) => {
        console.log('delete', data)
        await floorDetails.deleteOne({ 'floorlevel': data.floorlevel });
        socket.emit("delete", { message: "Floorplan deleted" });
    });

    socket.on("getFloorNames", async () => {
        var data = await floorDetails.find({}, 'floorlevel');
        var floorlevels = data.map((item) => item.floorlevel);

        socket.emit("names", { floorlevel: floorlevels });
    })


    sensorData = await getSensorData();
});

//function to update document in mongodb
const updateZoneTemperature = async (floor, zoneName, setTemp) => {
    console.log('updateZoneTemperature', floor, zoneName, setTemp)
    try {
        const updatedZone = await floorDetails.findOneAndUpdate(
            { 'zones.name': zoneName, 'floorlevel': floor },
            { $set: { 'zones.$.setTemperature': setTemp } },
            { new: true }
        );
    } catch (err) {
        console.error(err);
    }
};

//function to update document in mongodb
const updateZoneAirconState = async (floor, zoneName, status) => {
    console.log('updateZoneStatus', floor, zoneName, status)
    try {
        const updatedZone = await floorDetails.findOneAndUpdate(
            { 'zones.name': zoneName, 'floorlevel': floor },
            { $set: { 'zones.$.airconState': status } },
            { new: true }
        );
    } catch (err) {
        console.error(err);
    }
};

//function to update document in mongodb
const updateZoneLightState = async (floor, zoneName, status) => {
    console.log('updateZoneStatus', floor, zoneName, status)
    try {
        const updatedZone = await floorDetails.findOneAndUpdate(
            { 'zones.name': zoneName, 'floorlevel': floor },
            { $set: { 'zones.$.lightState': status } },
            { new: true }
        );
    } catch (err) {
        console.error(err);
    }
}



// Subscribe to the sensorReadings topic
client.on('connect', () => {
    console.log('connected to MQTT broker');
    client.subscribe('sensorReadings');
    client.subscribe('energyReadings');
});

var sensorSaveTime
var energySaveTime
// Listen for messages on the sensorReadings topic
client.on('message', async (topic, message) => {
    console.log('received message on topic:', topic);
    if (topic == 'sensorReadings') {
        data = JSON.parse(message);
        var date = new Date(Date.now());
        var status = data.aircon_status;
        var floor = data.Floor.toString();
        var zones = await floorDetails.find({ 'floorlevel': floor }, { 'zones.setTemperature': 1, 'zones.airconState': 1, "_id": 0 });
        zones = JSON.parse(JSON.stringify(zones)); //need convert to json
        var setTemp = zones[0].zones[0].setTemperature;
        var airconState = zones[0].zones[0].airconState;
        if (setTemp != data.temperature_set_to) {
            console.log('set_temp_' + setTemp)
            client.publish('coolerControl', 'set_temp_' + setTemp);
        }
        if (airconState != data.aircon_status_) {
            if (data.aircon_status_ == true) {
                client.publish('coolerControl', 'on');
            } else {
                client.publish('coolerControl', 'off');
            }
        }
        const newSensorData = new SensorData({
            metaData: {
                floor: floor,
                zone: data.zone
            },
            temperature: data.temperature,
            timestamp: date,
            setTemperature: data.temperature_set_to,
            upperMargin: data.upper_margin,
            lowerMargin: data.lower_margin,
            humidity: data.humidity,
            airconState: airconState
        });

        // Save the sensor data to MongoDB  
        var currenttime = new Date();

        if (currenttime - sensorSaveTime > 10000) { //300000ms = 5 minutes
            await newSensorData.save().then(() => {
                sensorSaveTime = new Date();
            });
        } else if (sensorSaveTime == undefined) {
            await newSensorData.save().then(() => {
                sensorSaveTime = new Date();
            });
        }
        data = await getSensorData();
        io.emit('sensorData', { sensorData: data });
    }
    if (topic == 'energyReadings') {
        data = JSON.parse(message);
        energy = data.energy.toFixed(2);
        console.log(data);
        var date = new Date(Date.now());
        date.setHours(date.getHours());
        const newEnergyReading = new EnergyReading({
            metaData: {
                floor: 1,
                zone: "Zone1"
            },
            energy: energy,
            timestamp: new Date(),
        });
        var currenttime = new Date();
        if (currenttime - energySaveTime > 10000) { //300000ms = 5 minutes
            await newEnergyReading.save().then(() => {
                energySaveTime = new Date();
            });
            console.log('saved energy reading');
        } else if (energySaveTime == undefined) {
            await newEnergyReading.save().then(() => {
                energySaveTime = new Date();
            });
            console.log('saved undefined');
        }
        data = await getEnergyData();
        io.emit('energyData', { energyData: data });
    }
});

// Fetch 50 latest sensor data from MongoDB 
async function getSensorData() {
    //limit to 1200 for 
    var data = await SensorData.find().sort({ timestamp: -1 });
    return data;
}

async function getEnergyData() {
    var data = await EnergyReading.find().sort({ timestamp: -1 });
    return data;
}




app.set('views', path.join(__dirname, 'website'));
app.use(express.static(path.join(__dirname, 'website')));
app.set('view engine', 'ejs');

app.use(bodyparser.json());


app.get('/', async (req, res) => {
    var floorDetails = await fetchFloorDetails();
    var sensorData = await getSensorData();
    var energyData = await getEnergyData();

    res.render('overview', { data: floorDetails, sensorData: sensorData, energyData: energyData });
});

app.get('/converter', (req, res) => {
    console.time('Time taken to fetch floor details');
    res.render('converter');
});

app.get('/Floorview', async (req, res) => {
    var floorDetails = await fetchFloorDetails();
    var sensorData = await getSensorData();
    var energyData = await getEnergyData();

    res.render('floorview', { data: floorDetails, sensorData: sensorData, energyData: energyData });
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