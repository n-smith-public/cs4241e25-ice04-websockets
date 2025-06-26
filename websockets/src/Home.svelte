<script>
  import { createEventDispatcher } from 'svelte';
  import Header from './Header.svelte';
  import './home.css'

  const dispatch = createEventDispatcher();

  export let displayName = '';
  let roomPin = '';
  let mode = 'join';
  let profanityFilter = 'none';
  export let globalAdminPassword = '';

  $: isGlobalAdmin = globalAdminPassword.length > 0;

  /* Generate a unique room PIN of 4 digits */
  const generatePin = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  /* Create a new room */
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

  /* Join an existing room */
  const joinRoom = () => {
    if (displayName.trim() && roomPin.trim() && roomPin.length === 4) {
      dispatch('joinRoom', {
        pin: roomPin.trim(),
        name: displayName.trim(),
        profanityFilter: 'none'
      });
    }
  };

  /* Login as global admin */
  const globalAdminLogin = () => {
    if (displayName.trim() && globalAdminPassword.trim()) {
        dispatch('globalAdminLogin', {
          name: displayName.trim(),
          password: globalAdminPassword.trim()
        });
    }
  };

  /* Helper function to handle enter key press */
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
  <Header />
  <h1 class="home-title">Chat Rooms</h1>

  {#if isGlobalAdmin}
    <div class="status-admin margin-bottom-large">
      <p>Δ <strong>Global Admin Status: Active</strong></p>
      <p>You have admin powers in all chat rooms you join.</p>
    </div>
  {/if}
  
  <div class="section margin-bottom-large">
    <label class="form-label" for="displayName">Your Name:</label>
    <input 
      class="form-input"
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
        class="mode-btn mode-btn-admin {mode === 'globalAdmin' ? 'active' : ''}"
        on:click={() => mode = 'globalAdmin'}
      >
        Global Admin
      </button>
    {/if}
  </div>

  <!-- Chat Room Creation -->
  {#if mode === 'create'}
    <div class="section margin-top">
      <p class="text-light text-medium margin-bottom">Create a new chat room with a randomly generated 4-digit PIN</p>
      
      <div class="section margin-bottom">
        <label class="form-label" for="filterSelect">Content Filter:</label>
        <select class="form-input form-input-dark form-select" id="filterSelect" bind:value={profanityFilter}>
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
        class="btn btn-success btn-large btn-full-width" 
        on:click={createRoom}
        disabled={!displayName.trim()}
      >
        Create Room
      </button>
    </div>
    <!-- Join an existing chat room-->
  {:else if mode === 'join'}
    <div class="section margin-top">
      <label class="form-label" for="roomPin">Room PIN:</label>
      <input 
        class="form-input margin-bottom"
        id="roomPin"
        type="text" 
        bind:value={roomPin} 
        on:keypress={handleKeyPress}
        placeholder="Enter 4-digit PIN..." 
        maxlength="4"
        pattern="[0-9]*"
      />
      <button 
        class="btn btn-primary btn-large btn-full-width" 
        on:click={joinRoom}
        disabled={!displayName.trim() || !roomPin.trim() || roomPin.length !== 4}
      >
        Join Room
      </button>
    </div>
    <!-- Global Admin Login-->
  {:else if mode === 'globalAdmin'}
    <div class="section margin-top">
      <label class="form-label" for="globalAdminPassword">Global Admin Password:</label>
      <input 
        class="form-input margin-bottom"
        id="globalAdminPassword"
        type="password" 
        bind:value={globalAdminPassword} 
        on:keypress={handleKeyPress}
        placeholder="Enter admin password..." 
      />
      <button 
        class="btn btn-warning btn-large btn-full-width" 
        on:click={globalAdminLogin}
        disabled={!displayName.trim() || !globalAdminPassword.trim()}
      >
        Login as Global Admin
      </button>
    </div>
  {/if}
</div>