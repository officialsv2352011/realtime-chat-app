const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static(__dirname + '/public'));

const historyFilePath = path.join(__dirname, 'messages.json');
const users = {};

// India (IST) ka perfect time lane ke liye tool
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

// History file ko overwrite karne ke liye tool (jab edit ya delete ho)
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

        const pastMessages = getChatHistory();
        socket.emit('load history', pastMessages);
    });

    socket.on('chat message', (msgData) => {
        const senderName = users[socket.id] || "Anonymous";
        
        // Dynamic packet validation checker (supports text string or structured object)
        let msgText = (typeof msgData === 'object') ? msgData.text : msgData;
        let msgId = (typeof msgData === 'object' && msgData.id) ? msgData.id : 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        const messageData = {
            id: msgId,
            username: senderName,
            text: msgText,
            timestamp: getIndiaTime(), // Indian Time save ho raha hai
            edited: false
        };

        saveToHistory(messageData);
        io.emit('chat message', messageData);
    });

    // --- NEW RECEPTOR: EDIT TRANSMISSION PACKET ---
    socket.on('edit message', (data) => {
        let currentHistory = getChatHistory();
        const targetIndex = currentHistory.findIndex(m => m.id === data.id);
        
        if (targetIndex !== -1) {
            currentHistory[targetIndex].text = data.text;
            currentHistory[targetIndex].edited = true;
            
            rewriteHistoryFile(currentHistory);
            
            // Sabhi active devices ko realtime modification broadcast karo
            io.emit('message edited', { id: data.id, text: data.text });
        }
    });

    // --- NEW RECEPTOR: PURGE/DELETE TRANSMISSION PACKET ---
    socket.on('delete message', (msgId) => {
        let currentHistory = getChatHistory();
        const initialLength = currentHistory.length;
        
        currentHistory = currentHistory.filter(m => m.id !== msgId);
        
        if (currentHistory.length !== initialLength) {
            rewriteHistoryFile(currentHistory);
            // Sabhi users ke grid se real-time message remove karo
            io.emit('message deleted', msgId);
        }
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            delete users[socket.id];
            io.emit('update user list', Object.values(users));
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running safely.`);
});