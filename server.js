const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('public'));

const rooms = new Map();
const voiceProfiles = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ userName, roomCode, voiceData }) => {
        socket.userName = userName;
        socket.roomCode = roomCode;

        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, {
                participants: [],
                conversationHistory: [],
                keyTopics: new Map()
            });
        }

        const room = rooms.get(roomCode);
        
        room.participants.push({
            id: socket.id,
            name: userName,
            voiceProfile: voiceData
        });

        if (voiceData) {
            voiceProfiles.set(socket.id, voiceData);
        }

        socket.join(roomCode);

        io.to(roomCode).emit('participant-joined', {
            participants: room.participants.map(p => ({ name: p.name, id: p.id }))
        });

        socket.emit('conversation-history', room.conversationHistory);

        console.log(`${userName} joined room ${roomCode}`);
    });

    socket.on('new-transcript', ({ original, translated, changedIndices, speakerConfidence }) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;

        const message = {
            id: Date.now(),
            userName: socket.userName,
            socketId: socket.id,
            original,
            translated,
            changedIndices,
            timestamp: new Date().toISOString()
        };

        room.conversationHistory.push(message);
        if (room.conversationHistory.length > 50) {
            room.conversationHistory.shift();
        }

        const words = original.toLowerCase().split(' ');
        const translatedWords = translated.toLowerCase().split(' ');
        changedIndices.forEach(idx => {
            if (words[idx] && translatedWords[idx]) {
                room.keyTopics.set(words[idx], translatedWords[idx]);
            }
        });

        io.to(socket.roomCode).emit('new-message', message);
    });

    socket.on('request-callback', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.keyTopics.size === 0) return;

        const topics = Array.from(room.keyTopics.entries());
        const [original, replacement] = topics[Math.floor(Math.random() * topics.length)];

        const callbacks = [
            `Wait, did someone say ${replacement}?`,
            `Going back to that ${replacement} thing...`,
            `I'm still thinking about ${replacement}!`,
            `${replacement}? ${replacement}!`,
            `Remember when we were talking about ${replacement}?`
        ];

        const callbackText = callbacks[Math.floor(Math.random() * callbacks.length)];

        io.to(socket.roomCode).emit('callback-message', {
            text: callbackText,
            reference: replacement,
            timestamp: new Date().toISOString()
        });
    });

    socket.on('disconnect', () => {
        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                room.participants = room.participants.filter(p => p.id !== socket.id);
                
                io.to(socket.roomCode).emit('participant-left', {
                    userName: socket.userName,
                    participants: room.participants.map(p => ({ name: p.name, id: p.id }))
                });

                if (room.participants.length === 0) {
                    rooms.delete(socket.roomCode);
                }
            }
        }
        voiceProfiles.delete(socket.id);
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎭 Non-sequitR Pro server running on port ${PORT}`);
});