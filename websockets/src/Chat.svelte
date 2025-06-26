<script>
  import { createEventDispatcher } from 'svelte';
  import Header from './Header.svelte';
  import './chat.css';

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
  <Header />
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
      <p class="profanity-filter">🛡️ Content Filter: <strong>{getFilterDisplayText(roomProfanityFilter)}</strong></p>
    </div>
    <div class="flex flex-gap">
      {#if isAdmin}
        <button class="btn btn-warning btn-small" on:click={() => showAdminPanel = !showAdminPanel}>
          {showAdminPanel ? 'Hide' : 'Show'} Admin Panel
        </button>
      {/if}
      <button class="btn btn-danger btn-small" on:click={leaveRoom}>Leave Room</button>
    </div>
  </div>

  {#if isAdmin && showAdminPanel}
    <div class="container-admin margin-bottom">
      <h3 class="text-warning">Admin Panel</h3>
      
      <div class="section margin-bottom">
        <h4 class="section-admin">Room Settings</h4>
        <div class="margin-bottom">
          <label class="form-label" for="profanitySelect">Content Filter:</label>
          <select 
            class="form-input form-input-dark form-select"
            id="profanitySelect" 
            value={roomProfanityFilter} 
            on:change={updateProfanityFilter}
          >
            <option value="none">No Filter</option>
            <option value="swears">Block Swearing Only</option>
            <option value="slurs">Block Slurs Only</option>
            <option value="both">Block Swearing & Slurs</option>
          </select>
          <p class="setting-description">
            {#if roomProfanityFilter === 'none'}
              No content filtering applied
            {:else if roomProfanityFilter === 'swears'}
              Blocks common swear words
            {:else if roomProfanityFilter === 'slurs'}
              Blocks offensive slurs and hate speech
            {:else if roomProfanityFilter === 'both'}
              Blocks both swear words and offensive slurs
            {/if}
          </p>
        </div>
      </div>

      <div class="section">
        <h4 class="section-admin">Manage Users</h4>
        <div class="flex flex-column flex-gap-small">
          {#each connectedUsers as user}
            <div class="list-item-user flex justify-between align-center">
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

  <div class="users-section">
    <h3 class="users-title">Connected Users ({connectedUsers.length})</h3>
    <p class="user-list">
      {#if connectedUsers.length > 0}
        {connectedUsers.map(user => {
          let userDisplay = user === displayName ? `${user} (You)` : user;
          if (user === adminName) userDisplay += ' Θ';
          return userDisplay;
        }).join(', ')}
      {:else}
        No users connected
      {/if}
    </p>
  </div>

  <div class="messages-container margin-bottom">
    {#each msgs as msg}
      <div class="message {msg.type === 'join' ? 'message-join' : msg.type === 'leave' ? 'message-leave' : ''}" data-message-id={msg.id}>
        {#if msg.type === 'join' || msg.type === 'leave'}
          <div class="message-system">
            <em class:your-join={msg.isYou}>
              {msg.message}
              {#if msg.filtered}
                <span class="filtered-message">(filtered content)</span>
              {/if}
            </em>
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
              {#if isAdmin}
                <button class="delete-btn" on:click={() => deleteMessage(msg.id)}>🗑️</button>
              {/if}
            </div>
            <div class="message-content">
              {msg.message}
              {#if msg.filtered}
                <span class="filtered-message">(filtered content)</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="input-section">
    <input 
      class="form-input"
      bind:value={messageInput} 
      on:keypress={handleKeyPress}
      placeholder="Type your message..."
    />
    <button class="btn btn-success btn-medium" on:click={send}>Send</button>
  </div>
</div>