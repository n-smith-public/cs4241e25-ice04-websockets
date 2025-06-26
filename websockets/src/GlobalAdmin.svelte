<script>
  import { createEventDispatcher, onDestroy } from 'svelte';

  export let displayName;
  export let globalAdminPassword;

  const dispatch = createEventDispatcher();

  let ws;
  let filterData = { swears: [], slurs: [] };
  let newSwear = '';
  let newSlur = '';
  let editingSwear = null;
  let editingSlur = null;
  let isConnected = false;

  const goToChatRooms = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    dispatch('goToChatRooms');
  }

  const connectToServer = () => {
    const wsProtocol = window.location.protocol === "https:" ? 'wss:' : 'ws:';
    const isDev = window.location.port === '5173';
    const wsHost = isDev ? 'localhost:3000' : window.location.host;
    ws = new WebSocket(`${wsProtocol}//${wsHost}`);

    ws.onopen = () => {
      console.log('Global admin connected');
      isConnected = true;
      ws.send(JSON.stringify({
        type: 'globalAdminLogin',
        password: globalAdminPassword
      }));
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log('Global admin received:', data);

      if (data.type === 'globalAdminStatus') {
        if (data.isGlobalAdmin) {
          filterData = data.filterData;
        } else {
          alert(data.error || 'Access denied');
          logout();
        }
      } else if (data.type === 'filterDataUpdated') {
        filterData = data.filterData;
      } else if (data.type === 'error') {
        alert(data.message);
      }
    };

    ws.onclose = () => {
      console.log('Global admin disconnected');
      isConnected = false;
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      isConnected = false;
    };
  };

  const addSwear = () => {
    const trimmedSwear = newSwear.trim().toLowerCase();
    if (trimmedSwear && !filterData.swears.includes(trimmedSwear)) {
      filterData = {
        ...filterData,
        swears: [...filterData.swears, trimmedSwear]
      };
      newSwear = '';
      updateFilter();
    }
  };

  const addSlur = () => {
    const trimmedSlur = newSlur.trim().toLowerCase();
    if (trimmedSlur && !filterData.slurs.includes(trimmedSlur)) {
      filterData = {
        ...filterData,
        slurs: [...filterData.slurs, trimmedSlur]
      };
      newSlur = '';
      updateFilter();
    }
  };

  const removeSwear = (word) => {
    filterData = {
      ...filterData,
      swears: filterData.swears.filter(w => w !== word)
    };
    updateFilter();
  };

  const removeSlur = (word) => {
    filterData = {
      ...filterData,
      slurs: filterData.slurs.filter(w => w !== word)
    };
    updateFilter();
  };

  const startEdit = (word, type) => {
    if (type === 'swear') {
      editingSwear = word;
    } else {
      editingSlur = word;
    }
  };

  const saveEdit = (oldWord, newWord, type) => {
    const trimmedNewWord = newWord.trim().toLowerCase();
    if (trimmedNewWord && trimmedNewWord !== oldWord) {
      if (type === 'swear') {
        const index = filterData.swears.indexOf(oldWord);
        if (index !== -1) {
          const newSwears = [...filterData.swears];
          newSwears[index] = trimmedNewWord;
          filterData = {
            ...filterData,
            swears: newSwears
          };
        }
        editingSwear = null;
      } else {
        const index = filterData.slurs.indexOf(oldWord);
        if (index !== -1) {
          const newSlurs = [...filterData.slurs];
          newSlurs[index] = trimmedNewWord;
          filterData = {
            ...filterData,
            slurs: newSlurs
          };
        }
        editingSlur = null;
      }
      updateFilter();
    } else {
      cancelEdit();
    }
  };

  const cancelEdit = () => {
    editingSwear = null;
    editingSlur = null;
  };

  const updateFilter = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'updateFilterData',
        filterData: filterData
      }));
    }
  };

  const logout = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    dispatch('logout');
  };

  const handleKeyPress = (event, type) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (type === 'swear') {
        addSwear();
      } else if (type === 'slur') {
        addSlur();
      }
    }
  };

  const handleEditKeyPress = (event, oldWord, type) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEdit(oldWord, event.target.value, type);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  };

  const handleEditBlur = (event, oldWord, type) => {
    saveEdit(oldWord, event.target.value, type);
  };

  // Connect when component mounts
  connectToServer();

  // Cleanup on destroy
  onDestroy(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });
</script>

<div class="admin-container">
  <div class="admin-header">
    <h1>&Delta; Global Administration Panel</h1>
    <p>Welcome, {displayName}!</p>
    {#if !isConnected}
      <p class="connection-status">Connecting...</p>
    {/if}
   <div class="header-buttons">
      <button class="chat-rooms-btn" on:click={goToChatRooms}>Go to Chat Rooms</button>
      <button class="logout-btn" on:click={logout}>Logout</button>
    </div>
  </div>

  <div class="filter-management">
    <div class="filter-section">
      <h2>Swear Words ({filterData.swears.length})</h2>
      
      <div class="add-section">
        <input 
          type="text" 
          bind:value={newSwear} 
          on:keypress={(e) => handleKeyPress(e, 'swear')}
          placeholder="Add new swear word..." 
        />
        <button class="add-btn" on:click={addSwear}>Add</button>
      </div>

      <div class="word-list">
        {#each filterData.swears as word (word)}
          <div class="word-item">
            {#if editingSwear === word}
              <input 
                type="text" 
                value={word}
                on:blur={(e) => handleEditBlur(e, word, 'swear')}
                on:keypress={(e) => handleEditKeyPress(e, word, 'swear')}
              />
            {:else}
              <span on:dblclick={() => startEdit(word, 'swear')}>{word}</span>
              <div class="word-actions">
                <button class="edit-btn" on:click={() => startEdit(word, 'swear')}>	&dagger;</button>
                <button class="remove-btn" on:click={() => removeSwear(word)}>&times;</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="filter-section">
      <h2>Slurs ({filterData.slurs.length})</h2>
      
      <div class="add-section">
        <input 
          type="text" 
          bind:value={newSlur} 
          on:keypress={(e) => handleKeyPress(e, 'slur')}
          placeholder="Add new slur..." 
        />
        <button class="add-btn" on:click={addSlur}>Add</button>
      </div>

      <div class="word-list">
        {#each filterData.slurs as word (word)}
          <div class="word-item">
            {#if editingSlur === word}
              <input 
                type="text" 
                value={word}
                on:blur={(e) => handleEditBlur(e, word, 'slur')}
                on:keypress={(e) => handleEditKeyPress(e, word, 'slur')}
                autofocus
              />
            {:else}
              <span on:dblclick={() => startEdit(word, 'slur')}>{word}</span>
              <div class="word-actions">
                <button class="edit-btn" on:click={() => startEdit(word, 'slur')}>&dagger;</button>
                <button class="remove-btn" on:click={() => removeSlur(word)}>&times;</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="help-section">
    <h3>💡 Instructions</h3>
    <ul>
      <li>Double-click any word to edit it inline</li>
      <li>Use the &dagger; button to edit or &times; to remove words</li>
      <li>Changes are automatically saved and applied to all rooms</li>
      <li>As a global admin, you have admin powers in all chat rooms</li>
    </ul>
  </div>
</div>

<style>
  .admin-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 20px;
    background: #2d2d2d;
    color: white;
    min-height: 100vh;
  }

  .admin-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #ffc107;
  }

  .admin-header h1 {
    color: #ffc107;
    margin-bottom: 10px;
  }

  .admin-header p {
    color: #ccc;
    margin-bottom: 20px;
  }

  .connection-status {
    color: #ffc107;
    font-style: italic;
  }

  .logout-btn {
    padding: 10px 20px;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .logout-btn:hover {
    background: #c82333;
  }

  .filter-management {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    margin-bottom: 30px;
  }

  .filter-section {
    background: #3d3d3d;
    padding: 20px;
    border-radius: 10px;
    border: 2px solid #555;
  }

  .filter-section h2 {
    margin-top: 0;
    color: #ffc107;
    text-align: center;
  }

  .add-section {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }

  .add-section input {
    flex: 1;
    padding: 10px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #4a4a4a;
    color: white;
  }

  .add-btn {
    padding: 10px 20px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .add-btn:hover {
    background: #218838;
  }

  .word-list {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #555;
    border-radius: 4px;
    background: #4a4a4a;
  }

  .word-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #555;
  }

  .word-item:last-child {
    border-bottom: none;
  }

  .word-item span {
    flex: 1;
    cursor: pointer;
    padding: 4px;
  }

  .word-item span:hover {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .word-item input {
    flex: 1;
    padding: 4px;
    border: 1px solid #007bff;
    border-radius: 2px;
    background: #5a5a5a;
    color: white;
  }

  .word-actions {
    display: flex;
    gap: 5px;
  }

  .edit-btn, .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
    border-radius: 2px;
  }

  .edit-btn:hover {
    background: rgba(0, 123, 255, 0.2);
  }

  .remove-btn:hover {
    background: rgba(220, 53, 69, 0.2);
  }

  .help-section {
    background: #3d3d3d;
    padding: 20px;
    border-radius: 10px;
    border: 2px solid #555;
  }

  .help-section h3 {
    color: #ffc107;
    margin-top: 0;
  }

  .help-section ul {
    color: #ccc;
    line-height: 1.6;
  }

  @media (max-width: 768px) {
    .filter-management {
      grid-template-columns: 1fr;
      gap: 20px;
    }
  }

  .header-buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  .chat-rooms-btn {
    padding: 10px 20px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .chat-rooms-btn:hover {
    background: #0056b3;
  }

  .logout-btn {
    padding: 10px 20px;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .logout-btn:hover {
    background: #c82333;
  }
</style>