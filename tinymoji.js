'use latest';

import express from 'express';
import bodyParser from 'body-parser';
import Webtask from 'webtask-tools';
import { MongoClient } from 'mongodb';
import { ObjectID } from 'mongodb';
import punycode from 'punycode';

// Custom NPM Modules
import emojiStrip from 'emoji-strip';

const server = express();
server.use(bodyParser.json());

const collection = 'redirects';
const notFound = 'Not Found';
const recordFound = 'Already Exists';


// Helper functions
function validate(emojiStr) {
  stripped = emojiStrip(emojiStr);
  return !stripped.length;
}

function objectIsEmpty(obj) {
  return Object.keys(obj).length === 0 && obj.constructor === Object;
}

function updateCount(db, id) {
  return db.collection(collection).update({ _id: id }, { $inc: { hits: 1 } });
}

function getRecord(db, asciiEmojis) {
  return db.collection(collection).findOne({ asciiEmojis: asciiEmojis });
}

function getRedirectUrl(connectionUrl, asciiEmojis) {
  var db;
  
  return new Promise( (fullfill, reject) => {
    MongoClient.connect(connectionUrl)
      .then( _db => {
        db = _db;
        return getRecord(db, asciiEmojis);
      })
      .then( record => {
        return new Promise( (fullfill, reject) => { record ? fullfill(record) : reject(notFound); });
      })
      .then( record => {
        updateCount(db, record._id).then(() => { db.close(); });
        fullfill(record.redirect_url);
      }).catch( err => {
        if (db) db.close();
        reject(err);
      });    
  });
}

function addRedirect(connectionUrl, data) {
  var db;
  
  return new Promise( (fullfill, reject) => {
    MongoClient.connect(connectionUrl)
      .then( _db => {
        db = _db;
        return getRecord(db, data.asciiEmojis);
      })
      .then( record => {
        return new Promise( (fullfill, reject) => { record ? reject(recordFound) : fullfill(); });
      })
      .then( () => {
        return db.collection(collection).insertOne(data);
      })
      .then( result => {
        db.close();
        fullfill(result);
      })
      .catch( err => {
        if (db) db.close();
        reject(err);
      });    
  });
}


// Routes
server.get('/:emojis', (req, res, next) => {
  const { MONGO_URL } = req.webtaskContext.data;
  const { emojis } = req.params;
  
  if (!validate(emojis)) {
    res.sendStatus(404);
    return;
  }

  var asciiEmojis = punycode.encode(emojis);
  
  getRedirectUrl(MONGO_URL, asciiEmojis, true)
    .then( redirectUrl => {
      res.redirect(redirectUrl);
    }).catch( err => {
      res.sendStatus(404);
    });
});

server.post('/', (req, res, next) => {
  const { MONGO_URL } = req.webtaskContext.data;

  var newEntry = req.body;
  
  if (!validate(newEntry.emojis)) {
    res.status(400).send('Emojis Only');
    return;
  }
  
  newEntry.asciiEmojis = punycode.encode(newEntry.emojis)

  delete newEntry.emojis;
  newEntry.hits = 0;

  addRedirect(MONGO_URL, newEntry)
    .then( result => {
      res.status(201).send(result);
    })
    .catch( err => {
      if (err === recordFound) {
        res.sendStatus(409);
      } else {
        res.sendStatus(400);
      }
    });
});

module.exports = Webtask.fromExpress(server);
