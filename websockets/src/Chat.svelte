<script>
  import { createEventDispatcher } from 'svelte';

  export let roomPin;
  export let displayName;
  export let profanityFilter = 'none';
  export let globalAdminPassword = '';

  const dispatch = createEventDispatcher();

  let msgs = [];
  let messageInput = '';
  let connectedUsers = [];
  let ws;
  let isAdmin = false;
  let adminName = '';
  let showAdminPanel = false;
  let roomProfanityFilter = 'none';
  let isGlobalAdmin = false;

  const connectToChat = () => {
    const wsProtocol = window.location.protocol === "https:" ? 'wss:' : 'ws:';
    const isDev = window.location.port === '5173'; // Vite dev server port
    const wsHost = isDev ? 'localhost:3000' : window.location.host;
    ws = new WebSocket(`${wsProtocol}//${wsHost}`);

    ws.onopen = () => {
        const joinMessage = {
            type: 'join',
            room: roomPin,
            name: displayName,
            message: `${displayName} has joined the chat`,
            profanityFilter: profanityFilter
        }
        
        if (globalAdminPassword) {
            joinMessage.globalAdminPassword = globalAdminPassword;
        }

        ws.send(JSON.stringify(joinMessage));
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log('Received:', data);

      if (data.type === 'userList') {
        connectedUsers = data.users;
      } else if (data.type === 'adminStatus') {
        isAdmin = data.isAdmin;
        isGlobalAdmin = data.isGlobalAdmin || false;
        adminName = data.adminName;
        console.log(`Admin status: isAdmin=${isAdmin}, isGlobalAdmin=${isGlobalAdmin}`);
      } else if (data.type === 'roomSettings') {
        roomProfanityFilter = data.profanityFilter;
      } else if (data.type === 'messageDeleted') {
        msgs = msgs.filter(msg => msg.id !== data.messageId);
      } else if (data.type === 'kicked') {
        alert(data.message);
        leaveRoom();
      } else {
        msgs = msgs.concat([data]);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };
  };

  const send = () => {
    if (messageInput.trim() && ws) {
      const messageData = {
        id: Date.now() + Math.random(),
        type: 'message',
        room: roomPin,
        name: displayName,
        message: messageInput,
        timestamp: new Date().toISOString()
      };

      ws.send(JSON.stringify(messageData));
      msgs = msgs.concat([messageData]);
      messageInput = '';
    }
  };
  
  const updateProfanityFilter = (event) => {
    if (isAdmin) {
      const newFilterLevel = event.target.value;
      ws.send(JSON.stringify({
        type: 'updateProfanityFilter',
        filterLevel: newFilterLevel
      }));
    }
  };

  const deleteMessage = (messageId) => {
    if (isAdmin && confirm('Are you sure you want to delete this message?')) {
      ws.send(JSON.stringify({
        type: 'deleteMessage',
        messageId: messageId
      }));
    }
  };

  const kickUser = (userName) => {
    if (isAdmin && userName !== displayName && confirm(`Are you sure you want to kick ${userName}?`)) {
      ws.send(JSON.stringify({
        type: 'kickUser',
        userName: userName
      }));
    }
  };

  const leaveRoom = () => {
    if (ws) {
      ws.close();
    }
    dispatch('leaveRoom');
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      send();
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getFilterDisplayText = (filter) => {
    switch(filter) {
      case 'none': return 'OFF';
      case 'swears': return 'Swears Only';
      case 'slurs': return 'Slurs Only';
      case 'both': return 'Swears & Slurs';
      default: return 'OFF';
    }
  };

  // Connect when component mounts
  connectToChat();
</script>

<div class="chat-container">
  <div class="chat-header">
    <div class="room-info">
      <h2>Room: {roomPin}</h2>
      <p>Welcome, {displayName}! 
        {#if isGlobalAdmin}
          Δ (Global Admin)
        {:else if isAdmin}
          Θ (Admin)
        {:else}
          (Admin: {adminName})
        {/if}
    </p>
      <p class="profanity-filter">Content Filter: <strong>{getFilterDisplayText(roomProfanityFilter)}</strong></p>
    </div>
    <div class="header-buttons">
      {#if isAdmin}
        <button class="admin-btn" on:click={() => showAdminPanel = !showAdminPanel}>
          {showAdminPanel ? 'Hide' : 'Show'} Admin Panel
        </button>
      {/if}
      <button class="leave-btn" on:click={leaveRoom}>Leave Room</button>
    </div>
  </div>

  {#if isAdmin && showAdminPanel}
    <div class="admin-panel">
      <h3>Admin Panel</h3>

      <div class="admin-section">
        <h4>Room Settings</h4>
        <div class="setting-item">
          <label for="adminFilterSelect">Content Filter Level:</label>
          <select id="adminFilterSelect" value={roomProfanityFilter} on:change={updateProfanityFilter}>
            <option value="none">No Filter</option>
            <option value="swears">Block Swearing Only</option>
            <option value="slurs">Block Slurs Only</option>
            <option value="both">Block Swearing & Slurs</option>
          </select>
          <p class="setting-description">
            {#if roomProfanityFilter === 'none'}
              No content filtering applied
            {:else if roomProfanityFilter === 'swears'}
              Blocks common swear words only
            {:else if roomProfanityFilter === 'slurs'}
              Blocks offensive slurs and hate speech only
            {:else if roomProfanityFilter === 'both'}
              Blocks both swear words and offensive slurs
            {/if}
          </p>
        </div>
      </div>
      
      <div class="admin-section">
        <h4>Manage Users</h4>
        <div class="user-management">
          {#each connectedUsers as user}
            <div class="user-item">
              <span>{user} {user === displayName ? '(You)' : ''} {user === adminName ? 'Θ' : ''}</span>
              {#if user !== displayName && user !== adminName}
                <button class="kick-btn" on:click={() => kickUser(user)}>Kick</button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <div class="users">
    <h3>Connected Users ({connectedUsers.length})</h3>
    <p class="user-list">
      {#if connectedUsers.length > 0}
        {connectedUsers.map(user => {
          let userDisplay = user === displayName ? `${user}` : user;
          if (user === adminName) userDisplay += ' Θ';
          return userDisplay;
        }).join(', ')}
      {:else}
        No users connected
      {/if}
    </p>
  </div>

  <div class="messages">
    {#each msgs as msg}
      <div class="message {msg.type}" data-message-id={msg.id}>
        {#if msg.type === 'join' || msg.type === 'leave'}
          <div class="system-message">
            <em class:your-join={msg.isYou}>{msg.message}</em>
            {#if msg.timestamp}
              <span class="timestamp">{formatTime(msg.timestamp)}</span>
            {/if}
          </div>
        {:else}
          <div class="user-message">
            <div class="message-header">
              <strong>{msg.name}:</strong>
              {#if msg.timestamp}
                <span class="timestamp">{formatTime(msg.timestamp)}</span>
              {/if}
              {#if msg.filtered}
                <span class="filtered-message" title="Content was filtered">[Filtered]</span>
              {/if}
              {#if isAdmin && msg.type === 'message'}
                <button class="delete-btn" on:click={() => deleteMessage(msg.id)}>&times;</button>
              {/if}
            </div>
            <div class="message-content">{msg.message}</div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="input">
    <input 
      type="text" 
      bind:value={messageInput} 
      on:keypress={handleKeyPress} 
      placeholder="Type a message..." 
    />
    <button on:click={send}>Send</button>
  </div>
</div>

<style>
  .chat-container {
    height: 85vh;
    display: flex;
    flex-direction: column;
    background: #3d3d3d;
    border-radius: 10px;
    padding: 20px;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #555;
  }

  .room-info h2 {
    margin: 0;
    color: #007bff;
    font-size: 1.5em;
  }

  .room-info p {
    margin: 5px 0 0 0;
    color: #ccc;
  }

  .profanity-filter {
    font-size: 14px;
    color: #ffc107 !important;
  }

  .header-buttons {
    display: flex;
    gap: 10px;
  }

  .admin-btn {
    padding: 10px 15px;
    background: #ffc107;
    color: #000;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .admin-btn:hover {
    background: #e0a800;
  }

  .leave-btn {
    padding: 10px 20px;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .leave-btn:hover {
    background: #c82333;
  }

  .admin-panel {
    background: #2a2a2a;
    border: 2px solid #ffc107;
    border-radius: 6px;
    padding: 15px;
    margin-bottom: 15px;
  }

  .admin-panel h3 {
    margin: 0 0 15px 0;
    color: #ffc107;
  }

  .admin-section {
    margin-bottom: 20px;
  }

  .admin-section h4 {
    margin: 0 0 10px 0;
    color: #ccc;
  }

  .setting-item {
    margin-bottom: 10px;
  }

  .setting-item label {
    display: block;
    color: #ccc;
    margin-bottom: 8px;
    font-weight: bold;
  }

  .setting-item select {
    width: 100%;
    padding: 8px;
    font-size: 14px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #4a4a4a;
    color: white;
    cursor: pointer;
  }

  .setting-item select option {
    background: #4a4a4a;
    color: white;
  }

  .setting-description {
    font-size: 12px;
    color: #aaa;
    margin: 8px 0 0 0;
    font-style: italic;
    min-height: 16px;
  }

  .user-management {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .user-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    background: #4a4a4a;
    border-radius: 4px;
  }

  .kick-btn {
    padding: 5px 10px;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .users {
    background: #4a4a4a;
    padding: 15px;
    border-radius: 6px;
    margin-bottom: 15px;
  }

  .users h3 {
    margin: 0 0 10px 0;
    color: #ccc;
    font-size: 16px;
  }

  .user-list {
    margin: 0;
    padding: 0;
    font-size: 14px;
    color: white;
    line-height: 1.4;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    border: 1px solid #555;
    padding: 15px;
    background: #686868;
    color: white;
    border-radius: 6px;
    margin-bottom: 15px;
  }

  .message {
    margin: 8px 0;
    padding: 8px;
    border-radius: 4px;
  }

  .message.join {
    background: rgba(144, 238, 144, 0.1);
  }

  .message.leave {
    background: rgba(255, 182, 193, 0.1);
  }

  .system-message {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-style: italic;
  }

  .system-message em {
    color: #90EE90;
  }

  .message.leave .system-message em {
    color: #FFB6C1;
  }

  .user-message .message-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }

  .message-content {
    padding-left: 0;
  }

  .timestamp {
    font-size: 12px;
    color: #aaa;
    font-style: normal;
  }

  .filtered-message {
    font-size: 14px;
    color: #ffc107;
  }

  .delete-btn {
    background: none;
    border: none;
    color: #dc3545;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    margin-left: auto;
  }

  .delete-btn:hover {
    background: rgba(220, 53, 69, 0.2);
    border-radius: 2px;
  }

  .input {
    display: flex;
    gap: 10px;
  }

  .input input {
    flex: 1;
    padding: 12px;
    font-size: 16px;
    border: 1px solid #ddd;
    border-radius: 6px;
  }

  .input button {
    padding: 12px 24px;
    font-size: 16px;
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .input button:hover {
    background-color: #218838;
  }

  .your-join {
    color: #87CEEB !important; /* Light blue for your own join message */
  }
</style>