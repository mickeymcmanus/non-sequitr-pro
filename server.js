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

    socket.on('check-room', ({ roomCode }, callback) => {
        const exists = rooms.has(roomCode);
        console.log(`Room check: ${roomCode} - Exists: ${exists}`);
        callback({ exists, roomCode });
    });

    socket.on('join-room', ({ userName, roomCode, voiceData }) => {
        socket.userName = userName;
        socket.roomCode = roomCode;

        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, {
                participants: [],
                conversationHistory: [],
                keyTopics: new Map()
            });
            console.log(`Created new room: ${roomCode}`);
        } else {
            console.log(`${userName} joining existing room: ${roomCode}`);
        }

        const room = rooms.get(roomCode);
        
        const newParticipant = {
            id: socket.id,
            name: userName,
            voiceProfile: voiceData
        };
        
        room.participants.push(newParticipant);

        if (voiceData) {
            voiceProfiles.set(socket.id, voiceData);
        }

        socket.join(roomCode);

        // Send updated participant list to EVERYONE in the room
        io.to(roomCode).emit('participant-joined', {
            participants: room.participants.map(p => ({ name: p.name, id: p.id })),
            newParticipant: { name: userName, id: socket.id }
        });

        // Send conversation history only to the new joiner
        socket.emit('conversation-history', room.conversationHistory);

        console.log(`${userName} joined room ${roomCode} (${room.participants.length} total participants)`);
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

        // Update key topics
        const words = original.toLowerCase().split(' ');
        const translatedWords = translated.toLowerCase().split(' ');
        changedIndices.forEach(idx => {
            if (words[idx] && translatedWords[idx]) {
                room.keyTopics.set(words[idx], translatedWords[idx]);
            }
        });

        // Broadcast to everyone in the room (including sender for confirmation)
        io.to(socket.roomCode).emit('new-message', message);
        
        console.log(`Message in ${socket.roomCode} from ${socket.userName}: "${original}" → "${translated}"`);
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
            `Remember when we were talking about ${replacement}?`,
            `Hold on, ${replacement}? Really?`,
            `Can we circle back to ${replacement}?`
        ];

        const callbackText = callbacks[Math.floor(Math.random() * callbacks.length)];

        // Send to everyone in the room
        io.to(socket.roomCode).emit('callback-message', {
            text: callbackText,
            reference: replacement,
            speaker: socket.userName,
            timestamp: new Date().toISOString()
        });
    });

    socket.on('disconnect', () => {
        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                room.participants = room.participants.filter(p => p.id !== socket.id);
                
                // Notify everyone that someone left
                io.to(socket.roomCode).emit('participant-left', {
                    userName: socket.userName,
                    participants: room.participants.map(p => ({ name: p.name, id: p.id }))
                });

                if (room.participants.length === 0) {
                    rooms.delete(socket.roomCode);
                    console.log(`Deleted empty room: ${socket.roomCode}`);
                } else {
                    console.log(`${socket.userName} left room ${socket.roomCode} (${room.participants.length} remaining)`);
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
    console.log(`Server ready for multi-user creative confusion!`);
});
