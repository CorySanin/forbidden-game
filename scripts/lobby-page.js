document.addEventListener('DOMContentLoaded', function () {
    let roomList = document.getElementById('room-list');
    let roomName = document.getElementById('room-name');
    let privateRoom = document.getElementById('private-room');
    let createRoomBtn = document.getElementById('create-room-btn');
    let roomCode = document.getElementById('room-code');
    let joinRoomBtn = document.getElementById('join-room-btn');

    function createSocket() {
        try {
            let loc = window.location;
            let ws = new WebSocket(`${loc.protocol === 'http:' ? 'ws:' : 'wss:'}//${loc.host}/ws/lobbylist`);
            ws.onmessage = (message) => {
                let msg = JSON.parse(message.data);
                if(msg.type === 'rooms'){
                    listRooms(msg.rooms);
                }
            }

            ws.onclose = () => setTimeout(createSocket, 3000);
        }
        catch (ex){
            console.log(ex);
            setTimeout(createSocket, 5000);
        }
    }

    function listRooms(rooms) {
        removeRooms();
        rooms.forEach(room => {
            let d = document.createElement('div');
            let child = document.createElement('div');
            child.className = 'room-name';
            child.appendChild(document.createTextNode(room.name));
            d.appendChild(child);
            child = document.createElement('div');
            child.className = 'room-code';
            child.appendChild(document.createTextNode(room.id));
            d.appendChild(child);
            d.className = 'room';
            d.onclick = () => joinRoom(room.id);
            roomList.appendChild(d);
        });
    }

    function removeRooms() {
        while (roomList.firstChild) {
            roomList.removeChild(roomList.lastChild);
        }
    }

    function joinRoom(id) {
        window.location.href = `/room/${id}`;
    }

    async function createRoom() {
        const serverlist = (await (await fetch('/api/v1/servers')).json()).servers;
        if (serverlist.length > 0) {
            let shortestPing = -1;
            let bestServer = null;
            for(let i = 0; i < serverlist.length; i++){
                let server = serverlist[i];
                let ping = (new Date()).getTime();
                await fetch(`${server.url}/ping`);
                ping = (new Date()).getTime() - ping;
                if(shortestPing < 0 || ping < shortestPing){
                    shortestPing = ping;
                    bestServer = server;
                }
            }
            const response = (await (await fetch(
                '/api/v1/room',
                {
                    method: 'POST',
                    cache: 'no-cache',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: roomName.value,
                        server: bestServer.url,
                        private: privateRoom.checked
                    })
                }
            )).json());
            if(response.success){
                joinRoom(response.room.id);
            }
        }
    }

    function bindEnterToButton(input, btn){
        input.onkeypress = (e) => {
            if (e.key === 'Enter') {
                btn.click();
            }
        }
    }

    createRoomBtn.onclick = createRoom;

    joinRoomBtn.onclick = (e) => joinRoom(roomCode.value);

    bindEnterToButton(roomName, createRoomBtn);

    bindEnterToButton(roomCode, joinRoomBtn);

    createSocket();
});