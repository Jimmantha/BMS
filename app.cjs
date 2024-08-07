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
const EventEmitter = require('events');
const server = http.createServer(app);
const io = socketIO(server);
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
    shape: { type: String, required: false },
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
EventEmitter.defaultMaxListeners = 20;//socket: increase max listeners

async function fetchFloorDetails() {
    try {
        const data = await floorDetails.find({});
        return data
    } catch (err) {
        console.error('Error:', err);
    }
}


// insert mongodb and cliebt.connect here

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
    Status: Boolean,
    mainFanState: String,
    houseFanState: String,
});

const energyReading = new mongoose.Schema({
    metaData: {
        floor: Schema.Types.Mixed,
    },
    energy: Number,
    voltage: Number,
    current: Number,
    powerFactor: Number,
    timestamp: Date,
    State: Boolean
});

// Create a model for the sensor data
const SensorData = mongoose.model('sensordatas', sensorDataSchema);
const EnergyReading = mongoose.model('energyreadings', energyReading);


// Handle sending command to MQTT broker
// from req.body
// Send the command to the MQTT broker

//watch for changes on mongodb and emit the changes to the client
io.on('connection', async (socket) => {


    socket.on('test', () => {
        console.log("test");

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
            client.publish('coolerControl', 'led1_on');
        } else {
            client.publish('coolerControl', 'led1_off');
        }
        await updateZoneTemperature(data.floor, data.zone, setTemp);
        await updateZoneAirconState(data.floor, data.zone, data.airconState);
        await updateZoneLightState(data.floor, data.zone, data.lightState);
        sensorSaveTime = undefined;
        repeat = 3;
        io.emit('floorDetails', { floorlevel: data.floor, zone: data.zone, setTemperature: setTemp, airconState: data.airconState, lightState: data.lightState });
    });

    socket.on('submit', async (data) => {
        console.log('floorplan', data);
        var { floorplan, zones, floorlevel } = data;
        floorlevel = floorlevel.toString();
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
        await floorDetails.deleteOne({ 'floorlevel?': data.f });
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
var repeat = 0;
var energySaveTime
// Listen for messages on the sensorReadings topic
client.on('message', async (topic, message) => {
    console.log('received message on topic:', topic);
    if (topic == 'sensorReadings') {
        data = JSON.parse(message);
        var date = new Date(Date.now());
        var status = data.aircon_status;
        var floor = data.Floor;
        try {
            var zones = await floorDetails.find({ 'floorlevel': floor }, { 'zones.setTemperature': 1, 'zones.airconState': 1, 'zones.lightState': 1, "_id": 0 });
            console.log(zones)
        }
        catch (error) {
            console.log("floor and/or zone not found in database")
            return
        }

        zones = JSON.parse(JSON.stringify(zones)); //need convert to json

        var setTemp = zones[0].zones[0].setTemperature;
        var airconState = zones[0].zones[0].airconState;
        var lightState = zones[0].zones[0].lightState;


        if (setTemp != data.temperature_set_to) {
            console.log(data.temperature_set_to, setTemp)
        console.log("set temp to", setTemp)
            client.publish('coolerControl', 'set_temp_' + setTemp);
        }
        if (airconState != status) {
            if (status == true) {
                client.publish('coolerControl', 'on');
            } else {
                client.publish('coolerControl', 'off');
            }
        }
        if (lightState != data.LED1_status) {
            if (lightState == true) {
                client.publish('coolerControl', 'led1_on');
            } else {
                client.publish('coolerControl', 'led1_off');
            }
        }
        console.log(data.LED1_status, lightState)
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
            mainFanState: data.main_fan_state,
            houseFanState: data.house_fan_state,
            airconState: airconState,
            lightState: lightState,
        });
        console.log('newSensorData', data.main_fan_state,data.house_fan_state)
        console.log('newSensorData', newSensorData)

        // Save the sensor data to MongoDB
        var currenttime = new Date();
        console.log(currenttime, sensorSaveTime, data.temperature_set_to)
        if(repeat > 0){
            await newSensorData.save().then(async () => {
                sensorSaveTime = new Date();
                data = await getSensorData();
                io.emit('sensorData', { sensorData: data });
                repeat--;
                console.log('repeat', repeat)
            });
        }
        else if (currenttime - sensorSaveTime > 60000) { //300000ms = 5 minutes
            await newSensorData.save().then(async () => {
                sensorSaveTime = new Date();
                data = await getSensorData();
                io.emit('sensorData', { sensorData: data });
                console.log('saved sensor reading');
            });
        } else if (sensorSaveTime == undefined) {
            await newSensorData.save().then(async () => {
                sensorSaveTime = new Date();
                data = await getSensorData();
                io.emit('sensorData', { sensorData: data });
                console.log('saved when save time undefined');
            });
        }


    }
    if (topic == 'energyReadings') {
        data = JSON.parse(message);
        energy = data.energy.toFixed(2);
        voltage = data.voltage.toFixed(2);
        current = data.current.toFixed(2);
        powerFactor = data.power_factor.toFixed(2);
        console.log(data);
        var date = new Date(Date.now());
        date.setHours(date.getHours());
        const newEnergyReading = new EnergyReading({
            metaData: {
                floor: 1,
                zone: "Zone1"
            },
            energy: energy,
            voltage: voltage,
            current: current,
            powerFactor: powerFactor,
            timestamp: new Date(),
        });
        var currenttime = new Date();
        if (currenttime - energySaveTime > 60000) { //300000ms = 5 minutes
            await newEnergyReading.save().then(async () => {
                energySaveTime = new Date();
                data = await getEnergyData();
                io.emit('energyData', { energyData: data });
            });
            console.log('saved energy reading');
        } else if (energySaveTime == undefined) {
            await newEnergyReading.save().then(async () => {
                energySaveTime = new Date();
                data = await getEnergyData();
                io.emit('energyData', { energyData: data });
            });
            console.log('saved undefined');
        }

    }
});

// Fetch 50 latest sensor data from MongoDB
async function getSensorData() {
    //limit to 1200 for
    var twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    var data = await SensorData.find({ timestamp: { $gte: twentyFourHoursAgo } }).sort({ timestamp: -1 });
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
