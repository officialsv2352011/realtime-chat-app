const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static(__dirname + '/public'));

const historyFilePath = path.join(__dirname, 'messages.json');
const users = {};

function getIndiaTime() {
    return new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function getChatHistory() {
    try {
        if (fs.existsSync(historyFilePath)) {
            const fileData = fs.readFileSync(historyFilePath, 'utf8');
            return JSON.parse(fileData || '[]');
        }
    } catch (err) {
        console.error("Error reading history file:", err);
    }
    return [];
}

function saveToHistory(messageObject) {
    try {
        const currentHistory = getChatHistory();
        currentHistory.push(messageObject);
        if (currentHistory.length > 100) currentHistory.shift(); 
        fs.writeFileSync(historyFilePath, JSON.stringify(currentHistory, null, 2), 'utf8');
    } catch (err) {
        console.error("Error writing to history file:", err);
    }
}

function rewriteHistoryFile(updatedHistory) {
    try {
        fs.writeFileSync(historyFilePath, JSON.stringify(updatedHistory, null, 2), 'utf8');
    } catch (err) {
        console.error("Error updating history file:", err);
    }
}

io.on('connection', (socket) => {
    socket.on('store username', (username) => {
        users[socket.id] = username;
        io.emit('update user list', Object.values(users));
        
        // System Log: User connection notification
        io.emit('system notification', `${username} ESTABLISHED CONNECTION`);

        const pastMessages = getChatHistory();
        socket.emit('load history', pastMessages);
    });

    socket.on('chat message', (msg) => {
        const senderName = users[socket.id] || "Anonymous";

        const messageData = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            text: msg,
            username: senderName,
            timestamp: getIndiaTime(),
            edited: false
        };

        saveToHistory(messageData);
        io.emit('chat message', messageData);
    });

    // --- LIVE TYPING ENGINES ---
    socket.on('typing', () => {
        const username = users[socket.id];
        if (username) {
            socket.broadcast.emit('user typing', { id: socket.id, username: username });
        }
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('user stop typing', socket.id);
    });

    // --- MESSAGE EDIT HANDLING ---
    socket.on('edit message', (data) => {
        let currentHistory = getChatHistory();
        const targetIndex = currentHistory.findIndex(m => m.id === data.id);
        
        if (targetIndex !== -1) {
            currentHistory[targetIndex].text = data.text;
            currentHistory[targetIndex].edited = true;
            rewriteHistoryFile(currentHistory);
            io.emit('message edited', { id: data.id, text: data.text });
        }
    });

    // --- MESSAGE DELETE HANDLING ---
    socket.on('delete message', (msgId) => {
        let currentHistory = getChatHistory();
        const initialLength = currentHistory.length;
        currentHistory = currentHistory.filter(m => m.id !== msgId);
        
        if (currentHistory.length !== initialLength) {
            rewriteHistoryFile(currentHistory);
            io.emit('message deleted', msgId);
        }
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            const leftUser = users[socket.id];
            io.emit('system notification', `${leftUser} LINK SEVERED / DISCONNECTED`);
            delete users[socket.id];
            io.emit('update user list', Object.values(users));
            io.emit('user stop typing', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running safely on port ${PORT}`);
});