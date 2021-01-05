const crypto = require('crypto');
const express = require('express');
const ExpressWS = require('express-ws');
const BodyParser = require('body-parser');
const Helmet = require('helmet');

const ROOMIDSET = 'abcdefghkmnpqrstuvwxyz23456789'; //no similar-looking characters because I'm not a monster
const CSPNONCE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; //CSP sucks
const VERSION = require('./package.json').version;

function genRoomCode(games, length = 5) {
    let code = '';
    do {
        let bytes = crypto.randomBytes(length++);
        let chars = [];
        for (let i = 0; i < bytes.length; i++) {
            chars.push(ROOMIDSET[bytes[i] % ROOMIDSET.length]);
        }
        code = chars.join('');
    } while (code in games);
    return code;
}

function genNonceForCSP(length = 16) {
    let bytes = crypto.randomBytes(length);
    let chars = [];
    for (let i = 0; i < bytes.length; i++) {
        chars.push(CSPNONCE[bytes[i] % CSPNONCE.length]);
    }
    return chars.join('');
}

class Lobby {
    constructor(options = {}, cards = []) {
        let port = process.env.PORT || options.port || 8080;

        this.password = process.env.PASSWORD || options.password || 'changeme';
        this.games = {};
        this.servers = [];
        this.clients = [];
        this.cards = cards;

        const app = express();
        ExpressWS(app);

        app.set('trust proxy', 1);
        app.set('view engine', 'ejs');
        app.use(express.urlencoded({ extended: true }));
        app.use(express.json({ extended: true }));
        app.use(BodyParser.json());
        app.use(Helmet());
        app.use('/assets/', express.static('assets'));


        //#region express endpoints

        app.get('/', (req, res) => {
            res.render('index',
                {},
                function (err, html) {
                    if (!err) {
                        res.set('Content-Security-Policy', "default-src 'self'; connect-src 'self' *");
                        res.send(html);
                    }
                    else {
                        res.send(err);
                    }
                }
            );
        });

        app.get('/room/:id', (req, res) => {
            let room = this.games[req.params['id']];
            if (room) {
                let nonce = genNonceForCSP();
                res.render('game',
                    {
                        room,
                        nonce
                    },
                    function (err, html) {
                        if (!err) {
                            res.set('Content-Security-Policy', `default-src 'self'; connect-src 'self' *; script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net`);
                            res.send(html);
                        }
                        else {
                            res.send(err);
                        }
                    }
                );
            }
            else {
                res.redirect('/');
            }
        });

        app.ws('/ws/lobbylist', (ws, res) => {
            this.clients.push(ws);

            this.UpdateRoomList([ws]);

            ws.on('close', (ws) => {
                this.clients.splice(this.clients.indexOf(ws), 1);
            });
        });

        app.ws('/ws/server', (ws, res) => {
            let performHandshake = (message) => {
                try {
                    ws.removeListener('message', performHandshake);
                    let msg = JSON.parse(message);
                    if (msg.type === 'handshake'
                        && msg.version === VERSION
                        && msg.password === this.password
                        && msg.url.trim().length > 0) {
                        let server = {
                            url: msg.url,
                            gamews: msg.url.replace(/^http/, 'ws'),
                            ws
                        };
                        this.servers.push(server);
                        console.log(`Server ${server.url} connected.`);
                        ws.on('message', (message) => {
                            try {
                                let msg = JSON.parse(message);
                                if (msg.type === 'roomdelete') {
                                    delete this.games[msg.room.id];
                                    this.UpdateRoomList();
                                }
                            }
                            catch {

                            }
                        });
                        ws.on('close', (ws) => {
                            this.servers.splice(this.servers.indexOf(server), 1);
                            for (let g in this.games) {
                                if (this.games[g].server === server.url) {
                                    delete this.games[g];
                                }
                            }
                            this.UpdateRoomList();
                        });
                        ws.send(JSON.stringify({
                            type: 'deck',
                            deck: this.cards
                        }));
                    }
                    else {
                        ws.terminate();
                    }
                }
                catch {
                    ws.terminate();
                }
            }

            ws.on('message', performHandshake);

            ws.send(JSON.stringify({
                type: "handshake",
                version: VERSION
            }));
        });

        app.get('/api/v1/servers', (req, res) => {
            res.json({
                servers: this.servers.map(s => ({ url: s.url }))
            });
        });

        app.get('/api/v1/room/:id', (req, res) => {
            let response = {
                success: false
            };
            if (req.params['id'] in this.games) {
                response.success = true;
                response.room = this.games[req.params['id']];
            }
            res.json(response);
        });

        app.post('/api/v1/room', (req, res) => {
            if ('name' in req.body && 'server' in req.body && 'private' in req.body) {
                let id = genRoomCode(this.games, (req.body.private) ? 8 : 5);
                let room = {
                    id,
                    private: req.body.private
                }
                this.games[id] = room; //maybe move out of this function? like assign in CreateRoom perhaps?

                let server = this.ServerExists(req.body.server);
                room.server = server.url;
                room.gamews = server.gamews;
                room.name = (req.body.name.length > 0) ? req.body.name.substring(0, 16) : id;
                if (server) {
                    this.CreateRoom(server, room);
                    res.json({
                        success: true,
                        room
                    });
                }
                else {
                    delete this.games[id];
                    res.json({
                        success: false,
                        message: 'Error creating room'
                    });
                }
            }
        });

        //#endregion

        app.listen(port, () => console.log(`Game site running on ${port}`));
    }

    ServerExists = (serverUrl) => {
        let matches = this.servers.filter(server => server.url === serverUrl);
        if (matches.length === 1) {
            return matches[0];
        }
        return false;
    }

    CreateRoom = (server, room) => {
        server.ws.send(JSON.stringify({
            type: 'roomcreate',
            room
        }));
        this.UpdateRoomList();
    }

    UpdateRoomList = (clients = this.clients) => {
        let rooms = [];
        for (let id in this.games) {
            let r = this.games[id];
            if (!r.private) {
                rooms.push(r);
            }
        }
        let s = JSON.stringify({
            type: 'rooms',
            rooms
        });
        clients.forEach(c => {
            if (c && c.readyState === 1) {
                c.send(s);
            }
        });
    }
}

module.exports = Lobby;