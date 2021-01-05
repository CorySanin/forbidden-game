const express = require('express');
const ExpressWS = require('express-ws');
const WebSocket = require('ws');
const Helmet = require('helmet');
const Game = require('./game');

const VERSION = require('./package.json').version;

class Server {
    constructor(options = {}) {
        let port = process.env.PORT || options.port || 8080;
        this.lobbyUrl = process.env.LOBBYURL || options.lobbyUrl || '';
        this.serverUrl = process.env.SEVERURL || options.serverUrl || '';
        this.password = process.env.PASSWORD || options.password || 'changeme';
        this.games = {};
        this.gameParams = {
            masterWordList: []
        };

        const app = express();
        ExpressWS(app);

        app.set('trust proxy', 1);
        app.set('view engine', 'ejs');
        app.use(Helmet());

        //#region express endpoints

        app.get('/ping', (req, res) => {
            res.set('Access-Control-Allow-Origin', '*');
            res.json({
                ping: 'pong'
            });
        });

        app.ws('/ws/game/:id', (ws, req) => {
            let id = req.params['id'];
            if(id in this.games){
                this.games[id].Connect(ws);
            }
            else{
                ws.terminate();
            }
        });

        app.use((req, res) => {
            res.redirect(this.lobbyUrl);
        });

        //#endregion

        this.Terminate = app.listen(port, () => console.log(`Game site running on ${port}`)).close;

        this.RegisterServer();
    }

    RegisterServer = () => {
        let ws = new WebSocket(`${this.lobbyUrl}/ws/server`);
        ws.on('message', (message) => {
            try {
                let msg = JSON.parse(message);
                if (msg.type === 'handshake'
                    && msg.version === VERSION) {
                    ws.send(JSON.stringify({
                        type: 'handshake',
                        version: VERSION,
                        password: this.password,
                        url: this.serverUrl,
                    }));
                    this.lobbyserver = ws;
                    ws.on('close', () => setTimeout(this.RegisterServer, 3000));
                }
                else if(msg.type === 'deck'){
                    this.gameParams.masterWordList = msg.deck;
                }
                else if (msg.type === 'roomcreate' && this.lobbyserver === ws) {
                    if (!(msg.room.id in this.games)) {
                        let g = new Game(this.gameParams);
                        this.games[msg.room.id] = g;
                        g.on('close', () => {
                            this.lobbyserver.send(JSON.stringify({
                                type: 'roomdelete',
                                room: msg.room
                            }));
                            delete this.games[msg.room.id];
                        });
                    }
                }
                else if (this.lobbyserver !== ws) {
                    ws.terminate();
                    this.Terminate();
                }
            }
            catch (ex) {
                console.log(ex);
                ws.terminate();
                this.Terminate();
            }
        });
    }
}


module.exports = Server;