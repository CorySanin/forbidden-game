document.addEventListener('DOMContentLoaded', function () {
    const SpeechSynthesisUtterance =
        window.webkitSpeechSynthesisUtterance ||
        window.mozSpeechSynthesisUtterance ||
        window.msSpeechSynthesisUtterance ||
        window.oSpeechSynthesisUtterance ||
        window.SpeechSynthesisUtterance;

    const woo = new Howl({
        src: ['/assets/audio/woo.ogg', '/assets/audio/woo.mp3']
    });
    const bouw = new Howl({
        src: ['/assets/audio/bouw.ogg', '/assets/audio/bouw.mp3']
    });
    const zinbox = new Howl({
        src: ['/assets/audio/zinbox.ogg', '/assets/audio/zinbox.mp3']
    });

    let scoreboard = {
        team0: document.querySelector('#scoreboard .team-0'),
        team1: document.querySelector('#scoreboard .team-1')
    }
    let playerCol = {
        teams: {
            unknown: document.getElementById('unknown-players'),
            team0: document.querySelector('#team-assigned .player-group.team-0'),
            team1: document.querySelector('#team-assigned .player-group.team-1')
        },
        teamcontainer: document.getElementById('team-assigned')
    }
    let chatCol = {
        messages: document.querySelector('#messages .sticky-bottom'),
        messagetxt: document.getElementById('messagetxt'),
        sendbtn: document.getElementById('sendbtn')
    }
    let mainCol = {
        'phase-0': {
            div: document.getElementById('phase-0'),
            name: document.getElementById('playername'),
            teambtns: {
                team0btn: document.getElementById('team-0-btn'),
                team1btn: document.getElementById('team-1-btn')
            },
            startbtn: document.getElementById('start-btn')
        },
        'phase-1': {
            div: document.getElementById('phase-1'),
            word: document.getElementById('the-word'),
            banned: document.querySelector('#word-card .banned-words')
        },
        'phase-2': {
            div: document.getElementById('phase-2'),
            headername: document.querySelector('#phase-2 h2 .playername'),
            clues: document.getElementById('clues'),
            watchers: {
                div: document.getElementById('watcher-text'),
                playername: document.querySelector('#watcher-text .playername'),
                banned: document.querySelector('#watcher-text .banned-words')
            }
        }
    }
    let card = {};
    let playerid = -1;
    let playername = mainCol['phase-0'].name.value;
    let playerteam = -1;
    let ws = null;
    let previousturn = -2;

    function createSocket() {
        try {
            ws = new WebSocket(`${window.server}/ws/game/${window.room}`);
            ws.onmessage = (message) => {
                let msg = JSON.parse(message.data);
                if (msg.type === 'id') {
                    playerid = msg.id;
                }
                if (msg.type === 'players') {
                    listPlayers(msg.players);
                }
                else if (msg.type === 'status') {
                    updateScore(msg.scores);
                    handleTeamTurn(msg);
                }
                else if (msg.type === 'card') {
                    updateCard(card = msg.card);
                }
                else if (msg.type === 'chat' || (msg.type === 'clue' && msg.sender.id === playerid)) {
                    createChat(msg);
                }
                else if (msg.type === 'clue') {
                    printClue(msg);
                }
                else if (msg.type === 'correct') {
                    printCorrect(msg);
                }
                else if (msg.type === 'forbidden') {
                    handleForbidden(msg);
                }
                else if (msg.type == 'roundend') {
                    bouw.play();
                }
            }
            if (playerteam >= 0) {
                sendNameAndTeam();
            }
            ws.onclose = () => setTimeout(createSocket, 3000);
        }
        catch (ex) {
            console.log(ex);
            setTimeout(createSocket, 5000);
        }
    }

    function sendMessage(message) {
        if (ws && ws.readyState === 1) {
            ws.send((typeof message === 'string') ? message : JSON.stringify(message));
        }
    }

    function setPhase(phasenum) {
        for (let phasediv in mainCol) {
            mainCol[phasediv].div.style.display = 'none';
        }
        mainCol[`phase-${phasenum}`].div.style.display = '';
    }

    function updateCard(card) {
        removeChildElements(mainCol['phase-1'].word);
        removeChildElements(mainCol['phase-1'].banned);
        removeChildElements(mainCol['phase-2'].watchers.banned);
        mainCol['phase-1'].word.appendChild(document.createTextNode(card.word));
        card.banned.push(card.word);
        card.banned.forEach(ban => {
            let li;
            if (ban != card.word) {
                li = document.createElement('li');
                li.appendChild(document.createTextNode(ban));
                mainCol['phase-1'].banned.appendChild(li);
            }
            li = document.createElement('li');
            li.appendChild(document.createTextNode(ban));
            mainCol['phase-2'].watchers.banned.appendChild(li);
            let c = card;
            li.onclick = () => clickBanned(ban, c);
        });
    }

    function createChat(msg) {
        let d = document.createElement('div');
        let span = document.createElement('span');
        span.classList.add('sender-name');
        span.append(document.createTextNode(`${msg.sender.name}: `));
        d.append(span);
        d.append(document.createTextNode(msg.message));
        d.classList.add('message', `team-${msg.sender.team}`);
        let c = card;
        chatCol.messages.appendChild(d);
        if (msg.sender.team >= 0) {
            d.onclick = () => clickUser(msg.sender, c);
        }
    }

    function printClue(msg) {
        let p = document.createElement('p');
        p.append(document.createTextNode(msg.message));
        p.classList.add(`team-${msg.sender.team}`);
        mainCol['phase-2'].clues.append(p);
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(msg.message));
    }

    function printCorrect(msg) {
        zinbox.play();
        let d = document.createElement('div');
        d.classList.add('correct');
        d.append(document.createTextNode(`${msg.player.name} got it! The word was ${msg.card.word}.`));
        chatCol.messages.appendChild(d);
    }

    function updateScore(scoreobj) {
        removeChildElements(scoreboard.team0);
        removeChildElements(scoreboard.team1);
        scoreboard.team0.appendChild(document.createTextNode(scoreobj.team0));
        scoreboard.team1.appendChild(document.createTextNode(scoreobj.team1));
    }

    function handleForbidden(msg) {
        woo.play();
        if (msg.newcard) {
            removeChildElements(mainCol['phase-2'].clues);
        }
        let d = document.createElement('div');
        d.classList.add('forbidden');
        if ('sender' in msg && 'word' in msg) {
            d.appendChild(document.createTextNode(`${msg.sender.name}: ${msg.playerTurn.name} used the forbidden word "${msg.word}"`));
        }
        else {
            d.appendChild(document.createTextNode(`${msg.playerTurn.name} used a forbidden word`));
        }
        chatCol.messages.appendChild(d);
    }

    function handleTeamTurn(statusobj) {
        if (statusobj.teamTurn < 0 || playerteam < 0) {
            setPhase(0);
            mainCol['phase-0'].startbtn.disabled = !statusobj.startBtnEnable;
        }
        else if (statusobj.playerTurn.id === playerid) {
            setPhase(1);
        }
        else {
            if (previousturn !== statusobj.teamTurn) {
                removeChildElements(mainCol['phase-2'].clues);
            }
            mainCol["phase-2"].watchers.div.style.display = (statusobj.teamTurn === playerteam) ? 'none' : '';
            setPlayerTurnName(statusobj.playerTurn.name);
            setPhase(2);
        }
        previousturn = statusobj.teamTurn;
    }

    function setPlayerTurnName(name) {
        removeChildElements(mainCol['phase-2'].headername);
        removeChildElements(mainCol["phase-2"].watchers.playername);
        mainCol['phase-2'].headername.appendChild(document.createTextNode(name));
        mainCol["phase-2"].watchers.playername.appendChild(document.createTextNode(name));
    }

    function listPlayers(playersgroups) {
        removePlayers();
        arrangeTeams();
        for (let team in playersgroups) {
            let players = playersgroups[team];
            players.forEach(player => {
                let d = document.createElement('div');
                d.appendChild(document.createTextNode(player.name));
                d.className = 'player';
                if (player.team >= 0 && player.id !== playerid) {
                    d.onclick = () => clickUser(player);
                }
                playerCol.teams[team].appendChild(d);
            });

        }
    }

    function removeChildElements(htmlelement) {
        while (htmlelement.firstChild) {
            htmlelement.removeChild(htmlelement.lastChild);
        }
    }

    function removePlayers() {
        for (let section in playerCol.teams) {
            removeChildElements(playerCol.teams[section]);
        }
    }

    function arrangeTeams() {
        if (playerteam === 1) {
            playerCol.teamcontainer.append(playerCol.teams.team0);
        }
        else {
            playerCol.teamcontainer.append(playerCol.teams.team1);
        }
    }

    function clickBanned(word, c = card) {
        sendMessage({
            type: 'forbidden',
            card: c,
            word
        });
    }

    function clickUser(playerobj, c = card) {
        sendMessage({
            type: 'correct',
            player: playerobj,
            card: c
        });
    }

    function leaveGame() {
        window.location.href = `/`;
    }

    function sendNameAndTeam() {
        sendMessage({
            type: 'setplayer',
            name: playername,
            team: playerteam
        });
    }

    mainCol['phase-0'].name.onblur = (e) => {
        playername = e.target.value;
        sendNameAndTeam();
    }

    mainCol['phase-0'].name.onkeypress = (e) => {
        if (e.key === 'Enter') {
            e.target.onblur(e);
        }
    }

    mainCol['phase-0'].teambtns.team0btn.onclick = mainCol['phase-0'].teambtns.team1btn.onclick = (e) => {
        playerteam = Number.parseInt(e.target.value);
        sendNameAndTeam();
    }

    mainCol['phase-0'].startbtn.onclick = () => {
        sendMessage({
            type: 'start'
        });
    }

    chatCol.sendbtn.onclick = () => {
        let m = chatCol.messagetxt.value;
        chatCol.messagetxt.value = '';
        chatCol.messagetxt.focus();
        if (m.trim().length > 0) {
            sendMessage({
                type: 'chat',
                message: m
            });
        }
    }

    chatCol.messagetxt.onkeypress = (e) => {
        if (e.key === 'Enter') {
            chatCol.sendbtn.onclick();
        }
    }

    createSocket();
});