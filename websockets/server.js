import express from 'express';
import http from 'http'
import ViteExpress from 'vite-express';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

const app = express();

const GLOBAL_ADMIN_PASSWORD = process.env.GLOBAL_ADMIN_PASSWORD || 'insecurePassword';
const globalAdmins = new Set();

let profanityData = { swears: [], slurs: [] };
const filterPath = process.env.NODE_ENV === 'production'
    ? path.resolve('./dist/filter.json')
    : path.resolve('./public/filter.json');

const loadFilter = () => {
    try {
        const data = fs.readFileSync(filterPath, 'utf8');
        profanityData = JSON.parse(data);
        console.log(`Loaded ${profanityData.swears.length} swears and ${profanityData.slurs.length} slurs from filter.json`);
        return true;
    } catch (error) {
        console.warn('Could not load filter, globally disabled');
        console.error('Error loading filter:', error);
        return false;
    }
}

const saveFilter = () => {
    try {
        fs.writeFileSync(filterPath, JSON.stringify(profanityData, null, 2), 'utf8');
        console.log('Filter saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving filter:', error);
        return false;
    }
};

loadFilter();

const server = http.createServer(app);
const socketServer = new WebSocketServer({ server });
const rooms = new Map(); // roomPin -> { clients: Set, users: Set, messages: Array, admin: string, profanityFilter: string }

const filterProfanity = (text, filterLevel) => {
    if (filterLevel === 'none') return { filteredText: text, wasFiltered: false };

    let filteredText = text;
    let wasFiltered = false;
    let wordsToFilter = [];

    // Determine which words to filter based on level
    switch (filterLevel) {
        case 'swears':
            wordsToFilter = profanityData.swears;
            break;
        case 'slurs':
            wordsToFilter = profanityData.slurs;
            break;
        case 'both':
            wordsToFilter = [...profanityData.swears, ...profanityData.slurs];
            break;
        default:
            return { filteredText: text, wasFiltered: false };
    }

    const words = filteredText.split(/(\s+)/);

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (/^\s+$/.test(word)) continue;

        const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();

        const matchedWord = wordsToFilter.find(filterWord =>
            cleanWord === filterWord.toLowerCase()
        );

        if (matchedWord) {
            wasFiltered = true;
            const punctuation = word.replace(/\w/g, '');
            words[i] = '*'.repeat(matchedWord.length) + punctuation.replace(/\w/g, '');
        }
    }

    filteredText = words.join('');

    return { filteredText, wasFiltered };
};

const broadcastUserList = (roomPin) => {
    const room = rooms.get(roomPin);
    if (!room) return;

    const userList = Array.from(room.users);
    const userListMessage = JSON.stringify({ 
        type: 'userList', 
        users: userList 
    });
    
    console.log(`Broadcasting user list for room ${roomPin}:`, userList);

    room.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(userListMessage);
        }
    });
};

const broadcastToRoom = (roomPin, message, excludeClient = null) => {
    const room = rooms.get(roomPin);
    if (!room) return;

    room.clients.forEach(client => {
        if (client !== excludeClient && client.readyState === client.OPEN) {
            client.send(message);
        }
    });
};

const sendMessageHistory = (client, roomPin) => {
    const room = rooms.get(roomPin);
    if (!room) return;

    room.messages.forEach(msg => {
        client.send(JSON.stringify(msg));
    });
};

socketServer.on('connection', client => {
    console.log('Client connected!');
    
    client.on('message', msg => {
        const data = JSON.parse(msg.toString());
        console.log('Received:', data);

        if (data.type === 'globalAdminLogin') {
            if (data.password === GLOBAL_ADMIN_PASSWORD) {
                client.isGlobalAdmin = true;
                globalAdmins.add(client);

                if (!profanityData.swears || !profanityData.slurs) {
                    loadFilter();
                }

                client.send(JSON.stringify({
                    type: 'globalAdminStatus',
                    isGlobalAdmin: true,
                    filterData: profanityData
                }));
                console.log(`Global admin logged in`);
            } else {
                client.send(JSON.stringify({
                    type: 'globalAdminStatus',
                    isGlobalAdmin: false,
                    error: 'Invalid password'
                }));
            }
        } else if (data.type === 'updateFilterData') {
            if (client.isGlobalAdmin) {
                profanityData = data.filterData;
                if (saveFilter()) {
                    globalAdmins.forEach(admin => {
                        if (admin.readyState === admin.OPEN) {
                            admin.send(JSON.stringify({
                                type: 'filterDataUpdated',
                                filterData: profanityData
                            }));
                        }
                    });
                    console.log('Filter data updated by global admin');
                } else {
                    client.send(JSON.stringify({
                        type: 'error',
                        message: 'Failed to save filter data'
                    }));
                }
            }
        } else if (data.type === 'join') {
            const roomPin = data.room;
            
            let isGlobalAdminUser = false;
            if (data.globalAdminPassword && data.globalAdminPassword === GLOBAL_ADMIN_PASSWORD) {
                client.isGlobalAdmin = true;
                globalAdmins.add(client);
                isGlobalAdminUser = true;
                console.log(`Global admin ${data.name} joined room ${roomPin}`);
            }

            // Initialize room if it doesn't exist
            if (!rooms.has(roomPin)) {
                rooms.set(roomPin, {
                    clients: new Set(),
                    users: new Set(),
                    messages: [],
                    admin: data.name,
                    profanityFilter: data.profanityFilter || 'none'
                });
            }

            const room = rooms.get(roomPin);
            
            // Add client to room
            client.roomPin = roomPin;
            client.userName = data.name;
            client.isAdmin = (room.admin === data.name) || client.isGlobalAdmin;
            room.clients.add(client);
            room.users.add(data.name);

            console.log(`User ${data.name} joined room ${roomPin} - Admin: ${client.isAdmin} (Global: ${client.isGlobalAdmin || false})`);

            // Send message history to the new client
            sendMessageHistory(client, roomPin);

            // Send admin status
            client.send(JSON.stringify({
                type: 'adminStatus',
                isAdmin: client.isAdmin,
                isGlobalAdmin: client.isGlobalAdmin || false,
                adminName: room.admin
            }));

            // Send room settings
            client.send(JSON.stringify({
                type: 'roomSettings',
                profanityFilter: room.profanityFilter
            }));

            // Broadcast updated user list to all clients in the room
            broadcastUserList(roomPin);

            // Create and store join message
            const joinMessage = {
                id: Date.now() + Math.random(),
                type: 'join',
                name: data.name,
                message: data.message,
                timestamp: new Date().toISOString()
            };
            room.messages.push(joinMessage);
            
            // Broadcast join message to other clients in the room
            broadcastToRoom(roomPin, JSON.stringify(joinMessage), client);

            client.send(JSON.stringify({
                id: Date.now() + Math.random(),
                type: 'join',
                name: data.name,
                message: `You joined the chat`,
                timeStamp: new Date().toISOString(),
                isYou: true
            }));
        } else if (data.type === 'leave') {
            const roomPin = data.room || client.roomPin;
            console.log(`User ${data.name} left room ${roomPin}`);

            const leaveMessage = {
                id: Date.now() + Math.random(),
                type: 'leave',
                name: data.name,
                message: `${data.name} has left the chat`,
                timestamp: new Date().toISOString()
            };

            const room = rooms.get(roomPin);
            if (room) {
                room.messages.push(leaveMessage);
            }
            
            // Broadcast leave message to other clients in the room
            broadcastToRoom(roomPin, JSON.stringify(leaveMessage), client);

        } else if (data.type === 'message') {
            const roomPin = data.room || client.roomPin;
            const room = rooms.get(roomPin);

            if (room) {
                // Filter message content based on room's filter level
                const { filteredText, wasFiltered } = filterProfanity(data.message, room.profanityFilter);
                
                // Create message with filtered content
                const messageData = {
                    id: Date.now() + Math.random(),
                    type: 'message',
                    name: client.userName,
                    message: filteredText,
                    timestamp: new Date().toISOString(),
                    filtered: wasFiltered
                };
                
                // Store message in room history
                room.messages.push(messageData);
                
                // Broadcast message to other clients in the same room
                broadcastToRoom(roomPin, JSON.stringify(messageData), client);
            }

        } else if (data.type === 'updateProfanityFilter') {
            if (client.isAdmin) {
                const room = rooms.get(client.roomPin);
                if (room) {
                    room.profanityFilter = data.filterLevel;
                    
                    // Broadcast filter change to all clients in the room
                    const settingsMessage = JSON.stringify({
                        type: 'roomSettings',
                        profanityFilter: room.profanityFilter
                    });
                    
                    // Send to all clients in the room including admin
                    room.clients.forEach(roomClient => {
                        if (roomClient.readyState === roomClient.OPEN) {
                            roomClient.send(settingsMessage);
                        }
                    });
                    
                    console.log(`${client.isGlobalAdmin ? 'Global admin' : 'Admin'} ${client.userName} updated filter to '${room.profanityFilter}' in room ${client.roomPin}`);
                }
            }

        } else if (data.type === 'deleteMessage') {
            if (client.isAdmin) {
                const room = rooms.get(client.roomPin);
                if (room) {
                    room.messages = room.messages.filter(msg => msg.id !== data.messageId);

                    const deletionMessage = JSON.stringify({
                        type: 'messageDeleted',
                        messageId: data.messageId
                    });

                    // Send to all clients in the room including admin
                    room.clients.forEach(roomClient => {
                        if (roomClient.readyState === roomClient.OPEN) {
                            roomClient.send(deletionMessage);
                        }
                    });

                    console.log(`${client.isGlobalAdmin ? 'Global admin' : 'Admin'} ${client.userName} deleted message with ID ${data.messageId}`);
                }
            }
        } else if (data.type === 'kickUser') {
            if (client.isAdmin) {
                const room = rooms.get(client.roomPin);
                if (room) {
                    room.clients.forEach(target => {
                        if (target.userName === data.userName && target !== client) {
                            target.send(JSON.stringify({
                                type: 'kicked',
                                message: `You have been kicked from room ${client.roomPin}`
                            }));
                            target.close();
                        }
                    });

                    console.log(`${client.isGlobalAdmin ? 'Global admin' : 'Admin'} ${client.userName} kicked user ${data.userName}`);
                }
            }
        }
    });

    client.on('close', () => {
        console.log('Client disconnected');

        if (client.isGlobalAdmin) {
            globalAdmins.delete(client);
        }
        
        if (client.roomPin && client.userName) {
            const room = rooms.get(client.roomPin);
            if (room) {
                // Remove client from room
                room.clients.delete(client);
                room.users.delete(client.userName);

                // Create and store leave message
                const leaveMessage = {
                    id: Date.now() + Math.random(),
                    type: 'leave',
                    name: client.userName,
                    message: `${client.userName} has left the chat`,
                    timestamp: new Date().toISOString()
                };
                room.messages.push(leaveMessage);
                
                broadcastToRoom(client.roomPin, JSON.stringify(leaveMessage), client);
                broadcastUserList(client.roomPin);

                // Clean up empty rooms
                if (room.clients.size === 0) {
                    rooms.delete(client.roomPin);
                    console.log(`Room ${client.roomPin} deleted - no users remaining`);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Global admin password: ${GLOBAL_ADMIN_PASSWORD}`);
});
ViteExpress.bind(app, server);