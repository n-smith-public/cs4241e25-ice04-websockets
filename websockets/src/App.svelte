<script>
  import Home from './Home.svelte';
  import Chat from './Chat.svelte';
  import GlobalAdmin from './GlobalAdmin.svelte';

  let currentView = 'home';
  let roomPin = '';
  let displayName = '';
  let profanityFilter = 'none';
  let globalAdminPassword = '';

  /* Join an existing room */
  const joinRoom = (event) => {
    roomPin = event.detail.pin;
    displayName = event.detail.name;
    profanityFilter = event.detail.profanityFilter || 'none';
    currentView = 'chat';
  };

  /* Global admin login */
  const globalAdminLogin = (event) => {
    displayName = event.detail.name;
    globalAdminPassword = event.detail.password;
    currentView = 'globalAdmin';
  };

  /* From global admin, go to home */
  const goToChatRooms = () => {
    currentView = 'home';
  };

  /* Leave the current room */
  const leaveRoom = () => {
    currentView = 'home';
    roomPin = '';
    if (!globalAdminPassword) {
      displayName = '';
    }
    profanityFilter = 'none';
  };

  /* Logout as a global admin */
  const logout = () => {
    currentView = 'home';
    displayName = '';
    globalAdminPassword = '';
    roomPin = '';
    profanityFilter = 'none';
  };
</script>

<main>
  {#if currentView === 'home'}
    <Home {displayName} {globalAdminPassword} on:joinRoom={joinRoom} on:globalAdminLogin={globalAdminLogin} />
  {:else if currentView === 'chat'}
    <Chat {roomPin} {displayName} {profanityFilter} {globalAdminPassword} on:leaveRoom={leaveRoom} />
  {:else if currentView === 'globalAdmin'}
    <GlobalAdmin {displayName} {globalAdminPassword} on:logout={logout} on:goToChatRooms={goToChatRooms} />
  {/if}
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }
</style>