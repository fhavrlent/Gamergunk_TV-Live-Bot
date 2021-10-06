/* eslint-disable no-console */
/* eslint-disable camelcase */
const express = require('express');
const crypto = require('crypto');
const http = require('http');
const Discord = require('discord.js');
const fs = require('fs');

const fileName = './lastStreamId.json';
const file = require(fileName);

const logLastStreamDate = (date) => {
  file.createdAt = date;
  fs.writeFile(
    fileName,
    JSON.stringify(file),
    (writeJSON = (err) => {
      if (err) return console.log(err);
      console.log(JSON.stringify(file, null, 2));
      console.log('writing to ' + fileName);
    })
  );
};

require('dotenv').config();

const {
  PORT: port = 9000,
  HOOK_SECRET: hookSecret,
  HOOK_URL: url,
} = process.env;

const app = express();
const server = http.createServer(app);

server.listen(port, () => {
  console.log('Server raised on', port);
});

const webhook = new Discord.WebhookClient({ url });

app.use(
  express.json({
    verify(req, _, buf) {
      req.twitch_eventsub = false;
      if (
        req.headers &&
        Object.prototype.hasOwnProperty.call(
          req.headers,
          'twitch-eventsub-message-signature'
        )
      ) {
        req.twitch_eventsub = true;

        const id = req.headers['twitch-eventsub-message-id'];
        const timestamp = req.headers['twitch-eventsub-message-timestamp'];
        const [, signature] =
          req.headers['twitch-eventsub-message-signature'].split('=');

        req.twitch_hex = crypto
          .createHmac('sha256', hookSecret)
          .update(id + timestamp + buf)
          .digest('hex');
        req.twitch_signature = signature;

        console.log(
          req.twitch_signature !== req.twitch_hex
            ? 'Signature Mismatch'
            : 'Signature OK'
        );
      }
    },
  })
);

app
  .route('/')
  .get((_, res) => {
    console.log('Incoming Get request on /');
    res.send('Hello!');
  })
  .post((req, res) => {
    console.log('Incoming Post request on /', req.body);

    const { body, headers, twitch_hex, twitch_eventsub, twitch_signature } =
      req;
    const { subscription, event, challenge } = body;

    if (twitch_eventsub) {
      switch (headers['twitch-eventsub-message-type']) {
        case 'webhook_callback_verification':
          if (Object.prototype.hasOwnProperty.call(body, 'challenge')) {
            if (twitch_hex === twitch_signature) {
              console.log('Got a challenge, return the challenge');
              res.send(encodeURIComponent(challenge));
              return;
            }
          }
          res.status(403).send('Denied');
          break;
        case 'revocation':
          res.send('Ok');
          break;
        case 'notification':
          if (
            twitch_hex === twitch_signature &&
            file.createdAt !== event?.started_at
          ) {
            console.log('The signature matched');
            if (
              subscription?.type === 'stream.online' &&
              event?.type === 'live'
            ) {
              webhook
                .send(
                  '@everyone WE ARE LIVE! https://www.twitch.tv/gamergunk_tv'
                )
                .then((message) =>
                  console.log(`Sent message: ${message.content}`)
                )
                .catch(console.error);
            }
            logLastStreamDate(event?.started_at);
            res.send('Ok');
          } else {
            console.log('The Signature did not match');
            res.send('Ok');
          }
          break;
        default:
          console.log('Invalid hook sent to me');
          res.send('Ok');
          break;
      }
    } else {
      console.log("It didn't seem to be a Twitch Hook");
      res.send('Ok');
    }
  });
