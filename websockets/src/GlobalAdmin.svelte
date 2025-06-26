<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import Header from './Header.svelte';
  import './admin.css';

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

  // ... (all the existing functions remain the same) ...

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
  <Header />
  <div class="header header-warning margin-bottom-large">
    <h1>Δ Global Administration Panel</h1>
    <p>Welcome, {displayName}!</p>
    {#if !isConnected}
      <p class="connection-status">Connecting...</p>
    {/if}
    <div class="header-buttons">
      <button class="btn btn-primary" on:click={goToChatRooms}>Go to Chat Rooms</button>
      <button class="btn btn-danger" on:click={logout}>Logout</button>
    </div>
  </div>

  <div class="grid-2 responsive-grid margin-bottom-large">
    <div class="container container-border">
      <h2 class="text-warning text-center">Swear Words ({filterData.swears.length})</h2>
      
      <div class="add-section">
        <input 
          class="form-input form-input-dark"
          type="text" 
          bind:value={newSwear} 
          on:keypress={(e) => handleKeyPress(e, 'swear')}
          placeholder="Add new swear word..." 
        />
        <button class="btn btn-success" on:click={addSwear}>Add</button>
      </div>

      <div class="list-container">
        {#each filterData.swears as word (word)}
          <div class="list-item">
            {#if editingSwear === word}
              <input 
                class="word-item input"
                type="text" 
                value={word}
                on:blur={(e) => handleEditBlur(e, word, 'swear')}
                on:keypress={(e) => handleEditKeyPress(e, word, 'swear')}
              />
            {:else}
              <span on:dblclick={() => startEdit(word, 'swear')}>{word}</span>
              <div class="word-actions">
                <button class="edit-btn" on:click={() => startEdit(word, 'swear')}>†</button>
                <button class="remove-btn" on:click={() => removeSwear(word)}>×</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="container container-border">
      <h2 class="text-warning text-center">Slurs ({filterData.slurs.length})</h2>
      
      <div class="add-section">
        <input 
          class="form-input form-input-dark"
          type="text" 
          bind:value={newSlur} 
          on:keypress={(e) => handleKeyPress(e, 'slur')}
          placeholder="Add new slur..." 
        />
        <button class="btn btn-success" on:click={addSlur}>Add</button>
      </div>

      <div class="list-container">
        {#each filterData.slurs as word (word)}
          <div class="list-item">
            {#if editingSlur === word}
              <input 
                class="word-item input"
                type="text" 
                value={word}
                on:blur={(e) => handleEditBlur(e, word, 'slur')}
                on:keypress={(e) => handleEditKeyPress(e, word, 'slur')}
                autofocus
              />
            {:else}
              <span on:dblclick={() => startEdit(word, 'slur')}>{word}</span>
              <div class="word-actions">
                <button class="edit-btn" on:click={() => startEdit(word, 'slur')}>†</button>
                <button class="remove-btn" on:click={() => removeSlur(word)}>×</button>
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
      <li>Use the † button to edit or × to remove words</li>
      <li>Changes are automatically saved and applied to all rooms</li>
      <li>As a global admin, you have admin powers in all chat rooms</li>
    </ul>
  </div>
</div>