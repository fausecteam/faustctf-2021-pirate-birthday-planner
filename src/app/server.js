'use strict';

const express = require('express');
const mongoose = require('mongoose');
const crypto = require("crypto");
const favicon = require('serve-favicon');
const cookieSession = require('cookie-session')
const { v4: uuidv4 } = require('uuid');
const { validate: uuidValidate } = require('uuid');

const PORT = 80;
const HOST = '::';

// MongoDB starts to slow the first time
mongoose.Promise = global.Promise;
const connectWithRetry = function () {
    return mongoose.connect("mongodb://mongo:27017/db", { useNewUrlParser: true })
        .then(() => console.log('MongoDB Connected'))
        .catch(() => setTimeout(connectWithRetry, 2000));
}
connectWithRetry();

// SessionIDs can be found at demo.faustctf.net/competition/teams.json 
// One example id: e66699db-29bd-436b-b2ad-e971f66fbc85

const app = express();
app.set("view engine", "pug");
app.set("views", "./views");

app.use(favicon('public/favicon.ico'));
app.use('/static', express.static('public'));

app.use(express.urlencoded());
app.use(express.json());
app.use(cookieSession({
    name: 'session',
    keys: [uuidv4()],
    httpOnly: true
}))


const Party = mongoose.model('Party', {
    uuid: {
        type: String,
        unique: true
    },
    title: String,
    description: String,
    time: String,
    loc: String,
    guestlist: [{
        name: String,
        pin: String
    }],
    joined: [String],
    admin: String
});

const parties = new Map();

// Is this really military-grade encryption? (ap)
// I don't know, but I think helps against MitM attacker and their tools (tr)
// Ok, thanks :) (ap)
const enc = (a, x) => {
    let r = []
    for (let i=0; i<a.length; i++)
        r.push(a.charCodeAt(i) ^ x.charCodeAt(0));
    return Buffer.from(r).toString('base64');
};

app.get('/', (req, res) => {
    const error = req.query.e;
    res.render('index', {error: error});
});

app.get('/logout', (req, res) => {
    req.session = null;
    const redirect = req.query.r;
    if (redirect && uuidValidate(redirect))
        return res.redirect('/party/' + redirect);
    return res.redirect('/');
});

// Check if party exists
app.use('/party/:partyId', async function (req, res, next) {
    const partyId = req.params['partyId'];
    if (uuidValidate(partyId) == false) {
        return res.redirect('/?e=your party must be UUID, aye');
    }

    const party = await Party.find({ "uuid": partyId });
    if (party) {
        req.party = party[0];
        return next();
    }
    return res.redirect('/??e=your party is a lie!');
});

// Check if user is on the guestlist
app.use('/party/:partyId', async function (req, res, next) {
    const partyId = req.params['partyId'];
    const user = req.session.user;
    const pin = req.session.pin;

    const query = {
        "uuid": partyId,
        "guestlist.name": user,
        "guestlist.pin": pin
    };

    if (user != undefined && pin != undefined) {
        const party = await Party.exists(query);
        if (party) {
            req.on_guestlist = true;
            return next()
        }
    }

    req.on_guestlist = false;
    return next();
});

app.get('/party/:partyId', (req, res) => {
    const pin = req.session.pin;
    res.render('party', { 'title': req.party.title, 'userpin': pin || '****' });
});

// Check session state
app.get('/party/:partyId/state', (req, res) => {
    const user = req.session.user;
    if (user == undefined)
        return res.send(200, { "status": "null" });
    if (req.on_guestlist == false)
        return res.send(200, { "status": "unauthorized" });
    if (req.party.joined.indexOf(user) == -1)
        return res.send(200, { "status": "invited" });
    return res.send(200, { "status": "joined" });
});

app.get('/party/:partyId/details', (req, res) => {
    if (req.on_guestlist == false)
        return res.send(401, { "status": "pirate is not on the guestlist" });
        
    const party = req.party;
    if (req.session.user != party.admin)
        party.guestlist.forEach((g) => g.pin = "****");
    return res.send(200, party);
});

app.post('/party/:partyId/remove', (req, res) => {
    if (req.on_guestlist == false)
        return res.send(401, { "status": "pirate is not on the guestlist" });

    req.party.updateOne({ $pullAll: { joined: [req.session.user] } }, function (err, result) {
        if (err) 
            return res.send({ "status": "ok" });
    });
    return res.send({ "status": "ok" });
});

app.post('/party/:partyId/add', (req, res) => {
    if (req.on_guestlist == false)
        return res.send(401, { "status": "pirate is not on the guestlist" });

    const user = req.session.user;
    if (req.party.joined.includes(user)) {
        return res.send({ "status": "pirate already joined the party" });
    } else {
        req.party.updateOne({ $addToSet: { joined: [user] } }, function (err, result) {
            if (err) 
                return res.send(401, { "status": "update did not work" });
        });
    }
    return res.send({ "status": "ok" });
});

app.post('/party/:partyId/new', (req, res) => {
    if (!req.session.user || !req.session.pin) {
        req.session.user = req.body.user.trim();
        req.session.pin = req.body.pin;
    }
    return res.send(200, { "status": "ok" });
});

app.post('/party/:partyId/updatepw', (req, res) => {
    if (req.on_guestlist == false)
        return res.send(401, { "status": "pirate is not on the guestlist" });

    // If on_guestlist, current pin is checked
    req.session.pin = req.body.pin;

    let users = req.party.guestlist
    let idx = users.findIndex(u => u.name === req.session.user)
    users[idx].pin = req.body.pin;

    req.party.updateOne({ "guestlist": users }, function (err, result) {
        if (err)   
            return res.send(401, { "status": "update did not work" });
        else
            return res.redirect('/party/' + req.party.uuid);  
    });  
});

app.post('/party', (req, res) => {
    const partyId = uuidv4();
    let admin = req.body.party.admin;
    let partyPayload = req.body.party;

    let guests = [];
    partyPayload["guestlist"].split(',').forEach(name => {
        if (name.trim() == admin || guests.some((e) => e.name === name.trim()))
            return res.redirect("/?e=... no no no, not two people with the same name!");

        let guest = {
            "name": name.trim(),
            "pin": crypto.randomInt(1000000000, 9999999999)
        }
        guests.push(guest);
    });

    const pin = crypto.randomInt(1000000000, 9999999999);

    req.session.admin = admin;
    req.session.user = admin;
    req.session.pin = pin;

    guests.push({ "name": admin, "pin": pin });
    partyPayload["guestlist"] = guests;
    partyPayload["uuid"] = partyId;
    partyPayload["joined"] = [];
    partyPayload["description"] = enc(partyPayload["description"], admin)

    let party = new Party(partyPayload);
    party.save((err, result) => {
        if (err)
            return res.redirect("/?e=something bad happened. Try it again...");
        else 
            return res.redirect('/party/' + partyId);
    });
});

app.get('*', function(req, res){
    return res.redirect('/?e=your on the wrong route, young pirate!');
});

app.listen(PORT, HOST);
