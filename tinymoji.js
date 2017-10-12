'use latest';

import express from 'express';
import bodyParser from 'body-parser';
import Webtask from 'webtask-tools';
import { MongoClient } from 'mongodb';
import { ObjectID } from 'mongodb';

// Custom NPM Modules
import punycode from 'punycode';

const server = express();
server.use(bodyParser.json());

const collection = 'redirects';
const notFound = 'Not Found';
const recordFound = 'Already Exists';

const emojiRanges = '/(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c[\ude32-\ude3a]|[\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/g';

const removeEmoji = str => str.replace(new RegExp(emojiRanges, 'g'), '');

const isOnlyEmojis = str => !removeEmoji(str).length;

// Helper functions
function validate(emojiStr) {
  console.log(isOnlyEmojis(emojiStr));
  return isOnlyEmojis(emojiStr);
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
