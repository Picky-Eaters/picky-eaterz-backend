const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const config = require('./config.json');
const serviceAccount = require('./service-account.json');
const app = express();

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
  const restaurants = results.data.businesses.map(place => {
    return {
      "categories": place.categories.map(category => {
        return category.title
      }),
      "id": place.id,
      "name": place.name,
      "price": place.price,
      "rating": place.rating,
      "review_count": place.review_count,
      "url": place.url,
      "votes": 0
    };
  });

  // Create the new group.
  const gid = await findGID();
  database.ref(gid).set({ restaurants });

  // Respond with a success code and the group ID.
  res.status(200).send(gid);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});