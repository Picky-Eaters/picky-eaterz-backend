'use strict';

const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const cors = require('cors');
const config = require('./config.json');
const serviceAccount = require('./service-account.json');

// CORS variables, for use with express.
const whitelist = ['http://localhost:3000', 'https://picky-eaterz.appspot.com'];
const corsOptions = {
  origin: (origin, callback) => {
    whitelist.indexOf(origin) > -1 ? callback(null, true) : callback(new Error('Request denied by CORS'));
  }
};

// Initialize the express server.
const app = express();
app.use(cors(corsOptions), express.json());

// Retrieve the service account credentials and initialize the Firebase admin SDK.
admin.initializeApp({
  "credential": admin.credential.cert(serviceAccount),
  "databaseURL": config.database_url
});

// Get a reference to the realtime database.
const database = admin.database();

// Generates a six character alphanumeric group ID.
const generateGID = () => {
  var chars = [];

  for (var i = 0; i < 6; i++) {
    const rand = Math.floor(Math.random() * 37);
    chars[i] = rand < 10 ? rand + 48 : rand + 87;
  }

  return String.fromCharCode(...chars);
};

// Finds an unused group ID.
const findGID = async () => {
  var gid;

  do {
    gid = generateGID();
    const snap = await database.ref(gid).once("value");
    if (snap.exists()) {
      gid = "";
    }
  } while (!gid);

  return gid;
}

// Creates a new group.
app.post('/groups/create', async (req, res) => {
  // Retrieve the query parameters.
  const term = "food";
  const location = req.query.location;
  const limit = 10;
  var price = "";
  const open_now = true;

  // Populate the price parameter based on the request query string.
  for (var i = 1; i < req.query.price; i++) {
    price += `${i}, `;
  }
  price += req.query.price;

  // Query Yelp for appropriate places.
  const yelpUrl = "https://api.yelp.com/v3/businesses/search";

  const params = {
    term,
    location,
    limit,
    price,
    open_now
  };
  const headers = {
    "Authorization": `Bearer ${config.yelp_key}`
  };
  const results = await axios.get(yelpUrl, { params, headers });

  // Map the returned business to new objects, keeping only the data we need.
  const restaurants = results.data.businesses.reduce((map, place) => {
    map[place.id] = {
      "categories": place.categories.map(category => {
        return category.title
      }),
      "id": place.id,
      "name": place.name,
      "price": place.price,
      "rating": place.rating,
      "review_count": place.review_count,
      "image_url": place.image_url,
      "url": place.url,
      "votes": 0
    };

    return map;
  }, {});

  // Create the new group.
  const gid = await findGID();
  database.ref(gid).set({ restaurants });

  // Respond with a success code and the group ID.
  res.status(200).send(gid);
});

// Gets information regarding all of the restaurants in a given group.
app.get('/groups/:gid', async (req, res) => {
  // Retrieve the group ID from the request URL.
  const gid = req.params.gid.toLowerCase();

  const snap = await database.ref(gid).child("restaurants").once("value");
  res.status(200).send(snap.val());
});

// Gets realtime information regarding the restaurants in a given group.
app.get('/groups/realtime/:gid', async (req, res) => {
  // Retrieve the group ID from the request URL.
  const gid = req.params.gid.toLowerCase();

  req.on("close", () => {
    if (!res.finished) {
      res.end();
      console.log("Killed response events");
    }
  });

  res.writeHead(200, {
    "Connection": "keep-alive",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache"
  });

  database.ref(gid).child("restaurants").on("value", (snap) => {
    const val = snap.val();
    res.write(`data: ${JSON.stringify(val)}`);
    res.write("\n\n");
  });
});

// Deletes the group with the given group ID.
app.delete('/groups/:gid', async (req, res) => {
  // Retrieve the group ID from the request URL.
  const gid = req.params.gid.toLowerCase();

  database.ref(gid).remove();
  res.end();
});

// Updates the restaurant with the given restaurant ID in the group with the given group ID with one more vote.
app.put('/groups/:gid/:rid', async (req, res) => {
  // Retrieve the GID and RID from the request URL.
  const gid = req.params.gid.toLowerCase();
  const rid = req.params.rid.toLowerCase();

  // Update the restaurant vote value.
  const votesRef = database.ref(gid).child("restaurants").child(rid).child("votes");
  var votes = await votesRef.once("value");
  votesRef.set(votes.val() + 1);

  res.end();
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});