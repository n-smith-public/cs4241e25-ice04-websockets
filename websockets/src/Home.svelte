<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let displayName = '';
  let roomPin = '';
  let mode = 'join'; // 'join' or 'create'
  let profanityFilter = 'none'; // 'none', 'swears', 'slurs', 'both'
  export let globalAdminPassword = '';

  $: isGlobalAdmin = globalAdminPassword.length > 0;

  const generatePin = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const createRoom = () => {
    if (displayName.trim()) {
      const newPin = generatePin();
      dispatch('joinRoom', {
        pin: newPin,
        name: displayName.trim(),
        profanityFilter: profanityFilter
      });
    }
  };

  const joinRoom = () => {
    if (displayName.trim() && roomPin.trim() && roomPin.length === 4) {
      dispatch('joinRoom', {
        pin: roomPin.trim(),
        name: displayName.trim(),
        profanityFilter: 'none' // Joining rooms don't set filter
      });
    }
  };

  const globalAdminLogin = () => {
    if (displayName.trim() && globalAdminPassword.trim()) {
        dispatch('globalAdminLogin', {
          name: displayName.trim(),
          password: globalAdminPassword.trim()
        });
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      if (mode === 'create') {
        createRoom();
      } else if (mode === 'join') {
        joinRoom();
      } else if (mode === 'globalAdmin') {
        globalAdminLogin();
      }
    }
  };
</script>

<div class="home-container">
  <h1>Chat Rooms</h1>

  {#if isGlobalAdmin}
    <div class="global-admin-status">
      <p>Δ <strong>Global Admin Status: Active</strong></p>
      <p>You have admin powers in all chat rooms you join.</p>
    </div>
  {/if}
  
  <div class="name-section">
    <label for="displayName">Your Name:</label>
    <input 
      id="displayName"
      type="text" 
      bind:value={displayName} 
      on:keypress={handleKeyPress}
      placeholder="Enter your name..." 
      maxlength="20"
    />
  </div>

  <div class="mode-selector">
    <button 
      class="mode-btn {mode === 'create' ? 'active' : ''}"
      on:click={() => mode = 'create'}
    >
      Create Room
    </button>
    <button 
      class="mode-btn {mode === 'join' ? 'active' : ''}"
      on:click={() => mode = 'join'}
    >
      Join Room
    </button>
    {#if !isGlobalAdmin}
      <button
          class="mode-btn global-admin-btn {mode === 'globalAdmin' ? 'active' : ''}"
          on:click={() => mode = 'globalAdmin'}
      >
        Global Admin
      </button>
    {/if}
  </div>

  {#if mode === 'create'}
    <div class="create-section">
      <p>Create a new chat room with a randomly generated 4-digit PIN</p>
      
      <div class="filter-option">
        <label for="filterSelect">Content Filter:</label>
        <select id="filterSelect" bind:value={profanityFilter}>
          <option value="none">No Filter</option>
          <option value="swears">Block Swearing Only</option>
          <option value="slurs">Block Slurs Only</option>
          <option value="both">Block Swearing & Slurs</option>
        </select>
        <p class="filter-description">
          {#if profanityFilter === 'none'}
            No content filtering applied
          {:else if profanityFilter === 'swears'}
            Blocks common swear words (f***, s***, etc.)
          {:else if profanityFilter === 'slurs'}
            Blocks offensive slurs and hate speech
          {:else if profanityFilter === 'both'}
            Blocks both swear words and offensive slurs
          {/if}
        </p>
      </div>
      
      <button 
        class="action-btn create-btn" 
        on:click={createRoom}
        disabled={!displayName.trim()}
      >
        Create Room
      </button>
    </div>
  {:else if mode === 'join'}
    <div class="join-section">
      <label for="roomPin">Room PIN:</label>
      <input 
        id="roomPin"
        type="text" 
        bind:value={roomPin} 
        on:keypress={handleKeyPress}
        placeholder="Enter 4-digit PIN..." 
        maxlength="4"
        pattern="[0-9]*"
      />
      <button 
        class="action-btn join-btn" 
        on:click={joinRoom}
        disabled={!displayName.trim() || !roomPin.trim() || roomPin.length !== 4}
      >
        Join Room
      </button>
    </div>
  {:else if mode === 'globalAdmin'}
    <div class="global-admin-section">
        <label for="globalAdminPassword">Global Admin Password:</label>
        <input 
            id="globalAdminPassword"
            type="password" 
            bind:value={globalAdminPassword} 
            on:keypress={handleKeyPress}
            placeholder="Enter admin password..." 
        />
        <button 
            class="action-btn global-admin-btn" 
            on:click={globalAdminLogin}
            disabled={!displayName.trim() || !globalAdminPassword.trim()}
        >
            Login as Global Admin
        </button>
      </div>
  {/if}
</div>

<style>
  .home-container {
    text-align: center;
    max-width: 600px;
    margin: 50px auto;
    padding: 30px;
    background: #4a4a4a;
    border-radius: 10px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  }

  h1 {
    color: white;
    margin-bottom: 30px;
    font-size: 2em;
  }

  .name-section {
    margin-bottom: 30px;
  }

  label {
    display: block;
    color: #ccc;
    margin-bottom: 10px;
    font-weight: bold;
  }

  input, select {
    width: 100%;
    padding: 12px;
    font-size: 16px;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-sizing: border-box;
    background: white;
    color: #333;
  }

  select {
    cursor: pointer;
  }

  .mode-selector {
    display: flex;
    gap: 10px;
    margin-bottom: 30px;
  }

  .mode-btn {
    flex: 1;
    padding: 12px;
    font-size: 16px;
    border: 2px solid #007bff;
    background: transparent;
    color: #007bff;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s;
  }

  .mode-btn.active {
    background: #007bff;
    color: white;
  }

  .mode-btn:hover {
    background: #007bff;
    color: white;
  }

  .create-section, .join-section {
    margin-top: 20px;
  }

  .create-section p {
    color: #ccc;
    margin-bottom: 20px;
    font-size: 14px;
  }

  .filter-option {
    margin: 20px 0;
    text-align: left;
  }

  .filter-option label {
    text-align: left;
  }

  .filter-description {
    font-size: 12px;
    color: #aaa;
    margin: 8px 0 0 0;
    font-style: italic;
    text-align: center;
    min-height: 16px;
  }

  .join-section input {
    margin-bottom: 20px;
  }

  .action-btn {
    width: 100%;
    padding: 15px;
    font-size: 18px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.3s;
    font-weight: bold;
  }

  .create-btn {
    background: #28a745;
    color: white;
  }

  .create-btn:hover:not(:disabled) {
    background: #218838;
  }

  .join-btn {
    background: #007bff;
    color: white;
  }

  .join-btn:hover:not(:disabled) {
    background: #0056b3;
  }

  .action-btn:disabled {
    background: #666;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .global-admin-section {
     margin-top: 20px;
    }

    .global-admin-section input {
        margin-bottom: 20px;
    }

    .global-admin-btn {
        background: #ffc107;
        color: #000;
    }

    .global-admin-btn:hover:not(:disabled) {
        background: #e0a800;
    }

    .global-admin-btn.active {
        background: #ffc107;
        color: #000;
    }

    .global-admin-status {
        background: #1a4d1a;
        border: 2px solid #ffc107;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
        text-align: center;
    }

    .global-admin-status p {
        margin: 0;
        color: #ffc107;
    }

    .global-admin-status p:first-child {
        font-size: 1.1em;
        margin-bottom: 5px;
    }
</style>