const EventEmitter = require('events');
const Shuffle = require('knuth-shuffle-seeded');

class Game extends EventEmitter {
    constructor(params = {}) {
        super();
        this.params = params;
        this.deck = [];
        this.card = null;
        this.players = [];
        this.teamTurn = -2;
        this.playerTurn = null;
        this.timeout = setTimeout(this.Close, 10000);
        this.timer = null;
        this.index = 0;
        this.playedTimer = [false, false];
        this.scores = {
            team0: 0,
            team1: 0
        }
    }

    Connect = (ws) => {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = false;
        }
        let p = {
            id: this.index++,
            name: 'Player',
            team: -1,
            played: false,
            ws,
        }
        this.Broadcast({
            type: 'id',
            id: p.id
        }, [p]);
        this.players.push(p);
        ws.on('message', message => {
            try {
                let msg = JSON.parse(message);
                if (msg.type === 'setplayer') {
                    if ('name' in msg && msg.name.length > 0) {
                        p.name = msg.name.substring(0, 24);
                    }
                    if ('team' in msg) {
                        p.team = msg.team;
                        p.played = !this.playedTimer[p.team % 2];
                        if (this.teamTurn >= 0) {
                            this.SendCard([p]);
                        }
                    }
                    this.SendPlayers();
                }
                else if (msg.type === 'start') {
                    this.StartRound();
                    this.SendStatus([p]);
                }
                else if (msg.type === 'chat') {
                    this.DoMessage(msg.message, p);
                }
                else if (msg.type === 'correct') {
                    this.Correct(msg, p);
                }
                else if (msg.type === 'forbidden') {
                    this.Forbidden(msg, p);
                }
            }
            catch (ex) {
                console.log(ex);
            }
        });
        ws.on('close', (ws) => {
            this.players.splice(this.players.indexOf(p), 1);
            if (this.players.length <= 0) {
                this.Close();
            }
            else {
                this.SendPlayers();
            }
        });
        this.SendPlayers();
    }

    StartRound = () => {
        if (this.teamTurn < 0 && this.EnoughPlayers()) {
            this.teamTurn += 2;
            this.timer = setTimeout(this.EndRound, this.params.timeLimit || 60000);
            this.StartWord();
        }
    }

    EndRound = () => {
        this.Broadcast({
            type: 'roundend'
        });
        this.card = null;
        if (this.teamTurn >= 0) {
            if (this.teamTurn === 0) {
                this.scores.team1++;
            }
            else {
                this.scores.team0++;
            }
        }
        this.teamTurn -= 2;
        this.SendStatus();
    }

    ShuffleDeck = () => {
        this.deck = this.params.masterWordList.slice(0);
        Shuffle(this.deck);
    }

    GetNextPlayer = () => {
        this.teamTurn = (this.teamTurn + 1) % 2;
        let player = null;
        for (let i = 0; i < 2 && player === null; i++) {
            this.players.every(p => {
                if (p.team === this.teamTurn && p.played === this.playedTimer[this.teamTurn]) {
                    p.played = !p.played;
                    player = p;
                }
                return player === null;
            });
            if (player === null) {
                this.playedTimer[this.teamTurn] = !this.playedTimer[this.teamTurn]
            }
        }
        return player;
    }

    StartWord = (nextplayer = true) => {
        if (this.deck.length <= 0) {
            this.ShuffleDeck();
        }
        if (nextplayer) {
            this.playerTurn = this.GetNextPlayer();
            if (!this.playerTurn) {
                return this.EndRound();
            }
        }
        this.SendStatus();
        this.card = this.deck.pop();
        this.SendCard();
    }

    SendCard = (potentialPlayers = this.players) => {
        let recipients = potentialPlayers.filter(p => p.team >= 0 && p.team === (this.teamTurn + 1) % 2);
        recipients.push(this.playerTurn);
        this.Broadcast({
            type: 'card',
            card: this.card
        }, recipients);
    }

    DoMessage = (message, sender) => {
        message = message.substring(0, 128);
        let recipients = this.players;
        let payload = {
            type: 'chat',
            message,
            sender: {
                id: sender.id,
                name: sender.name,
                team: sender.team
            }
        };
        let lcase = message.toLowerCase();
        if (this.teamTurn >= 0) {
            if (sender.id === this.playerTurn.id) {
                payload.type = 'clue';
                if (this.card && this.card.banned) {
                    let goodClue = true;
                    this.card.banned.every(b => {
                        return (goodClue = lcase.indexOf(b) < 0);
                    });
                    goodClue = goodClue && lcase.indexOf(this.card.word.toLowerCase());
                    if (!goodClue) {
                        recipients = [];
                        this.SendForbidden();
                    }
                }
            }
            else if (sender.team !== this.teamTurn) {
                recipients = this.players.filter(p => p.team === sender.team);
            }
        }
        this.Broadcast(payload, recipients);

        if (sender.team === this.teamTurn && sender.id !== this.playerTurn.id && lcase.indexOf(this.card.word.toLowerCase()) >= 0) {
            this.SendCorrect(sender);
            this.StartWord();
        }
    }

    Forbidden = (msg, playerobj) => {
        if (this.teamTurn >= 0 && playerobj.team !== this.teamTurn && this.card && msg.card.word === this.card.word) {
            msg.sender = {
                name: playerobj.name,
                id: playerobj.id,
                team: playerobj.team
            }
            msg.newcard = true;
            this.SendForbidden(msg);
            this.StartWord(false);
        }
    }

    SendForbidden = (msg = {}) => {
        let m = {
            type: 'forbidden',
            newcard: 'newcard' in msg && msg.newcard,
            playerTurn: (!this.playerTurn) ? null : {
                id: this.playerTurn.id,
                name: this.playerTurn.name,
                team: this.playerTurn.team
            }
        };
        if (msg.sender) {
            m.sender = msg.sender;
        }
        if (msg.word) {
            m.word = msg.word;
        }
        this.Broadcast(m);
    }

    Correct = (msg, playerobj) => {
        if (this.card && msg.card.word === this.card.word &&
            msg.player.team === this.teamTurn &&
            msg.player.id !== this.playerTurn.id &&
            (playerobj === this.playerTurn || playerobj.team === (this.playerTurn.team + 1) % 2)) {
            let p = this.players.filter(p => p.id === msg.player.id);
            if (p.length === 1) {
                this.SendCorrect(p[0]);
                this.StartWord();
            }
        }
    }

    SendCorrect = (playerobj) => {
        this.Broadcast({
            type: 'correct',
            card: this.card,
            player: {
                id: playerobj.id,
                name: playerobj.name,
                team: playerobj.team
            }
        });
    }

    EnoughPlayers = () => {
        let t = [0, 0];
        let r = false;
        this.players.every(p => {
            if (p.team >= 0) {
                t[p.team]++;
            }
            return !(r = t[0] >= 2 && t[1] >= 2);
        });
        return r;
    }

    GetPlayers = () => {
        let players = {
            unknown: [],
            team0: [],
            team1: []
        }
        this.players.forEach(player => {
            let p = {
                team: player.team,
                id: player.id,
                name: player.name
            }
            if (p.team === 0 || p.team === 1) {
                players[`team${p.team}`].push(p);
            }
            else {
                players.unknown.push(p);
            }
        });
        return players
    }

    SendPlayers = () => {
        this.Broadcast({
            type: 'players',
            players: this.GetPlayers()
        });
        this.SendStatus();
    }

    SendStatus = (clients = this.players) => {
        this.Broadcast({
            type: 'status',
            scores: this.scores,
            teamTurn: this.teamTurn,
            playerTurn: (!this.playerTurn) ? null : {
                id: this.playerTurn.id,
                name: this.playerTurn.name,
                team: this.playerTurn.team
            },
            startBtnEnable: this.teamTurn >= 0 || this.EnoughPlayers()
        }, clients);
    }

    Broadcast = (message, clients = this.players) => {
        let msg = (typeof message === 'string') ? message : JSON.stringify(message);
        clients.forEach(c => {
            if (c && c.ws && c.ws.readyState === 1) {
                c.ws.send(msg);
            }
        });
    }

    Close = () => {
        this.players.forEach(p => {
            p.ws.terminate();
        });
        this.emit('close');
        clearTimeout(this.timer);
    }
}

module.exports = Game;