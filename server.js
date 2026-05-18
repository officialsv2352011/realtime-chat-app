const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); // Built-in Node.js tool to read/write files
const path = require('path');

app.use(express.static(__dirname + '/public'));

const historyFilePath = path.join(__dirname, 'messages.json');
const users = {};

// Helper function to read saved chat history from the disk safely
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

// Helper function to save a new message to the history file permanently
function saveToHistory(messageObject) {
    try {
        const currentHistory = getChatHistory();
        currentHistory.push(messageObject);
        // Keep only the last 100 messages so the file doesn't grow infinitely
        if (currentHistory.length > 100) currentHistory.shift(); 
        
        fs.writeFileSync(historyFilePath, JSON.stringify(currentHistory, null, 2), 'utf8');
    } catch (err) {
        console.error("Error writing to history file:", err);
    }
}

io.on('connection', (socket) => {
    console.log('A temporary connection established.');

    // Listen for when a user saves their username
    socket.on('store username', (username) => {
        users[socket.id] = username;
        console.log(`${username} has officially joined.`);

        // 1. Send the updated active users sidebar list to EVERYONE
        io.emit('update user list', Object.values(users));

        // 2. ONLY send the historical messages to THIS specific user who just joined
        const pastMessages = getChatHistory();
        socket.emit('load history', pastMessages);
    });

    // Listen for an incoming message
    socket.on('chat message', (msg) => {
        const senderName = users[socket.id] || "Anonymous";
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const messageData = {
            text: msg,
            username: senderName,
            timestamp: timeStr
        };

        // Save it to our local JSON database file
        saveToHistory(messageData);

        // Broadcast live to everyone currently active
        io.emit('chat message', messageData);
    });

    // Handle user disconnecting
    socket.on('disconnect', () => {
        if (users[socket.id]) {
            console.log(`${users[socket.id]} disconnected.`);
            delete users[socket.id];
            io.emit('update user list', Object.values(users));
        }
    });
});

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});