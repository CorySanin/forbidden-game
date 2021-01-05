let fs = require('fs');
let path = require('path');
let server = require('./gameserver');

fs.readFile(path.join(__dirname, 'config', 'config.json'), function(err, data){
    let s = new server(JSON.parse(data));
});