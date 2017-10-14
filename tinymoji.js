'use latest';

import express from 'express';
import bodyParser from 'body-parser';
import Webtask from 'webtask-tools';
import { MongoClient } from 'mongodb';
import { ObjectID } from 'mongodb';
import punycode from 'punycode';

// Custom NPM Modules
import emojiStrip from 'emoji-strip';
import isUrl from 'is-url';

const server = express();
server.use(bodyParser.json());

const collection = 'redirects';
const notFound = 'notFound';
const recordFound = 'recordFound';

const errors = {
  notFound: { affects: 'emoji', error: 'not found'},
  duplicate: { affects: 'emoji', error: 'tinymoji already exists' },
  noEmojiIncluded: { affects: 'emoji', error: 'must include emoji' },
  noRedirectIncluded: { affects: 'redirect_url', error: 'must include a redirect url' },
  invalidEmoji: { affects: 'emoji', error: 'include only emoji' },
  invalidUrl: { affects: 'redirect_url', error: 'invalid url' }
}


// Helper functions
function getError(error) {
  return JSON.stringify(errors[error]);
} 

function validateUrl(url) {
  return isUrl(url);
}

function validateEmoji(emojiStr) {
  var stripped = emojiStrip(emojiStr);
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
  
  if (!validateEmoji(emojis)) {
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

  var data = req.body;
  
  if (!('emojis' in data) || !data.emojis) {
    res.status(400).send(getError('noEmojiIncluded'));
    return;
  }
  
  if (!('redirect_url' in data) || !data.redirect_url) {
    res.status(400).send(getError('noRedirectIncluded'));
    return
  }
  
  if (!validateEmoji(data.emojis)) {
    res.status(400).send(getError('invalidEmoji'));
    return;
  }
  
  if (!validateUrl(data.redirect_url)) {
    res.status(400).send(getError('invalidUrl'));
    return;
  }
  
  var newEntry = {
    asciiEmojis: punycode.encode(data.emojis),
    redirect_url: data.redirect_url,
    hits: 0
  };
  
  addRedirect(MONGO_URL, newEntry)
    .then( result => {
      res.status(201).send(result);
    })
    .catch( err => {
      if (err === recordFound) {
        res.status(409).send(getError('duplicate'));
      } else {
        res.status(400).send(err);
      }
    });
});

module.exports = Webtask.fromExpress(server);
