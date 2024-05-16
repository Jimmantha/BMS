const express = require('express');
const mongoose = require('mongoose');
const bodyparser = require('body-parser');
const path = require('path');
const app = express();
const port = 1883;

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

app.set('views', path.join(__dirname, 'website'));
app.use(express.static(path.join(__dirname, 'website')));
app.set('view engine', 'ejs');

app.use(bodyparser.json());

app.get('/', async (req, res) => {
    const data = await fetchFloorDetails();
    res.render('floorview', { data: data });
    console.log("data:", data)
});

app.listen(port, () => {
    console.log('server running on port', port);
});
