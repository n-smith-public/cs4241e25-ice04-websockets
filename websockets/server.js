import dotenv from 'dotenv';
import express from 'express';
import http from 'http'
import ViteExpress from 'vite-express';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

dotenv.config();
const app = express();

const GLOBAL_ADMIN_PASSWORD = process.env.GLOBAL_ADMIN_PASSWORD || 'insecurePassword';
const globalAdmins = new Set();

// Load in filter data from filter.json
let profanityData = { swears: [], slurs: [] };
const filterPath = process.env.NODE_ENV === 'production'
    ? path.resolve('./dist/filter.json')
    : path.resolve('./public/filter.json');

// Dynamic loading
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

// Save filter data changes to filter.json via overwriting
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

// Load the filter in at startup
loadFilter();

// Create a new HTTP server and WebSocket server
const server = http.createServer(app);
const socketServer = new WebSocketServer({ server });
const rooms = new Map();

// Handles filtering based on a regex exact match
// Used to be wildcard, but it led to false positives
const filterProfanity = (text, filterLevel) => {
    // If no filter is set, don't even bother doing anything else
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

    // Split the message up into its individual words
    const words = filteredText.split(/(\s+)/);

    // Go through each word, and check if any of them need to be filtered
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        // Skip empty words or whitespace-only words
        if (/^\s+$/.test(word)) continue;

        // Sanitize the word by removing any punctuation and converting to lowercase
        const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();

        // Check if the sanitized word matches any of words in the enabled filter(s)
        const matchedWord = wordsToFilter.find(filterWord =>
            cleanWord === filterWord.toLowerCase()
        );

        // If it was a match, re-add the punctuation, but replace the word with asterisks
        if (matchedWord) {
            wasFiltered = true;
            const punctuation = word.replace(/\w/g, '');
            words[i] = '*'.repeat(matchedWord.length) + punctuation.replace(/\w/g, '');
        }
    }

    // Add the filtered words back together
    filteredText = words.join('');

    return { filteredText, wasFiltered };
};

// Send the list of users in a room to all clients
const broadcastUserList = (roomPin) => {
    // Get the current room
    const room = rooms.get(roomPin);
    // If not in a room, do nothing
    if (!room) return;

    // Create a list of users in the room as an array
    const userList = Array.from(room.users);
    // Turn the array into a JSON string
    const userListMessage = JSON.stringify({ 
        type: 'userList', 
        users: userList 
    });
    
    console.log(`Broadcasting user list for room ${roomPin}:`, userList);

    // Send the user list to all clients in the room
    room.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(userListMessage);
        }
    });
};

// Send a message to all clients in a room, excluding the sender
const broadcastToRoom = (roomPin, message, excludeClient = null) => {
    const room = rooms.get(roomPin);
    if (!room) return;

    // For every client in the room, except the one that sent the message, send the message
    room.clients.forEach(client => {
        if (client !== excludeClient && client.readyState === client.OPEN) {
            client.send(message);
        }
    });
};

// Send the message history to a client when they join a room
const sendMessageHistory = (client, roomPin) => {
    const room = rooms.get(roomPin);
    if (!room) return;

    room.messages.forEach(msg => {
        client.send(JSON.stringify(msg));
    });
};

// Handle connecting to the WebSocket server
socketServer.on('connection', client => {
    console.log('Client connected!');
    
    // On a new message being received from the client
    client.on('message', msg => {
        // Parse it into a string
        const data = JSON.parse(msg.toString());
        console.log('Received:', data);

        switch (data.type) {
            // If trying to log in as a global admin
            case 'globalAdminLogin':
                if (data.password === GLOBAL_ADMIN_PASSWORD) {
                // If it is, the user is now a global admin
                client.isGlobalAdmin = true;
                globalAdmins.add(client);

                // If the filter isn't loaded, load it
                if (!profanityData.swears || !profanityData.slurs) {
                    loadFilter();
                }

                // Send the global admin status and current filter data to the client
                client.send(JSON.stringify({
                    type: 'globalAdminStatus',
                    isGlobalAdmin: true,
                    filterData: profanityData
                }));
                console.log(`Global admin logged in`);
                break;
            } else {
                // If it isn't, send an error message
                client.send(JSON.stringify({
                    type: 'globalAdminStatus',
                    isGlobalAdmin: false,
                    error: 'Invalid password'
                }));
                break;
            }
            // Global Admin - Updating filter data
            case 'updateFilterData':
                if (client.isGlobalAdmin) {
                    // Save the new filter data
                    profanityData = data.filterData;
                    // If able to save to the filter file, broadcast the updated filter data to all global admins
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
                        break;
                    } else {
                        // Otherwise, send an error message to the client
                        client.send(JSON.stringify({
                            type: 'error',
                            message: 'Failed to save filter data'
                        }));
                        break;
                    }
                }
                break;
            // Joining/Creating a room
            case 'join':
                const roomPin = data.room;

                // By default, user is not a global admin
                let isGlobalAdminUser = false;
                // If the user provided a global admin password, check if it matches
                if (data.globalAdminPassword && data.globalAdminPassword === GLOBAL_ADMIN_PASSWORD) {
                    // If so, make them a global admin for this session
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
                break;
            // Leaving a room
            case 'leave':
                // Fetch the room pin the client is in currently
                const leaveRoomPin = data.room || client.roomPin;
                console.log(`User ${data.name} left room ${leaveRoomPin}`);
                // Create a leave message object
                const leaveMessage = {
                    id: Date.now() + Math.random(),
                    type: 'leave',
                    name: data.name,
                    message: `${data.name} has left the chat`,
                    timestamp: new Date().toISOString()
                };
                // Remove client from the room
                const leaveRoom = rooms.get(leaveRoomPin);
                if (leaveRoom) {
                    // Send the leave message to the client
                    leaveRoom.messages.push(leaveMessage);
                }
                // Broadcast leave message to other clients in the room
                broadcastToRoom(leaveRoomPin, JSON.stringify(leaveMessage), client);
                break;
            // Sending a message
            case 'message':
                // Get the room the message is being sent to
                const messageRoomPin = data.room || client.roomPin;
                const messageRoom = rooms.get(messageRoomPin);

                // If the room exists
                if (messageRoom) {
                    // Store the message as an object
                    const message = {
                        id: Date.now() + Math.random(),
                        type: 'message',
                        name: data.name,
                        message: data.message,
                        timestamp: new Date().toISOString()
                    };
                    messageRoom.messages.push(message);
                    // Send the message to all clients in the room
                    broadcastToRoom(messageRoomPin, JSON.stringify(message), client);
                }
                break;
            // Admin Action - Update Chat Room Filter Settings
            case 'updateProfanityFilter':
                // If the user is an admin
                if (client.isAdmin) {
                    const newFilter = data.filter;
                    if (newFilter) {
                        room.profanityFilter = newFilter;
                        client.send(JSON.stringify({
                            type: 'profanityFilterUpdated',
                            filter: newFilter
                        }));
                    }
                }
                break;
            // Admin Action - Delete a message
            case 'deleteMessage':
                if (client.isAdmin) {
                    const deleteRoom = rooms.get(client.roomPin);
                    if (deleteRoom) {
                        deleteRoom.messages = deleteRoom.messages.filter(msg => msg.id !== data.messageId);

                        const deletionMessage = JSON.stringify({
                            type: 'messageDeleted',
                            messageId: data.messageId
                        });

                        // Send to all clients in the room including admin
                        deleteRoom.clients.forEach(roomClient => {
                            if (roomClient.readyState === roomClient.OPEN) {
                                roomClient.send(deletionMessage);
                            }
                        });

                        console.log(`${client.isGlobalAdmin ? 'Global admin' : 'Admin'} ${client.userName} deleted message with ID ${data.messageId}`);
                    }
                }
                break;
            // Admin Action - Kick a user from the room
            case 'kickUser':
                if (client.isAdmin) {
                    const kickRoom = rooms.get(client.roomPin);
                    if (kickRoom) {
                        kickRoom.clients.forEach(target => {
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
                break;
            // Base case - Unknown message type
            default:
                console.warn(`Unknown message type: ${data.type}`);
                client.send(JSON.stringify({
                    type: 'error',
                    message: `Unknown message type: ${data.type}`
                }));
                break;
        }
    });

    // On closing connection to the websocket server
    client.on('close', () => {
        console.log('Client disconnected');

        // If the client is a global admin, remove them from the global admins set
        if (client.isGlobalAdmin) {
            globalAdmins.delete(client);
        }
        
        // If the client is in a room, remove them from that room
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

// Broadcast the server to internet
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Global admin password: ${GLOBAL_ADMIN_PASSWORD}`);
});
ViteExpress.bind(app, server);