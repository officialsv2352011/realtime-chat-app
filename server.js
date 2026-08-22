const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

app.use(express.static(__dirname + '/public'));

// --- MONGODB CONNECTION SETUP ---
// Local MongoDB ya Mongo Atlas String use karein
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guptlok';

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected successfully to MongoDB Database'))
    .catch((err) => console.error('MongoDB Connection Error:', err));

// --- MESSAGE SCHEMA & MODEL ---
const messageSchema = new mongoose.Schema({
    id: String,
    text: String,
    username: String,
    timestamp: String,
    edited: { type: Boolean, default: false }
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

const users = {};

function getIndiaTime() {
    return new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

io.on('connection', (socket) => {
    socket.on('store username', async (username) => {
        users[socket.id] = username;
        io.emit('update user list', Object.values(users));
        
        io.emit('system notification', `${username} ESTABLISHED CONNECTION`);

        // MongoDB se last 100 messages load karo
        try {
            const pastMessages = await Message.find().sort({ createdAt: 1 }).limit(100);
            socket.emit('load history', pastMessages);
        } catch (err) {
            console.error('Error fetching chat history:', err);
        }
    });

    socket.on('chat message', async (msg) => {
        const senderName = users[socket.id] || 'Anonymous';

        const messageData = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            text: msg,
            username: senderName,
            timestamp: getIndiaTime(),
            edited: false
        };

        // MongoDB mein message save karo
        try {
            const newMsg = new Message(messageData);
            await newMsg.save();
            io.emit('chat message', messageData);
        } catch (err) {
            console.error('Error saving message:', err);
        }
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
    socket.on('edit message', async (data) => {
        try {
            await Message.findOneAndUpdate({ id: data.id }, { text: data.text, edited: true });
            io.emit('message edited', { id: data.id, text: data.text });
        } catch (err) {
            console.error('Error editing message:', err);
        }
    });

    // --- MESSAGE DELETE HANDLING ---
    socket.on('delete message', async (msgId) => {
        try {
            await Message.findOneAndDelete({ id: msgId });
            io.emit('message deleted', msgId);
        } catch (err) {
            console.error('Error deleting message:', err);
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