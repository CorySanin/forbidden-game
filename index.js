const fs = require('fs');
const path = require('path');
const lobby = require('./lobby');

fs.readFile(path.join(__dirname, 'config', 'config.json'), (err, data) => {
    if (!err) {
        let config = JSON.parse(data);
        fs.readFile(path.join(__dirname, 'config', 'deck.json'), (err, data) => {
            if (!err) {
                let deck = JSON.parse(data);
                let l = new lobby(config,  deck.cards);
            }
        });
    }
});