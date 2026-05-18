const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static(__dirname + '/public'));

const historyFilePath = path.join(__dirname, 'messages.json');
const users = {};

// Helper tool to generate current standard India time string securely
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
        console.error("Error reading history file, starting fresh:", err);
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

io.on('connection', (socket) => {
    console.log('A temporary connection established.');

    socket.on('store username', (username) => {
        users[socket.id] = username;
        console.log(`${username} has officially joined.`);
        io.emit('update user list', Object.values(users));

        const pastMessages = getChatHistory();
        socket.emit('load history', pastMessages);
    });

    socket.on('chat message', (msg) => {
        const senderName = users[socket.id] || "Anonymous";

        const messageData = {
            text: msg,
            username: senderName,
            timestamp: getIndiaTime() // Proper Indian time stamp injected
        };

        saveToHistory(messageData);
        io.emit('chat message', messageData);
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            console.log(`${users[socket.id]} disconnected.`);
            delete users[socket.id];
            io.emit('update user list', Object.values(users));
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running safely.`);
});