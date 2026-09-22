// ===== NAV HELPER =====
var _basePath = location.pathname.indexOf('/ENGLISH/') >= 0 ? '/ENGLISH/' : '/';
function _nav(path){ return _basePath + path; }

// ===== FIREBASE =====
firebase.initializeApp({apiKey:"AIzaSyD7UXDjRS0NaT1OYRBvpxqpirZz3SQYVyc",authDomain:"flashmind-8b1bc.firebaseapp.com",projectId:"flashmind-8b1bc",storageBucket:"flashmind-8b1bc.firebasestorage.app",messagingSenderId:"482268690491",appId:"1:482268690491:web:2c53f56d0bdf8d30c7c41e"});
const auth = firebase.auth(), firestore = firebase.firestore();
let currentUser = null, unsubDecks = null, lastUserId = null;

// ===== DATA =====
let db = { decks:{}, reviewLog:[], settings:{ dailyGoal:20, leechThreshold:8 } };

function loadLocal() {
  try { const r = localStorage.getItem('flashmind_data'); if(r){ db=JSON.parse(r); if(!db.decks)db.decks={}; if(!db.reviewLog)db.reviewLog=[]; if(!db.settings)db.settings={dailyGoal:20,leechThreshold:8}; } } catch(e){ db={decks:{},reviewLog:[],settings:{dailyGoal:20,leechThreshold:8}}; }
  lastUserId=localStorage.getItem('flashmind_lastUser');
}
function saveLocal() { try{localStorage.setItem('flashmind_data',JSON.stringify(db));if(lastUserId)localStorage.setItem('flashmind_lastUser',lastUserId);}catch(e){} }

// ===== AUTH =====
let authIsRegister=false;
function openAuthModal(){
  authIsRegister=false;
  document.getElementById('authModalTitle').textContent='Sign In';
  document.getElementById('authSubmitBtn').textContent='Sign In';
  document.getElementById('authToggleText').textContent='Don\'t have an account?';
  document.getElementById('authToggleLink').textContent='Sign Up';
  document.getElementById('authNameGroup').style.display='none';
  document.getElementById('authError').style.display='none';
  document.getElementById('authEmail').value='';
  document.getElementById('authPass').value='';
  document.getElementById('authName').value='';
  document.getElementById('authModal').classList.add('active');
}
function closeAuthModal(){ document.getElementById('authModal').classList.remove('active'); }
function toggleAuthMode(e){
  e.preventDefault();
  authIsRegister=!authIsRegister;
  document.getElementById('authModalTitle').textContent=authIsRegister?'Sign Up':'Sign In';
  document.getElementById('authSubmitBtn').textContent=authIsRegister?'Create Account':'Sign In';
  document.getElementById('authToggleText').textContent=authIsRegister?'Already have an account?':'Don\'t have an account?';
  document.getElementById('authToggleLink').textContent=authIsRegister?'Sign In':'Sign Up';
  document.getElementById('authNameGroup').style.display=authIsRegister?'block':'none';
  document.getElementById('authError').style.display='none';
}
function showAuthError(msg){ const el=document.getElementById('authError');el.textContent=msg;el.style.display='block'; }
document.addEventListener('keydown',e=>{var am=document.getElementById('authModal');if(e.key==='Enter'&&am&&am.classList.contains('active'))submitAuth();});
async function submitAuth(){
  let username=document.getElementById('authEmail').value.trim();
  const pass=document.getElementById('authPass').value;
  const name=document.getElementById('authName').value.trim();
  if(!username||!pass){showAuthError('Enter username and password');return;}
  if(username.length<3){showAuthError('Username must be at least 3 characters');return;}
  if(pass.length<6){showAuthError('Password must be at least 6 characters');return;}
  const email=username.includes('@')?username:username.toLowerCase().replace(/\s+/g,'')+'@flashmind.app';
  try{
    if(authIsRegister){
      const cred=await auth.createUserWithEmailAndPassword(email,pass);
      await cred.user.updateProfile({displayName:name||username});
      toast('Signed up successfully!');
    } else {
      await auth.signInWithEmailAndPassword(email,pass);
      toast('Signed in successfully!');
    }
    closeAuthModal();
  }catch(e){
    const msgs={'auth/email-already-in-use':'Username already taken','auth/invalid-email':'Invalid username','auth/weak-password':'Password too weak','auth/user-not-found':'Account not found','auth/wrong-password':'Wrong password','auth/invalid-credential':'Invalid username or password','auth/too-many-requests':'Too many attempts, please wait'};
    showAuthError(msgs[e.code]||e.message);
  }
}
function signInGoogle(){
  const provider=new firebase.auth.GoogleAuthProvider();
  const isMobile=/iPhone|iPad|Android/i.test(navigator.userAgent);
  if(isMobile){auth.signInWithRedirect(provider);}
  else{auth.signInWithPopup(provider).then(()=>closeAuthModal()).catch(e=>{if(e.code==='auth/popup-blocked'){auth.signInWithRedirect(provider);}else{showAuthError('Google error: '+e.message);}});}
}
function signOutUser(){ if(unsubDecks){unsubDecks();unsubDecks=null;} lastUserId=null;localStorage.removeItem('flashmind_lastUser'); auth.signOut(); db={decks:{},reviewLog:[],settings:{dailyGoal:20,leechThreshold:8}};saveLocal(); toggleUserMenu(); renderCurrentView(); }
function toggleUserMenu(){ document.getElementById('userMenu').classList.toggle('active'); }
document.addEventListener('click',e=>{const m=document.getElementById('userMenu'),a=document.getElementById('userAvatar'),b=document.getElementById('userAvatarInitial');if(m&&!m.contains(e.target)&&e.target!==a&&e.target!==b)m.classList.remove('active');});

auth.onAuthStateChanged(user=>{
  currentUser=user;
  const avImg=document.getElementById('userAvatar'),avInit=document.getElementById('userAvatarInitial'),navLogin=document.getElementById('navLogin');
  if(user){
    if(navLogin)navLogin.style.display='none';
    if(user.photoURL){if(avImg){avImg.style.display='block';avImg.src=user.photoURL;}if(avInit)avInit.style.display='none';}
    else{if(avImg)avImg.style.display='none';if(avInit){avInit.style.display='flex';avInit.textContent=((user.displayName||user.email||'?')[0]).toUpperCase();}}
    var un=document.getElementById('userName');if(un)un.textContent=user.displayName||user.email;
    mergeAndLoadCloud();
  } else {
    if(navLogin)navLogin.style.display='flex';
    if(avImg)avImg.style.display='none';if(avInit)avInit.style.display='none';
    db={decks:{},reviewLog:[],settings:{dailyGoal:20,leechThreshold:8}};saveLocal();renderCurrentView();
    loadSharedDecks();
  }
});

var _lastVisSync=0;
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&currentUser){
    var now=Date.now();
    if(now-_lastVisSync<5000)return;
    _lastVisSync=now;
    if(unsubDecks)unsubDecks();
    unsubDecks=decksCol().onSnapshot(s=>{db.decks={};s.forEach(d=>{db.decks[d.id]=d.data();});saveLocal();renderCurrentView();});
    reviewLogCol().orderBy('date','desc').limit(5000).get().then(ls=>{db.reviewLog=[];ls.forEach(d=>db.reviewLog.push(d.data()));db.reviewLog.reverse();saveLocal();renderCurrentView();});
    userDoc().get().then(doc=>{if(doc.exists){const cs=doc.data().settings||{};db.settings.totalXp=Math.max(db.settings.totalXp||0,cs.totalXp||0);if(cs.streakDays){if(!db.settings.streakDays)db.settings.streakDays={};for(const[day,count]of Object.entries(cs.streakDays)){db.settings.streakDays[day]=Math.max(db.settings.streakDays[day]||0,count);}}saveLocal();renderCurrentView();}});
  }
});
function userDoc(){return firestore.collection('users').doc(currentUser.uid);}
function decksCol(){return userDoc().collection('decks');}
function reviewLogCol(){return userDoc().collection('reviewLog');}

async function mergeAndLoadCloud(){
  const switchedUser=(lastUserId&&lastUserId!==currentUser.uid);
  lastUserId=currentUser.uid;
  if(switchedUser){db.decks={};db.reviewLog=[];db.settings={dailyGoal:20,leechThreshold:8};saveLocal();}
  const local=JSON.parse(JSON.stringify(db));
  const snap=await decksCol().get(); const cloudIds=new Set();
  snap.forEach(d=>cloudIds.add(d.id));
  for(const[id,deck]of Object.entries(local.decks)){if(!cloudIds.has(id))await decksCol().doc(id).set(deck);}
  const existingLogs=await reviewLogCol().orderBy('date','desc').limit(5000).get();
  const existingDates=new Set();existingLogs.forEach(d=>{const e=d.data();existingDates.add(e.date+'_'+e.cardId);});
  const newLogs=local.reviewLog.filter(e=>!existingDates.has(e.date+'_'+e.cardId));
  if(newLogs.length>0){const b=firestore.batch();newLogs.forEach(e=>b.set(reviewLogCol().doc(),e));await b.commit();}
  // Sync settings (streak, XP)
  const cloudSettings=await userDoc().get();
  if(cloudSettings.exists){
    const cs=cloudSettings.data().settings||{};
    db.settings.totalXp=Math.max(db.settings.totalXp||0,cs.totalXp||0);
    if(cs.streakDays){
      if(!db.settings.streakDays)db.settings.streakDays={};
      for(const[day,count]of Object.entries(cs.streakDays)){db.settings.streakDays[day]=Math.max(db.settings.streakDays[day]||0,count);}
    }
  }
  await userDoc().set({settings:{totalXp:db.settings.totalXp||0,streakDays:db.settings.streakDays||{},dailyGoal:db.settings.dailyGoal||20}},{merge:true});
  if(unsubDecks)unsubDecks();
  unsubDecks=decksCol().onSnapshot(s=>{db.decks={};s.forEach(d=>{db.decks[d.id]=d.data();});saveLocal();renderCurrentView();});
  const ls=await reviewLogCol().orderBy('date','desc').limit(5000).get();
  db.reviewLog=[];ls.forEach(d=>db.reviewLog.push(d.data()));db.reviewLog.reverse();saveLocal();renderCurrentView();
  await loadSharedDecks();
}
async function syncToCloud(){if(!currentUser){toast('Sign in first');return;}await mergeAndLoadCloud();toggleUserMenu();}
function saveDeckData(id,data){saveLocal();if(currentUser){decksCol().doc(id).set(data).catch(console.error);if(data._shared&&isAdmin)firestore.collection('sharedDecks').doc(id).set(Object.assign({},data,{sharedBy:currentUser.uid,sharedAt:Date.now()})).catch(console.error);}}
function deleteDeckData(id){saveLocal();if(currentUser)decksCol().doc(id).delete().catch(console.error);}
function addReviewLog(entry){db.reviewLog.push(entry);saveLocal();if(currentUser)reviewLogCol().add(entry).catch(console.error);}

// ===== SM-2 =====
function newCardData(){return{id:crypto.randomUUID(),cardName:'',front:'',fronts:[],back:'',definition:'',type:'basic',clozeText:'',reviewMode:'flip',displayMode:'voice',youtubeUrl:'',ytStart:null,ytEnd:null,driveUrl:'',cakeUrl:'',status:'new',interval:0,ease:2.5,due:Date.now(),reps:0,lapses:0,created:Date.now(),lastReview:null,tags:[],suspended:false};}

function sm2(card,quality){
  const now=Date.now(),DAY=86400000; card.lastReview=now;
  if(quality===0){card.status='learning';card.interval=0;card.reps=0;card.lapses++;card.due=now+60000;card.ease=Math.max(1.3,card.ease-0.2);}
  else if(card.status==='new'||card.status==='learning'){
    if(quality===1){card.status='learning';card.interval=0;card.due=now+600000;}
    else if(quality===2){card.status='review';card.interval=1;card.due=now+DAY;card.reps=1;}
    else{card.status='review';card.interval=4;card.due=now+4*DAY;card.reps=1;card.ease=Math.min(3,card.ease+0.15);}
  } else {
    let ni;
    if(quality===1){ni=Math.max(1,Math.round(card.interval*1.2));card.ease=Math.max(1.3,card.ease-0.15);}
    else if(quality===2){ni=Math.round(card.interval*card.ease);}
    else{ni=Math.round(card.interval*card.ease*1.3);card.ease=Math.min(3,card.ease+0.15);}
    card.interval=Math.min(ni,36500);card.due=now+card.interval*DAY;card.reps++;card.status='review';
  }
  if(card.lapses>=db.settings.leechThreshold)card.leech=true;
  return card;
}

function getIntervalText(card,q){
  if(q===0)return'1 min';
  if(card.status==='new'||card.status==='learning'){if(q===1)return'10 min';if(q===2)return'1 day';return'4 days';}
  let iv;if(q===1)iv=Math.max(1,Math.round(card.interval*1.2));else if(q===2)iv=Math.round(card.interval*card.ease);else iv=Math.round(card.interval*card.ease*1.3);
  iv=Math.min(iv,36500);if(iv===1)return'1 day';if(iv<30)return iv+' days';if(iv<365){const mo=Math.round(iv/30*10)/10;return mo+(mo===1?' month':' months');}const yr=Math.round(iv/365*10)/10;return yr+(yr===1?' year':' years');
}

// ===== VIEWS =====
let currentView='decks',currentDeckId=null,editingDeckId=null,editingCardId=null,selectedEmoji='📖';
let reviewQueue=[],reviewIndex=0,reviewMode='flip',viewingParentId=null,parentStack=[];
let undoStack=[], activeTagFilter=null;

function showView(name){
  if(name==='decks')location.href=_basePath;
  else if(name==='review')location.href=_basePath+'review/';
  else if(name==='quiz')location.href=_basePath+'quiz/';
  else if(name==='stats')location.href=_basePath+'stats/';
  else{
    currentView=name;
    var el=document.getElementById('view'+name.charAt(0).toUpperCase()+name.slice(1));
    if(el)el.classList.add('active');
  }
}

var _renderTimer=null;
function renderCurrentView(){
  if(_renderTimer)clearTimeout(_renderTimer);
  _renderTimer=setTimeout(function(){_renderTimer=null;if(typeof pageRender==='function')pageRender();},250);
}

// ===== SUB-DECKS =====
function getSubDecks(parentId){return Object.entries(db.decks).filter(([id,d])=>(d.parentId||null)===parentId);}
function getAllCardsRecursive(deckId){
  let cards=[...(db.decks[deckId]?.cards||[])];
  getSubDecks(deckId).forEach(([subId])=>{cards=cards.concat(getAllCardsRecursive(subId));});
  return cards;
}
function getDeckCards(deckId){return db.decks[deckId]?.cards||[];}

function navigateIntoDeck(deckId){
  parentStack.push(viewingParentId);
  viewingParentId=deckId;
  renderDecks();
}
function navigateUp(){
  viewingParentId=parentStack.pop()||null;
  renderDecks();
}
function navigateToRoot(){
  viewingParentId=null;parentStack=[];renderDecks();
}

// ===== DECK RENDERING =====
function renderDecks(){
  renderStreakWidget();
  const wrap=document.getElementById('deckListWrap');
  const subs=getSubDecks(viewingParentId);
  const deckEntries=subs;

  // Breadcrumb
  let bcHTML='';
  if(viewingParentId){
    bcHTML='<div class="breadcrumb"><a onclick="navigateToRoot()">🏠 All</a>';
    let chain=[];let pid=viewingParentId;
    while(pid){chain.unshift(pid);pid=db.decks[pid]?.parentId||null;}
    chain.forEach((cid,i)=>{
      bcHTML+='<span class="sep">›</span>';
      if(i<chain.length-1)bcHTML+=`<a onclick="viewingParentId='${cid}';parentStack=parentStack.slice(0,${i});renderDecks()">${esc(db.decks[cid]?.name||'')}</a>`;
      else bcHTML+=`<span style="color:var(--ink);font-weight:700">${esc(db.decks[cid]?.name||'')}</span>`;
    });
    bcHTML+='</div>';
  }
  document.getElementById('breadcrumbWrap').innerHTML=bcHTML;

  // Global stats
  const allDecks=Object.keys(db.decks);
  let totalCards=0,totalDue=0,totalNew=0;
  allDecks.forEach(id=>{const cards=getDeckCards(id);totalCards+=cards.length;cards.forEach(c=>{if(c.status==='new')totalNew++;});});
  const streak=calcStreak();
  const todayReviews=db.reviewLog.filter(r=>new Date(r.date).toDateString()===new Date().toDateString()).length;

  document.getElementById('globalStats').innerHTML=`
    <div class="stat-card"><div class="stat-icon">📇</div><div class="stat-value">${totalCards}</div><div class="stat-label">TOTAL</div></div>
    <div class="stat-card"><div class="stat-icon">🔥</div><div class="stat-value">${streak}</div><div class="stat-label">Streak</div></div>
    <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-value">${todayReviews}</div><div class="stat-label">TODAY</div></div>
    <div class="stat-card"><div class="stat-icon">✨</div><div class="stat-value">${totalNew}</div><div class="stat-label">NEW</div></div>`;

  document.getElementById('dailyGoalWrap').innerHTML=`<div class="daily-goal-actions">
    <div class="action-card settings-card" onclick="openSettings()">
      <div class="action-card-icon">⚙️</div>
      <div class="action-card-text"><div class="action-card-title">Settings</div><div class="action-card-sub">Customize your study</div></div>
      <div class="action-card-arrow">›</div>
    </div>
    <div class="action-card create-card" onclick="openDeckModal()">
      <div class="action-card-icon">📂</div>
      <div class="action-card-text"><div class="action-card-title">Create Deck</div><div class="action-card-sub">Add new flashcards</div></div>
      <div class="action-card-arrow">›</div>
    </div>
    <div class="action-card" onclick="openAIPrompt()" style="background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(59,130,246,.15));border-color:rgba(139,92,246,.3)">
      <div class="action-card-icon">🤖</div>
      <div class="action-card-text"><div class="action-card-title">AI Practice</div><div class="action-card-sub">Generate daily conversation prompt</div></div>
      <div class="action-card-arrow">›</div>
    </div>
    <div class="action-card" onclick="openTutorial()" style="background:linear-gradient(135deg,rgba(249,115,22,.1),rgba(234,179,8,.1));border-color:rgba(249,115,22,.2)"><div class="action-card-icon">📖</div><div class="action-card-text"><div class="action-card-title">Hướng dẫn</div><div class="action-card-sub">Cách sử dụng FlashMind</div></div><div class="action-card-arrow">›</div></div>
  </div>`;

  if(deckEntries.length===0&&!viewingParentId){
    wrap.innerHTML=`<div class="deck-list"><div class="empty-state"><div class="empty-icon">📚</div><h3>No decks yet</h3><p>Create your first deck to start studying!</p><button class="btn btn-primary" onclick="openDeckModal()">+ New Deck</button></div></div>`;
    return;
  }
  if(deckEntries.length===0&&viewingParentId){
    const parentCards=getDeckCards(viewingParentId);
    const pName=esc(db.decks[viewingParentId]?.name||'');
    if(parentCards.length>0){
      wrap.innerHTML=`<div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="startReviewAll('${viewingParentId}')">📚 Study all</button>
          <button class="btn btn-primary" onclick="startReview('${viewingParentId}')">▶ Study (${parentCards.length} cards)</button>
          <button class="btn btn-ghost" onclick="openBrowser('${viewingParentId}')">📋 View / Edit</button>
          <button class="btn btn-ghost" onclick="openDeckModal()">📂 + Sub-deck</button>
          <button class="btn btn-ghost" onclick="startSleepListen('${viewingParentId}',true)">🌙 Sleep Listen</button>
        </div>
      </div>`;
      return;
    }
    wrap.innerHTML=`<div class="deck-list"><div class="empty-state"><div class="empty-icon">📂</div><h3>No cards in "${pName}"</h3><p>Create a sub-deck or add cards directly</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary" onclick="openDeckModal()">📂 + Sub-deck</button><button class="btn btn-ghost" onclick="openBrowser('${viewingParentId}')">📋 Add cards</button></div></div></div>`;
    return;
  }

  wrap.innerHTML='<div class="deck-list">'+deckEntries.map(([id,d])=>{
    const cards=getAllCardsRecursive(id);
    const subCount=getSubDecks(id).length;
    const cardCount=cards.length;
    return`<div class="deck-item" onclick="onDeckClick('${id}')">
      <div class="deck-item-top"><div class="deck-color">${d.emoji||'📖'}</div>
      <div class="deck-info"><div class="deck-name">${esc(d.name)}</div>
        <div class="deck-meta"><span>📇 ${cardCount} cards</span>${subCount?'<span>📂 '+subCount+' sub-decks</span>':''}${d.desc?'<span>'+esc(d.desc)+'</span>':''}</div></div>
      <div class="deck-badges">
        ${subCount?'<span class="badge badge-sub">'+subCount+' con</span>':''}
      </div></div>
      <div class="deck-actions" onclick="event.stopPropagation()">
        ${subCount?'<button class="deck-action-btn" onclick="startReviewAll(\''+id+'\')" title="Study all">📚</button>':''}
        <button class="deck-action-btn" onclick="openBrowser('${id}')" title="View cards">📋</button>
        <button class="deck-action-btn" onclick="openCustomStudyForDeck('${id}')" title="Custom study">🎯</button>
        <button class="deck-action-btn" onclick="startSleepListen('${id}',true)" title="Sleep Listen">🌙</button>
        <button class="deck-action-btn" onclick="openEditDeck('${id}')" title="Edit">✏️</button>
        <button class="deck-action-btn delete" onclick="deleteDeck('${id}')" title="Delete">🗑️</button>
      </div>
    </div>`;
  }).join('')+'</div>';

  // If viewing a parent that also has its own cards, show review button
  if(viewingParentId){
    const ownCards=getDeckCards(viewingParentId);
    if(ownCards.length>0){
      wrap.innerHTML+=`<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" onclick="startReviewAll('${viewingParentId}')">📚 Study all</button><button class="btn btn-primary" onclick="startReview('${viewingParentId}')">▶ Study "${esc(db.decks[viewingParentId].name)}"</button><button class="btn btn-ghost" onclick="openBrowser('${viewingParentId}')">📋 View cards</button></div>`;
    }
  }
}

function onDeckClick(id){
  var deck=db.decks[id];
  if(deck&&getSubDecks(id).length>0){navigateIntoDeck(id);}
  else{location.href=_basePath+id;}
}

// ===== DECK MODAL =====
function requireAuth(){if(!currentUser){openAuthModal();return false;}return true;}
function openDeckModal(){
  if(!requireAuth())return;
  editingDeckId=null;
  document.getElementById('deckModalTitle').textContent='New Deck';
  document.getElementById('saveDeckBtn').textContent='Create deck';
  document.getElementById('deckNameInput').value='';
  document.getElementById('deckDescInput').value='';
  selectedEmoji='📖';updateEmojiSelection();
  populateParentSelect();
  if(viewingParentId)document.getElementById('deckParentSelect').value=viewingParentId;
  document.getElementById('deckModal').classList.add('active');
  setTimeout(()=>document.getElementById('deckNameInput').focus(),100);
}
function openEditDeck(id){
  editingDeckId=id;const d=db.decks[id];
  document.getElementById('deckModalTitle').textContent='Edit Deck';
  document.getElementById('saveDeckBtn').textContent='Update';
  document.getElementById('deckNameInput').value=d.name;
  document.getElementById('deckDescInput').value=d.desc||'';
  selectedEmoji=d.emoji||'📖';updateEmojiSelection();
  populateParentSelect(id);
  document.getElementById('deckParentSelect').value=d.parentId||'';
  document.getElementById('deckModal').classList.add('active');
}
function closeDeckModal(){document.getElementById('deckModal').classList.remove('active');}
function pickEmoji(el){selectedEmoji=el.dataset.emoji;updateEmojiSelection();}
function updateEmojiSelection(){document.querySelectorAll('.emoji-pick').forEach(e=>e.classList.toggle('selected',e.dataset.emoji===selectedEmoji));}

function populateParentSelect(excludeId){
  const sel=document.getElementById('deckParentSelect');
  sel.innerHTML='<option value="">— None (root deck) —</option>';
  Object.entries(db.decks).forEach(([id,d])=>{
    if(id!==excludeId)sel.innerHTML+=`<option value="${id}">${esc(d.emoji||'')} ${esc(d.name)}</option>`;
  });
}

function saveDeck(){
  const name=document.getElementById('deckNameInput').value.trim();
  if(!name){toast('Please enter a name');return;}
  const desc=document.getElementById('deckDescInput').value.trim();
  const parentId=document.getElementById('deckParentSelect').value||null;
  if(editingDeckId){
    const deck=db.decks[editingDeckId];
    if(deck._shared&&!isAdmin){toast('This is a default deck and cannot be edited');return;}
    deck.name=name;deck.desc=desc;deck.emoji=selectedEmoji;deck.parentId=parentId;
    saveDeckData(editingDeckId,deck);toast('Updated!');
  } else {
    const id=crypto.randomUUID();
    const deck={name,desc,emoji:selectedEmoji,cards:[],created:Date.now(),parentId};
    db.decks[id]=deck;saveDeckData(id,deck);toast('Deck created!');
  }
  closeDeckModal();renderDecks();
}
function deleteDeck(id){
  var deck=db.decks[id];if(!deck)return;
  if(deck._shared&&!isAdmin){
    if(!confirm('Remove "'+deck.name+'" from your list? You can get it back by syncing.'))return;
    getSubDecks(id).forEach(([subId])=>{delete db.decks[subId];deleteDeckData(subId);});
    delete db.decks[id];deleteDeckData(id);
    renderDecks();toast('Removed');return;
  }
  if(!confirm('Delete "'+deck.name+'" and everything inside?'))return;
  const wasShared=deck._shared;
  getSubDecks(id).forEach(([subId])=>deleteDeck(subId));
  delete db.decks[id];deleteDeckData(id);
  if(wasShared&&isAdmin&&typeof firestore!=='undefined'){firestore.collection('sharedDecks').doc(id).delete().catch(console.error);}
  renderDecks();toast('Deleted');
}

// ===== CARD MODAL =====
function addFrontField(value,speaker){
  const wrap=document.getElementById('frontFieldsWrap');
  const row=document.createElement('div');row.className='front-field-row';
  const txt=typeof value==='object'?(value.text||''):value||'';
  const spk=typeof value==='object'?(value.speaker||''):speaker||'';
  row.innerHTML='<div class="front-speaker-wrap"><input class="front-speaker" placeholder="Speaker" value="'+esc(spk)+'" maxlength="20"></div><textarea class="front-input" placeholder="Next dialogue line..." rows="2">'+esc(txt)+'</textarea><button type="button" class="front-remove-btn" onclick="removeFrontField(this)" title="Remove">✕</button>';
  wrap.appendChild(row);
  if(document.getElementById('cardDisplayMode')?.value==='quiz'){
    var tick=document.createElement('button');tick.type='button';tick.className='quiz-correct-tick';tick.title='Mark as correct answer';tick.textContent='✓';
    tick.onclick=function(){quizMarkCorrect(this);};
    row.insertBefore(tick,row.querySelector('.front-remove-btn'));
    row.querySelector('.front-speaker-wrap').style.display='none';
    row.querySelector('.front-input').placeholder='Answer option '+(wrap.querySelectorAll('.front-field-row').length);
  }
  updateFrontRemoveButtons();
  if(!txt)row.querySelector('.front-input').focus();
}
function removeFrontField(btn){
  btn.closest('.front-field-row').remove();
  updateFrontRemoveButtons();
}
function updateFrontRemoveButtons(){
  const rows=document.querySelectorAll('#frontFieldsWrap .front-field-row');
  rows.forEach(r=>{
    const btn=r.querySelector('.front-remove-btn');
    if(btn)btn.style.display=rows.length>1?'block':'none';
  });
  const isQuizMode=document.getElementById('cardDisplayMode')?.value==='quiz';
  const backGroup=document.getElementById('cardBackInput')?.closest('.form-group');
  if(backGroup)backGroup.style.display=(rows.length>1&&!isQuizMode)?'none':'block';
}
function getFrontValues(){
  const rows=document.querySelectorAll('#frontFieldsWrap .front-field-row');
  return Array.from(rows).map(r=>{
    const text=(r.querySelector('.front-input')?.value||'').trim();
    const speaker=(r.querySelector('.front-speaker')?.value||'').trim();
    if(!text)return null;
    return speaker?{text,speaker}:text;
  }).filter(Boolean);
}
function setFrontFields(fronts){
  const wrap=document.getElementById('frontFieldsWrap');
  wrap.innerHTML='';
  if(!fronts||fronts.length===0)fronts=[''];
  fronts.forEach((f,i)=>{
    const txt=typeof f==='object'?(f.text||''):f;
    const spk=typeof f==='object'?(f.speaker||''):'';
    const row=document.createElement('div');row.className='front-field-row';
    row.innerHTML='<div class="front-speaker-wrap"><input class="front-speaker" placeholder="Speaker" value="'+esc(spk)+'" maxlength="20"></div><textarea class="front-input" placeholder="'+(i===0?'Enter question, vocabulary...':'Next dialogue line...')+'" rows="2">'+esc(txt)+'</textarea><button type="button" class="front-remove-btn" onclick="removeFrontField(this)" title="Remove">✕</button>';
    wrap.appendChild(row);
  });
  updateFrontRemoveButtons();
}

function onCardTypeChange(){
  const t=document.getElementById('cardTypeSelect').value;
  document.getElementById('basicFields').style.display=t==='cloze'?'none':'block';
  document.getElementById('clozeFields').style.display=t==='cloze'?'block':'none';
}

function onDisplayModeChange(){
  const mode=document.getElementById('cardDisplayMode').value;
  const isQuiz=mode==='quiz';
  const frontLabel=document.querySelector('#basicFields .form-group:first-child > label');
  if(frontLabel){
    frontLabel.innerHTML=isQuiz?'Answers (options) <span style="font-size:11px;color:var(--ink-dim);font-weight:400">— tick = correct answer</span>':'Front (question) <span style="font-size:11px;color:var(--ink-dim);font-weight:400">— multiple = dialogue mode</span>';
  }
  var addBtn=document.getElementById('addFrontBtn');
  if(addBtn)addBtn.textContent=isQuiz?'+ Add answer':'+ Add dialogue line';
  var nameLabel=document.getElementById('cardNameLabel');
  if(nameLabel)nameLabel.innerHTML=isQuiz?'Question <span style="font-size:11px;color:var(--ink-dim);font-weight:400">— the question AI will read</span>':'Card name <span style="font-size:11px;color:var(--ink-dim);font-weight:400">— optional</span>';
  var nameInput=document.getElementById('cardNameInput');
  if(nameInput)nameInput.placeholder=isQuiz?'e.g. What does hello mean?':'e.g. Greeting, At the store...';
  document.querySelectorAll('#frontFieldsWrap .front-speaker-wrap').forEach(function(el){el.style.display=isQuiz?'none':'';});
  document.querySelectorAll('#frontFieldsWrap .front-input').forEach(function(el,i){el.placeholder=isQuiz?'Answer option '+(i+1):'Enter question, vocabulary...';});
  document.querySelectorAll('#frontFieldsWrap .front-field-row').forEach(function(row){
    var existing=row.querySelector('.quiz-correct-tick');
    if(isQuiz&&!existing){
      var tick=document.createElement('button');tick.type='button';tick.className='quiz-correct-tick';tick.title='Mark as correct answer';tick.textContent='✓';
      tick.onclick=function(){quizMarkCorrect(this);};
      row.insertBefore(tick,row.querySelector('.front-remove-btn'));
    }
    if(!isQuiz&&existing)existing.remove();
  });
  var backGroup=document.getElementById('cardBackInput')?.closest('.form-group');
  if(backGroup)backGroup.style.display=isQuiz?'none':'block';
  if(isQuiz){
    var backVal=document.getElementById('cardBackInput').value.trim();
    if(backVal){
      document.querySelectorAll('#frontFieldsWrap .front-field-row').forEach(function(row){
        var txt=(row.querySelector('.front-input')?.value||'').trim();
        if(txt.toLowerCase()===backVal.toLowerCase()){
          var t=row.querySelector('.quiz-correct-tick');if(t)t.classList.add('selected');
        }
      });
    }
  }
}
function quizMarkCorrect(btn){
  document.querySelectorAll('.quiz-correct-tick').forEach(function(t){t.classList.remove('selected');});
  btn.classList.add('selected');
  var txt=(btn.closest('.front-field-row').querySelector('.front-input')?.value||'').trim();
  document.getElementById('cardBackInput').value=txt;
}

function openCardModal(cardId){
  if(!requireAuth())return;
  editingCardId=cardId||null;
  document.getElementById('cardTypeSelect').value='basic';onCardTypeChange();
  if(cardId){
    const card=getDeckCards(currentDeckId).find(c=>c.id===cardId);
    document.getElementById('cardModalTitle').textContent='Edit Card';
    document.getElementById('saveCardBtn').textContent='Update';
    if(card.type==='cloze'){
      document.getElementById('cardTypeSelect').value='cloze';onCardTypeChange();
      document.getElementById('clozeInput').value=card.clozeText||card.front;
    } else {
      document.getElementById('cardTypeSelect').value=card.type||'basic';
      const fronts=card.fronts&&card.fronts.length>0?card.fronts:[card.front||''];
      setFrontFields(fronts);
      document.getElementById('cardBackInput').value=card.back;
    }
    document.getElementById('cardTagsInput').value=(card.tags||[]).join(', ');
    document.getElementById('cardReviewMode').value=card.reviewMode||'flip';
    document.getElementById('cardDisplayMode').value=card.displayMode||'voice';
    onDisplayModeChange();
    document.getElementById('cardNameInput').value=card.cardName||'';
    document.getElementById('cardDefinitionInput').value=card.definition||'';
    document.getElementById('cardYoutubeUrl').value=card.youtubeUrl||'';
    document.getElementById('cardDriveUrl').value=card.driveUrl||'';
    document.getElementById('cardYtStart').value=card.ytStart!=null?card.ytStart:'';
    document.getElementById('cardYtEnd').value=card.ytEnd!=null?card.ytEnd:'';
    document.getElementById('cardCakeUrl').value=card.cakeUrl||'';
  } else {
    document.getElementById('cardModalTitle').textContent='Add New Card';
    document.getElementById('saveCardBtn').textContent='Save card';
    document.getElementById('cardNameInput').value='';
    document.getElementById('cardDefinitionInput').value='';
    setFrontFields(['']);document.getElementById('cardBackInput').value='';
    document.getElementById('cardReviewMode').value='flip';
    document.getElementById('cardDisplayMode').value='voice';
    onDisplayModeChange();
    document.getElementById('clozeInput').value='';document.getElementById('cardTagsInput').value='';
    document.getElementById('cardYoutubeUrl').value='';document.getElementById('cardDriveUrl').value='';document.getElementById('cardYtStart').value='';document.getElementById('cardYtEnd').value='';
    document.getElementById('cardCakeUrl').value='';
  }
  document.getElementById('cardModal').classList.add('active');
  setTimeout(()=>(document.getElementById('cardTypeSelect').value==='cloze'?document.getElementById('clozeInput'):document.querySelector('#frontFieldsWrap .front-input')).focus(),100);
}
function closeCardModal(){destroyYtPlayer();document.getElementById('ytPreviewWrap').style.display='none';document.getElementById('cardModal').classList.remove('active');}

function parseTags(str){return str.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);}

function saveCard(){
  const type=document.getElementById('cardTypeSelect').value;
  const tags=parseTags(document.getElementById('cardTagsInput').value);
  const deck=db.decks[currentDeckId];if(!deck.cards)deck.cards=[];
  if(deck._shared&&!isAdmin){toast('This is a default deck and cannot be edited');return;}

  const cardReviewMode=document.getElementById('cardReviewMode').value;
  const cardDisplayMode=document.getElementById('cardDisplayMode').value;
  const ytUrl=document.getElementById('cardYoutubeUrl').value.trim();
  const ytStart=document.getElementById('cardYtStart').value?parseFloat(document.getElementById('cardYtStart').value):null;
  const ytEnd=document.getElementById('cardYtEnd').value?parseFloat(document.getElementById('cardYtEnd').value):null;
  const driveUrl=document.getElementById('cardDriveUrl').value.trim();
  const cakeUrl=document.getElementById('cardCakeUrl').value.trim();
  const cardName=document.getElementById('cardNameInput').value.trim();
  const definition=document.getElementById('cardDefinitionInput').value.trim();
  if(type==='cloze'){
    const text=document.getElementById('clozeInput').value.trim();
    if(!text||!text.includes('{{c')){toast('Need at least 1 {{c1::...}}');return;}
    const nums=new Set();text.replace(/\{\{c(\d+)::/g,(_,n)=>nums.add(parseInt(n)));
    if(editingCardId){
      const card=deck.cards.find(c=>c.id===editingCardId);
      card.type='cloze';card.clozeText=text;card.front=clozeToFront(text,1);card.back=clozeToBack(text,1);card.tags=tags;card.reviewMode=cardReviewMode;card.displayMode=cardDisplayMode;card.youtubeUrl=ytUrl;card.ytStart=ytStart;card.ytEnd=ytEnd;card.driveUrl=driveUrl;card.cakeUrl=cakeUrl;card.cardName=cardName;card.definition=definition;
      toast('Updated!');
    } else {
      nums.forEach(n=>{
        const card=newCardData();card.type='cloze';card.clozeText=text;card.front=clozeToFront(text,n);card.back=clozeToBack(text,n);card.tags=tags;card.reviewMode=cardReviewMode;card.displayMode=cardDisplayMode;card.youtubeUrl=ytUrl;card.ytStart=ytStart;card.ytEnd=ytEnd;card.driveUrl=driveUrl;card.cakeUrl=cakeUrl;card.cardName=cardName;card.definition=definition;
        deck.cards.push(card);
      });
      toast('Added '+nums.size+' cloze cards!');
    }
  } else {
    const fronts=getFrontValues();
    const back=document.getElementById('cardBackInput').value.trim();
    if(cardDisplayMode==='quiz'){
      if(!cardName){toast('Quiz needs a question in Card name');return;}
      if(fronts.length<2){toast('Quiz needs at least 2 answer options');return;}
      if(!back){toast('Please tick the correct answer');return;}
    } else if(fronts.length===0||(fronts.length===1&&!back)){toast('Enter both front and back');return;}
    const front=typeof fronts[0]==='object'?fronts[0].text:fronts[0];
    if(editingCardId){
      const card=deck.cards.find(c=>c.id===editingCardId);
      card.front=front;card.fronts=fronts;card.back=back;card.type=type;card.tags=tags;card.reviewMode=cardReviewMode;card.displayMode=cardDisplayMode;card.youtubeUrl=ytUrl;card.ytStart=ytStart;card.ytEnd=ytEnd;card.driveUrl=driveUrl;card.cakeUrl=cakeUrl;card.cardName=cardName;card.definition=definition;toast('Updated!');
    } else {
      const card=newCardData();card.front=front;card.fronts=fronts;card.back=back;card.type=type;card.tags=tags;card.reviewMode=cardReviewMode;card.displayMode=cardDisplayMode;card.youtubeUrl=ytUrl;card.ytStart=ytStart;card.ytEnd=ytEnd;card.driveUrl=driveUrl;card.cakeUrl=cakeUrl;card.cardName=cardName;card.definition=definition;deck.cards.push(card);
      if(type==='reversed'){const rc=newCardData();rc.front=back;rc.fronts=[back];rc.back=front;rc.type='reversed';rc.tags=tags;rc.reviewMode=cardReviewMode;rc.displayMode=cardDisplayMode;rc.youtubeUrl=ytUrl;rc.ytStart=ytStart;rc.ytEnd=ytEnd;rc.cakeUrl=cakeUrl;rc.cardName=cardName;deck.cards.push(rc);toast('Added 2 cards (original + reversed)!');}
      else toast('Card added!');
    }
  }
  saveDeckData(currentDeckId,deck);closeCardModal();renderCardBrowser();renderDecks();
}

function clozeToFront(text,num){return text.replace(/\{\{c(\d+)::([^}]+)\}\}/g,(_,n,content)=>parseInt(n)===num?'[...]':content);}
function clozeToBack(text,num){return text.replace(/\{\{c(\d+)::([^}]+)\}\}/g,(_,n,content)=>parseInt(n)===num?content:content);}

// ===== CARD BROWSER =====
function openBrowser(deckId){
  location.href=_basePath+deckId;
}
function exitBrowser(){currentDeckId=null;location.href=_basePath;}

function renderTagFilter(){
  const cards=getDeckCards(currentDeckId);
  const allTags=new Set();cards.forEach(c=>(c.tags||[]).forEach(t=>allTags.add(t)));
  if(allTags.size===0){document.getElementById('tagFilterWrap').innerHTML='';return;}
  let html='<div class="tag-filter"><span style="font-size:12px;font-weight:700;color:var(--ink-dim);padding:4px 0">Tags:</span>';
  html+=`<span class="tag ${!activeTagFilter?'active':''}" onclick="activeTagFilter=null;renderTagFilter();renderCardBrowser()">All</span>`;
  allTags.forEach(t=>{html+=`<span class="tag ${activeTagFilter===t?'active':''}" onclick="activeTagFilter='${t}';renderTagFilter();renderCardBrowser()">${esc(t)}</span>`;});
  document.getElementById('tagFilterWrap').innerHTML=html+'</div>';
}

function renderCardBrowser(){
  const cards=getDeckCards(currentDeckId);
  const search=(document.getElementById('cardSearch')?.value||'').toLowerCase();
  let filtered=cards.filter(c=>c.front.toLowerCase().includes(search)||c.back.toLowerCase().includes(search)||(c.cardName||'').toLowerCase().includes(search));
  if(activeTagFilter)filtered=filtered.filter(c=>(c.tags||[]).includes(activeTagFilter));
  const wrap=document.getElementById('cardTableWrap');
  if(filtered.length===0){
    wrap.innerHTML=`<div class="empty-state"><div class="empty-icon">📝</div><h3>${cards.length===0?'No cards yet':'No results'}</h3><p>${cards.length===0?'Add your first card':'Try different keywords'}</p>${cards.length===0?'<button class="btn btn-primary" onclick="openCardModal()">+ Add card</button>':''}</div>`;
    return;
  }
  wrap.innerHTML=`<div style="overflow-x:auto"><table class="card-table">
    <thead><tr><th>Front</th><th>Back</th><th>Mode</th><th>Tags</th><th>Status</th><th>Next</th><th></th></tr></thead>
    <tbody>${filtered.map(c=>{
      const sc=c.suspended?'status-suspended':c.status==='new'?'status-new':c.status==='learning'?'status-learning':'status-review';
      const st=c.suspended?'Suspended':c.status==='new'?'New':c.status==='learning'?'Learning':'Review';
      const dt=c.status==='new'?'—':formatDue(c.due);
      const tagHTML=(c.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join('');
      const leechHTML=c.leech?'<span class="leech-badge">⚠ Leech</span>':'';
      const modeLabel=c.reviewMode==='type'?'⌨️':'🔄';const dispLabel=c.displayMode==='voice'?'🔊':c.displayMode==='voice-repeat'?'🔁':c.displayMode==='voice-translate'?'🌐':c.displayMode==='quiz'?'🎯':'';
      const displayFront=c.cardName||c.front;
      return`<tr><td class="card-front-col">${esc(displayFront)}</td><td class="card-back-col">${esc(c.back)}</td>
        <td style="text-align:center;font-size:16px" title="${c.reviewMode==='type'?'Type answer':'Flip card'}${c.displayMode==='voice'?' · Listen & Answer':c.displayMode==='voice-repeat'?' · Listen & Repeat':c.displayMode==='voice-translate'?' · Listen & Translate':c.displayMode==='quiz'?' · Quiz':''}">${modeLabel}${dispLabel}</td>
        <td><div class="tag-list">${tagHTML}${leechHTML}</div></td>
        <td><span class="card-status ${sc}">${st}</span></td>
        <td style="font-size:13px;color:var(--ink-dim)">${dt}</td>
        <td style="white-space:nowrap">
          <button class="card-edit-btn" onclick="openCardModal('${c.id}')" title="Edit">✏️</button>
          <button class="card-edit-btn" onclick="toggleSuspend('${c.id}')" title="${c.suspended?'Unsuspend':'Suspend'}">${c.suspended?'👁':'⏸'}</button>
          <button class="card-edit-btn" onclick="deleteCard('${c.id}')" title="Delete" style="color:var(--red)">🗑️</button>
        </td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function filterCards(){renderCardBrowser();}

function toggleSuspend(cardId){
  const deck=db.decks[currentDeckId];const card=deck.cards.find(c=>c.id===cardId);
  card.suspended=!card.suspended;saveDeckData(currentDeckId,deck);renderCardBrowser();
  toast(card.suspended?'Card suspended':'Card unsuspended');
}

function deleteCard(cardId){
  if(db.decks[currentDeckId]._shared&&!isAdmin){toast('This is a default deck and cannot be edited');return;}
  if(!confirm('Delete this card?'))return;
  const deck=db.decks[currentDeckId];deck.cards=deck.cards.filter(c=>c.id!==cardId);
  saveDeckData(currentDeckId,deck);renderCardBrowser();toast('Deleted');
}

// ===== BULK ADD =====
function openBulkAddModal(){if(!requireAuth())return;document.getElementById('bulkInput').value='';document.getElementById('bulkTagsInput').value='';document.getElementById('bulkModal').classList.add('active');}
function closeBulkModal(){document.getElementById('bulkModal').classList.remove('active');}

function saveBulkCards(){
  if(db.decks[currentDeckId]._shared&&!isAdmin){toast('This is a default deck and cannot be edited');return;}
  const text=document.getElementById('bulkInput').value.trim();
  if(!text){toast('Enter data');return;}
  const tags=parseTags(document.getElementById('bulkTagsInput').value);
  const bulkRM=document.getElementById('bulkReviewMode').value;
  const deck=db.decks[currentDeckId];if(!deck.cards)deck.cards=[];
  const lines=text.split('\n').filter(l=>l.trim());
  let count=0;
  lines.forEach(line=>{
    const sep=line.includes('\t')?'\t':'|';
    const parts=line.split(sep).map(s=>s.trim());
    if(parts.length>=2&&parts[0]&&parts[1]){
      const card=newCardData();card.front=parts[0];card.back=parts[1];card.tags=tags;card.reviewMode=bulkRM;deck.cards.push(card);count++;
    }
  });
  if(count===0){toast('No valid cards found');return;}
  saveDeckData(currentDeckId,deck);closeBulkModal();renderCardBrowser();toast('Added '+count+' cards!');
}

// ===== IMPORT/EXPORT =====
function openImportModal(){document.getElementById('importFile').value='';document.getElementById('importModal').classList.add('active');}
function closeImportModal(){document.getElementById('importModal').classList.remove('active');}

function importFile(){
  const file=document.getElementById('importFile').files[0];
  if(!file){toast('Choose a file');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    const text=e.target.result;
    const deck=db.decks[currentDeckId];if(!deck.cards)deck.cards=[];
    if(file.name.endsWith('.json')){
      try{
        const data=JSON.parse(text);
        if(Array.isArray(data)){data.forEach(c=>{const card=newCardData();card.front=c.front||'';card.back=c.back||'';card.tags=c.tags||[];deck.cards.push(card);});}
        else if(data.cards){data.cards.forEach(c=>{const card=newCardData();Object.assign(card,c);card.id=crypto.randomUUID();deck.cards.push(card);});}
        toast('Imported '+deck.cards.length+' cards');
      }catch(err){toast('Invalid JSON file');}
    } else {
      const lines=text.split('\n').filter(l=>l.trim());let count=0;
      lines.forEach(line=>{
        const sep=line.includes('\t')?'\t':',';
        const parts=line.split(sep).map(s=>s.trim().replace(/^"|"$/g,''));
        if(parts.length>=2&&parts[0]&&parts[1]){const card=newCardData();card.front=parts[0];card.back=parts[1];deck.cards.push(card);count++;}
      });
      toast('Imported '+count+' cards');
    }
    saveDeckData(currentDeckId,deck);closeImportModal();renderCardBrowser();
  };
  reader.readAsText(file);
}

function exportDeck(){
  const deck=db.decks[currentDeckId];
  const data=JSON.stringify({name:deck.name,emoji:deck.emoji,cards:deck.cards},null,2);
  downloadFile(deck.name+'.json',data,'application/json');
}

function exportAllData(){
  const data=JSON.stringify(db,null,2);
  downloadFile('flashmind_backup.json',data,'application/json');
  toggleUserMenu();
}

function downloadFile(name,content,type){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

// ===== REVIEW =====
function startReviewAll(deckId){
  location.href=_basePath+deckId+'/review?mode=all';
}

function startReview(deckId){
  location.href=_basePath+deckId+'/review';
}

// ===== SLEEP LISTEN =====
let sleepPlaylist=[],sleepIndex=0,sleepTimer=null,sleepSpeed=1.5,sleepLoadedAt=0,sleepAudioEl=null;
let sleepDrillOn=false,sleepDrillIdx=0;
var DRILL_SPEEDS=[0.5,1,1.5,2];
function startSleepListen(deckId,includeAll){
  const allCards=includeAll?getAllCardsIncludingSubs(deckId):getDeckCards(deckId);
  const ytCards=allCards.filter(c=>c.driveUrl&&c.driveUrl.trim());
  if(ytCards.length===0){toast('No cards with audio/video URL');return;}
  sleepPlaylist=ytCards.slice();
  for(let i=sleepPlaylist.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[sleepPlaylist[i],sleepPlaylist[j]]=[sleepPlaylist[j],sleepPlaylist[i]];}
  sleepIndex=0;sleepDrillIdx=0;
  if(!sleepAudioEl){
    sleepAudioEl=document.createElement('audio');
    sleepAudioEl.id='sleepDriveVideo';
    sleepAudioEl.setAttribute('playsinline','');
    sleepAudioEl.controls=true;
    sleepAudioEl.style.cssText='width:100%;height:48px';
  }
  sleepAudioEl.src='';
  sleepAudioEl.play().catch(function(){});
  document.getElementById('sleepListenOverlay').style.display='flex';
  document.getElementById('sleepListenTitle').textContent='🌙 Sleep Listen — '+(db.decks[deckId]?.name||'');
  playSleepVideo();
}
function getAllCardsIncludingSubs(deckId){
  let cards=getDeckCards(deckId).slice();
  Object.keys(db.decks).forEach(id=>{if(db.decks[id].parent===deckId)cards=cards.concat(getAllCardsIncludingSubs(id));});
  return cards;
}
function speakTTS(text,cb){
  if(!window.speechSynthesis||!text){if(cb)cb();return;}
  window.speechSynthesis.cancel();
  var u=new SpeechSynthesisUtterance(text);
  u.lang='en-US';u.rate=1;u.volume=1;
  u.onend=function(){if(cb)cb();};
  u.onerror=function(){if(cb)cb();};
  window.speechSynthesis.speak(u);
}
function playSleepVideo(){
  if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=null;}
  if(sleepPlaylist.length===0)return;
  const card=sleepPlaylist[sleepIndex];
  const audioUrl=card.driveUrl?card.driveUrl.trim():'';
  const start=card.ytStart!=null?card.ytStart:0;
  const end=card.ytEnd!=null?card.ytEnd:null;
  const wrap=document.getElementById('sleepListenPlayer');
  wrap.innerHTML='';
  sleepLoadedAt=Date.now();
  const displayName=card.cardName||card.front||(typeof card.fronts==='object'&&card.fronts&&card.fronts[0]?(typeof card.fronts[0]==='object'?card.fronts[0].text:card.fronts[0]):'')||'';
  document.getElementById('sleepListenCardName').textContent=displayName;
  document.getElementById('sleepListenCounter').textContent=(sleepIndex+1)+' / '+sleepPlaylist.length;
  var activeSpeed=sleepDrillOn?DRILL_SPEEDS[sleepDrillIdx]:sleepSpeed;
  document.getElementById('sleepSpeedLabel').textContent=activeSpeed+'x';
  updateDrillInfo();
  if(!audioUrl){sleepListenNext();return;}
  var shouldTTS=!sleepDrillOn||sleepDrillIdx===0;
  function playAudioNow(){
    var el=sleepAudioEl;
    el.pause();
    el.ontimeupdate=null;el.onended=null;el.onerror=null;
    el.src=audioUrl;
    el.onloadedmetadata=function(){if(start!=null)el.currentTime=start;el.playbackRate=activeSpeed;};
    var advanced=false;
    function advanceOnce(){if(advanced)return;advanced=true;el.pause();el.ontimeupdate=null;el.onended=null;sleepListenNext();}
    el.ontimeupdate=function(){if(end!=null&&el.currentTime>=end)advanceOnce();};
    el.onended=function(){if(Date.now()-sleepLoadedAt>2000)advanceOnce();};
    el.onerror=function(){sleepListenNext();};
    if(!el.parentNode)wrap.appendChild(el);
    el.play().catch(function(){});
  }
  if(shouldTTS){speakTTS(displayName,playAudioNow);}else{playAudioNow();}
}
function playSleepYouTube(ytId,start,end){
  const wrap=document.getElementById('sleepListenPlayer');
  const iframe=document.createElement('iframe');
  let src='https://www.youtube-nocookie.com/embed/'+ytId+'?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&fs=0&cc_load_policy=0&controls=0&showinfo=0&autoplay=1&vq=small';
  if(start!=null)src+='&start='+Math.floor(start);
  if(end!=null)src+='&end='+Math.floor(end);
  src+='&enablejsapi=1&origin='+encodeURIComponent(location.origin);
  iframe.src=src;
  iframe.width='100%';iframe.height='100%';
  iframe.style.border='none';
  iframe.setAttribute('allowfullscreen','');
  iframe.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
  iframe.id='sleepYtFrame';
  wrap.appendChild(iframe);
  iframe.onload=function(){
    setTimeout(()=>applySleepSpeed(),1000);
    setTimeout(()=>applySleepSpeed(),3000);
  };
}
window.addEventListener('message',function(e){
  if(!e.data||typeof e.data!=='string')return;
  try{
    const d=JSON.parse(e.data);
    if(d.event==='onStateChange'&&d.info===0&&document.getElementById('sleepListenOverlay').style.display==='flex'&&(Date.now()-sleepLoadedAt)>3000){
      sleepListenNext();
    }
  }catch(ex){}
});
function sleepListenNext(){
  if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=null;}
  if(sleepDrillOn){
    sleepDrillIdx++;
    if(sleepDrillIdx<DRILL_SPEEDS.length){
      playSleepVideo();
      return;
    }
    sleepDrillIdx=0;
  }
  sleepIndex=(sleepIndex+1)%sleepPlaylist.length;
  playSleepVideo();
}
function toggleSleepDrill(){
  sleepDrillOn=!sleepDrillOn;
  sleepDrillIdx=0;
  var btn=document.getElementById('sleepDrillBtn');
  if(btn){
    btn.textContent=sleepDrillOn?'🔄 Speed Drill: ON':'🔄 Speed Drill: OFF';
    btn.style.color=sleepDrillOn?'#22c55e':'rgba(255,255,255,0.5)';
    btn.style.borderColor=sleepDrillOn?'#22c55e':'rgba(255,255,255,0.15)';
  }
  updateDrillInfo();
}
function updateDrillInfo(){
  var info=document.getElementById('sleepDrillInfo');
  if(!info)return;
  if(!sleepDrillOn){info.textContent='';return;}
  info.textContent='Round '+(sleepDrillIdx+1)+'/'+DRILL_SPEEDS.length+' — '+DRILL_SPEEDS[sleepDrillIdx]+'x';
}
function sleepListenPrev(){
  if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=null;}
  sleepDrillIdx=0;
  sleepIndex=(sleepIndex-1+sleepPlaylist.length)%sleepPlaylist.length;
  playSleepVideo();
}
function sleepListenReplay(){
  if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=null;}
  sleepDrillIdx=0;
  playSleepVideo();
}
function stopSleepListen(){
  if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=null;}
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  document.getElementById('sleepListenPlayer').innerHTML='';
  document.getElementById('sleepListenOverlay').style.display='none';
  sleepPlaylist=[];sleepIndex=0;
}
function openTelegramSend(){
  if(sleepPlaylist.length===0){toast('No playlist to send');return;}
  var m=document.getElementById('telegramModal');
  m.style.display='flex';
  var saved=localStorage.getItem('flashmind_tele');
  if(saved){try{var s=JSON.parse(saved);document.getElementById('teleChatId').value=s.chatId||'';document.getElementById('teleBotUrl').value=s.botUrl||'';document.getElementById('teleAdminKey').value=s.adminKey||'';}catch(e){}}
  document.getElementById('teleSendStatus').textContent=sleepPlaylist.length+' tracks ready to send';
  document.getElementById('teleSendBtn').disabled=false;
}
function closeTelegramModal(){document.getElementById('telegramModal').style.display='none';}
async function trimAudioBlob(audioUrl,start,end){
  var resp=await fetch(audioUrl);
  var buf=await resp.arrayBuffer();
  var ctx=new OfflineAudioContext(1,44100*60,44100);
  var decoded=await ctx.decodeAudioData(buf);
  var s=start||0;
  var e=(end!=null&&end>s)?end:decoded.duration;
  var dur=e-s;
  if(dur<=0)return null;
  var offCtx=new OfflineAudioContext(decoded.numberOfChannels,Math.ceil(dur*decoded.sampleRate),decoded.sampleRate);
  var src=offCtx.createBufferSource();
  src.buffer=decoded;
  src.connect(offCtx.destination);
  src.start(0,s,dur);
  var rendered=await offCtx.startRendering();
  var numCh=rendered.numberOfChannels;
  var len=rendered.length;
  var sr=rendered.sampleRate;
  var dataSize=len*numCh*2;
  var abuf=new ArrayBuffer(44+dataSize);
  var v=new DataView(abuf);
  function ws(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}
  ws(0,'RIFF');v.setUint32(4,36+dataSize,true);ws(8,'WAVE');
  ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,numCh,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*numCh*2,true);v.setUint16(32,numCh*2,true);v.setUint16(34,16,true);
  ws(36,'data');v.setUint32(40,dataSize,true);
  var off=44;
  for(var i=0;i<len;i++){for(var ch=0;ch<numCh;ch++){var sample=Math.max(-1,Math.min(1,rendered.getChannelData(ch)[i]));v.setInt16(off,sample<0?sample*0x8000:sample*0x7FFF,true);off+=2;}}
  return abuf;
}
async function sendToTelegram(){
  var chatId=document.getElementById('teleChatId').value.trim();
  var botUrl=document.getElementById('teleBotUrl').value.trim().replace(/\/$/,'');
  var adminKey=document.getElementById('teleAdminKey').value.trim();
  if(!chatId||!botUrl||!adminKey){toast('Fill all fields');return;}
  try{localStorage.setItem('flashmind_tele',JSON.stringify({chatId:chatId,botUrl:botUrl,adminKey:adminKey}));}catch(e){}
  var items=[];
  for(var i=0;i<sleepPlaylist.length;i++){
    var c=sleepPlaylist[i];
    var url=(c.driveUrl||'').trim();
    if(!url)continue;
    var name=c.cardName||c.front||(typeof c.fronts==='object'&&c.fronts&&c.fronts[0]?(typeof c.fronts[0]==='object'?c.fronts[0].text:c.fronts[0]):'')||'Track '+(i+1);
    var cakeId='';if(c.cakeUrl){var m=c.cakeUrl.match(/\/(\d+)\/?$/);if(m)cakeId=m[1];}
    var title=cakeId?(cakeId+' - '+name):name;
    var s=c.ytStart!=null?c.ytStart:0;
    var e=c.ytEnd!=null?c.ytEnd:0;
    items.push({audioUrl:url,title:title,start:s,end:e});
  }
  if(items.length===0){toast('No audio tracks found');return;}
  var status=document.getElementById('teleSendStatus');
  var btn=document.getElementById('teleSendBtn');
  btn.disabled=true;
  var sent=0,total=items.length;
  // Trim tat ca track tu start->end, roi gui 1 lan qua sendMediaGroup
  status.textContent='Trimming '+total+' tracks...';
  var trimmedBlobs=[];
  for(var i=0;i<items.length;i++){
    var t=items[i];
    status.textContent='Trimming '+(i+1)+'/'+total+': '+t.title+'...';
    try{
      var wavBuf=await trimAudioBlob(t.audioUrl,t.start,t.end);
      trimmedBlobs.push({buf:wavBuf,title:t.title,audioUrl:t.audioUrl});
    }catch(e){console.error('Trim error:',t.title,e);trimmedBlobs.push({buf:null,title:t.title,audioUrl:t.audioUrl});}
  }
  // Upload tat ca trimmed blobs len worker roi gui mediaGroup
  status.textContent='Sending '+total+' trimmed tracks...';
  for(var i=0;i<trimmedBlobs.length;i++){
    var tb=trimmedBlobs[i];
    status.textContent='Sending '+(i+1)+'/'+total+': '+tb.title+'...';
    try{
      if(tb.buf){
        var r=await fetch(botUrl+'/send-audio-file?chatId='+encodeURIComponent(chatId)+'&title='+encodeURIComponent(tb.title),{method:'POST',headers:{'X-Admin-Key':adminKey,'Content-Type':'audio/wav'},body:tb.buf});
        var d=await r.json();if(d.ok)sent++;
      }else{
        var r=await fetch(botUrl+'/send-playlist',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Key':adminKey},body:JSON.stringify({chatId:chatId,tracks:[{audioUrl:tb.audioUrl,title:tb.title}]})});
        var d=await r.json();if(r.ok)sent+=d.sent||0;
      }
    }catch(e){console.error('Send error:',e);}
  }
  status.textContent='✅ Sent '+sent+'/'+total+' tracks!';
  toast('Sent '+sent+' tracks to Telegram!');
  btn.disabled=false;
}
async function sendCardToTelegram(){
  var audioUrl=document.getElementById('cardDriveUrl').value.trim();
  if(!audioUrl){toast('No audio URL');return;}
  var saved=localStorage.getItem('flashmind_tele');
  var chatId='',adminKey='';
  if(saved){try{var s=JSON.parse(saved);chatId=s.chatId||'';adminKey=s.adminKey||'';}catch(e){}}
  if(!chatId||!adminKey){toast('Open Sleep Listen > Telegram first to set Chat ID & Admin Key');return;}
  var botUrl=document.getElementById('teleBotUrl')?document.getElementById('teleBotUrl').value:'https://flashmind-tele-bot.yosua-4131.workers.dev';
  var cardName=document.getElementById('cardNameInput').value.trim();
  var cakeUrl=document.getElementById('cardCakeUrl').value.trim();
  var cakeId='';if(cakeUrl){var m=cakeUrl.match(/\/(\d+)\/?$/);if(m)cakeId=m[1];}
  var title=cakeId?(cakeId+' - '+cardName):cardName||'Audio';
  var ytStart=document.getElementById('cardYtStart').value?parseFloat(document.getElementById('cardYtStart').value):0;
  var ytEnd=document.getElementById('cardYtEnd').value?parseFloat(document.getElementById('cardYtEnd').value):0;
  var st=document.getElementById('cardTeleStatus');
  st.textContent='Trimming...';
  try{
    var wavBuf=await trimAudioBlob(audioUrl,ytStart,ytEnd);
    if(wavBuf){
      st.textContent='Sending...';
      var r=await fetch(botUrl+'/send-audio-file?chatId='+encodeURIComponent(chatId)+'&title='+encodeURIComponent(title),{method:'POST',headers:{'X-Admin-Key':adminKey,'Content-Type':'audio/wav'},body:wavBuf});
      var d=await r.json();
      st.textContent=d.ok?'✅ Sent!':'❌ Failed';
      if(d.ok)toast('Sent to Telegram!');
    }else{st.textContent='❌ Trim failed';}
  }catch(e){st.textContent='❌ Error: '+e.message;}
}
function applySleepSpeed(){
  const driveVideo=document.getElementById('sleepDriveVideo');
  if(driveVideo){driveVideo.playbackRate=sleepSpeed;return;}
  const iframe=document.getElementById('sleepYtFrame');
  if(!iframe||!iframe.contentWindow)return;
  iframe.contentWindow.postMessage(JSON.stringify({event:'command',func:'setPlaybackRate',args:[sleepSpeed]}),'*');
}
function sleepChangeSpeed(delta){
  sleepSpeed=Math.round(Math.max(0.25,Math.min(3,sleepSpeed+delta))*100)/100;
  document.getElementById('sleepSpeedLabel').textContent=sleepSpeed+'x';
  applySleepSpeed();
}

function stopAllAudio(){
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(window._dialogueTimer){clearTimeout(window._dialogueTimer);window._dialogueTimer=null;}
  window._dialoguePlaying=false;
  destroyYtPlayer();
}
function exitReview(){stopAllAudio();cleanupDialogueLayout();var did=currentDeckId;reviewQueue=[];currentDeckId=null;if(did)location.href=_basePath+did;else location.href=_basePath;}
function cleanupDialogueLayout(){
  const outer=document.querySelector('.dialogue-outer-layout');
  if(outer){
    const rc=outer.querySelector('.dialogue-right-col');
    const fc=rc?rc.querySelector('.flashcard'):outer.querySelector('.flashcard');
    if(fc)outer.parentNode.insertBefore(fc,outer);
    outer.remove();
  }
  const actBar=document.querySelector('.dialogue-action-bar');if(actBar)actBar.remove();
  const extraBtns=document.querySelector('.card-link-btns-outer');if(extraBtns)extraBtns.remove();
}

// ===== YOUTUBE CLIP =====
function extractYtId(url){if(!url)return null;const m=url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);return m?m[1]:null;}
function extractDriveId(url){if(!url)return null;const m=url.match(/\/d\/([a-zA-Z0-9_-]+)/)||url.match(/id=([a-zA-Z0-9_-]+)/);return m?m[1]:null;}
function getDriveStreamUrl(driveId){return 'https://valleystudy.com/api/drive/stream?fileId='+driveId;}
function getDriveEmbedUrl(driveId){return 'https://drive.google.com/file/d/'+driveId+'/preview';}

function destroyYtPlayer(){
  document.querySelectorAll('.cake-player').forEach(function(p){if(p._pollTimer)clearInterval(p._pollTimer);if(p._ytPlayer)try{p._ytPlayer.destroy();}catch(e){}});
  document.querySelectorAll('.yt-card-wrap iframe, .dialogue-yt-wrap iframe, .dialogue-yt-wrap video, #ytPreviewPlayer iframe, .cake-player').forEach(f=>f.remove());
}

function buildDriveEmbed(driveId,start,end){
  const wrap=document.createElement('div');
  wrap.style.cssText='width:100%;height:100%;position:relative;background:#000;border-radius:var(--r-md);overflow:hidden';
  const video=document.createElement('video');
  var srcUrl=getDriveStreamUrl(driveId);
  if(start!=null||end!=null){
    srcUrl+='#t='+(start!=null?start:'');
    if(end!=null)srcUrl+=','+end;
  }
  video.src=srcUrl;
  video.crossOrigin='anonymous';
  video.style.cssText='width:100%;height:100%;display:block;border:none';
  video.setAttribute('playsinline','');
  video.autoplay=true;video.controls=true;
  if(start!=null){
    video.onloadedmetadata=function(){video.currentTime=start;};
    video.onseeked=function(){video.onseeked=null;video.play().catch(function(){});};
  }
  if(end!=null)video.ontimeupdate=function(){if(video.currentTime>=end){video.pause();video.ontimeupdate=null;}};
  video.onerror=function(){
    wrap.innerHTML='';
    const iframe=document.createElement('iframe');
    iframe.src=getDriveEmbedUrl(driveId);
    iframe.style.cssText='width:100%;height:100%;border:none';
    iframe.setAttribute('allow','autoplay');
    wrap.appendChild(iframe);
  };
  wrap.appendChild(video);
  return wrap;
}
function buildYtEmbed(videoId,start,end){
  const wrap=document.createElement('div');
  wrap.className='cake-player';
  wrap.dataset.videoId=videoId;
  if(start!=null)wrap.dataset.start=start;
  if(end!=null)wrap.dataset.end=end;
  const iframe=document.createElement('iframe');
  let src='https://www.youtube-nocookie.com/embed/'+videoId+'?playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&fs=0&cc_load_policy=0&controls=0&showinfo=0&autoplay=1&vq=small&enablejsapi=1&origin='+encodeURIComponent(location.origin);
  if(start!=null)src+='&start='+Math.floor(start);
  if(end!=null)src+='&end='+Math.floor(end);
  iframe.src=src;
  iframe.width='100%';iframe.height='100%';
  iframe.id='yt-cake-'+Date.now();
  iframe.style.cssText='border:none;display:block;border-radius:inherit;position:absolute;top:0;left:0';
  iframe.setAttribute('allowfullscreen','');
  iframe.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
  wrap.appendChild(iframe);
  var ctrl=document.createElement('div');
  ctrl.className='cake-controls';
  ctrl.innerHTML='<button class="cake-ctrl-btn cake-rw" onclick="event.stopPropagation();cakeSeek(-5)">⏪</button><button class="cake-ctrl-btn cake-pp" onclick="event.stopPropagation();cakePlayPause()">⏸</button><button class="cake-ctrl-btn cake-fw" onclick="event.stopPropagation();cakeSeek(5)">⏩</button>';
  ctrl.onclick=function(e){e.stopPropagation();};
  wrap.appendChild(ctrl);
  var prog=document.createElement('div');
  prog.className='cake-progress';
  prog.innerHTML='<div class="cake-progress-bar"></div>';
  prog.onclick=function(e){e.stopPropagation();cakeSeekTo(e);};
  wrap.appendChild(prog);
  wrap._iframeId=iframe.id;
  wrap._start=start||0;
  wrap._end=end||0;
  initCakePlayer(wrap,iframe);
  return wrap;
}
function initCakePlayer(wrap,iframe){
  var player=null;
  var pollTimer=null;
  iframe.onload=function(){
    try{
      var tag=document.createElement('script');
      tag.src='https://www.youtube.com/iframe_api';
      if(!document.querySelector('script[src*="iframe_api"]'))document.head.appendChild(tag);
    }catch(e){}
    function tryInit(){
      if(window.YT&&window.YT.Player){
        try{
          player=new YT.Player(iframe.id,{
            events:{
              onReady:function(){wrap._ytPlayer=player;startPoll();},
              onStateChange:function(e){
                var ppBtn=wrap.querySelector('.cake-pp');
                if(e.data===YT.PlayerState.PLAYING){if(ppBtn)ppBtn.textContent='⏸';}
                else if(e.data===YT.PlayerState.PAUSED){if(ppBtn)ppBtn.textContent='▶';}
              }
            }
          });
        }catch(e){}
      }else{setTimeout(tryInit,500);}
    }
    setTimeout(tryInit,800);
  };
  function startPoll(){
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(function(){
      if(!player||!player.getCurrentTime)return;
      try{
        var cur=player.getCurrentTime();
        var s=wrap._start||0;
        var e=wrap._end||player.getDuration()||0;
        var dur=e-s;
        if(dur<=0)dur=player.getDuration()||1;
        var pct=Math.max(0,Math.min(100,((cur-s)/dur)*100));
        var bar=wrap.querySelector('.cake-progress-bar');
        if(bar)bar.style.width=pct+'%';
      }catch(ex){}
    },300);
    wrap._pollTimer=pollTimer;
  }
}
function cakePlayPause(){
  var wrap=document.querySelector('.cake-player');
  if(!wrap||!wrap._ytPlayer)return;
  try{
    var state=wrap._ytPlayer.getPlayerState();
    if(state===1)wrap._ytPlayer.pauseVideo();
    else wrap._ytPlayer.playVideo();
  }catch(e){}
}
function cakeSeek(delta){
  var wrap=document.querySelector('.cake-player');
  if(!wrap||!wrap._ytPlayer)return;
  try{
    var cur=wrap._ytPlayer.getCurrentTime();
    wrap._ytPlayer.seekTo(cur+delta,true);
  }catch(e){}
}
function cakeSeekTo(evt){
  var wrap=document.querySelector('.cake-player');
  if(!wrap||!wrap._ytPlayer)return;
  try{
    var prog=evt.currentTarget;
    var rect=prog.getBoundingClientRect();
    var pct=(evt.clientX-rect.left)/rect.width;
    var s=wrap._start||0;
    var e=wrap._end||wrap._ytPlayer.getDuration()||0;
    var dur=e-s;
    if(dur<=0)dur=wrap._ytPlayer.getDuration()||1;
    wrap._ytPlayer.seekTo(s+pct*dur,true);
  }catch(e){}
}
function buildVideoEmbed(card){
  const driveId=extractDriveId(card.driveUrl);
  if(driveId)return buildDriveEmbed(driveId,card.ytStart,card.ytEnd);
  const ytId=extractYtId(card.youtubeUrl);
  if(ytId)return buildYtEmbed(ytId,card.ytStart,card.ytEnd);
  return null;
}

function previewYtClip(){
  const url=document.getElementById('cardYoutubeUrl').value.trim();
  const videoId=extractYtId(url);
  if(!videoId){toast('Invalid YouTube URL');return;}
  const start=parseFloat(document.getElementById('cardYtStart').value)||0;
  const end=document.getElementById('cardYtEnd').value?parseFloat(document.getElementById('cardYtEnd').value):null;
  const wrap=document.getElementById('ytPreviewWrap');
  wrap.style.display='block';
  wrap.innerHTML='';
  wrap.appendChild(buildYtEmbed(videoId,start,end));
}


function showCurrentCard(){
  stopAllAudio();cleanupDialogueLayout();
  if(reviewIndex>=reviewQueue.length){
    document.getElementById('flashcard').style.display='none';
    document.getElementById('reviewActions').style.display='none';
    document.getElementById('typeAnswerWrap').style.display='none';
    document.getElementById('btnCheckAnswer').style.display='none';
    document.getElementById('btnNextCard').style.display='none';
    document.getElementById('reviewDone').style.display='block';
    document.getElementById('doneStats').innerHTML=
      '<div class="done-stat"><div class="done-stat-value xp">'+sessionXp+'</div><div class="done-stat-label">XP earned</div></div>'+
      '<div class="done-stat"><div class="done-stat-value streak">'+bestStreak+'</div><div class="done-stat-label">Best streak</div></div>'+
      '<div class="done-stat"><div class="done-stat-value correct">'+sessionCorrect+'</div><div class="done-stat-label">Correct</div></div>'+
      '<div class="done-stat"><div class="done-stat-value total">'+sessionTotal+'</div><div class="done-stat-label">Total</div></div>';
    updateReviewProgress();return;
  }
  cleanupDialogueLayout();
  const card=reviewQueue[reviewIndex];
  const fronts=card.fronts&&card.fronts.length>1?card.fronts:[card.front];
  const isDialogue=fronts.length>1&&card.displayMode!=='quiz';
  window._cardFronts=fronts;
  window._cardFrontIdx=0;
  window._dialogueShown=false;
  window._dialoguePlaying=false;
  window._dictationMode=false;
  if(window._dialogueTimer){clearTimeout(window._dialogueTimer);window._dialogueTimer=null;}
  const fcEl=document.getElementById('flashcard');
  fcEl.style.display='block';
  document.getElementById('reviewDone').style.display='none';
  fcEl.classList.remove('flipped');
  fcEl.classList.toggle('dialogue-mode',isDialogue);
  document.getElementById('reviewActions').style.display='none';
  document.getElementById('undoBtn').style.display=undoStack.length>0?'block':'none';

  const isVoice=card.displayMode&&card.displayMode.startsWith('voice');
  const isQuiz=card.displayMode==='quiz';

  if(isQuiz&&fronts.length>1){
    const el=document.getElementById('cardFront');
    const questionText=card.cardName||card.front||'';
    const safeQ=esc(questionText).replace(/'/g,"\\'").replace(/\n/g,' ');
    const labels='ABCDEFGHIJ';
    let optionsHtml='<div class="quiz-options" onclick="event.stopPropagation()">';
    fronts.forEach(function(f,i){
      const txt=typeof f==='object'?(f.text||''):f;
      const safeTxt=esc(txt).replace(/'/g,"\\'").replace(/\n/g,' ');
      optionsHtml+='<div class="quiz-option" data-answer="'+esc(txt)+'" data-idx="'+i+'">'
        +'<button class="quiz-option-speaker" onclick="event.stopPropagation();speakText(\''+safeTxt+'\')" title="Listen">🔊</button>'
        +'<span class="quiz-option-label">'+(labels[i]||String(i+1))+'</span>'
        +'<span class="quiz-option-text hidden-answer" onclick="event.stopPropagation();if(this.classList.contains(\'hidden-answer\')){this.classList.remove(\'hidden-answer\');this.textContent=this.getAttribute(\'data-text\');}else{this.classList.add(\'hidden-answer\');this.textContent=\'\';}"></span>'
        +'<button class="quiz-option-tick" onclick="event.stopPropagation();quizSelect(this)" title="Select">✓</button>'
        +'</div>';
    });
    optionsHtml+='</div><div id="cardQuizResult"></div>';
    el.innerHTML='<div class="voice-card"><button class="voice-play-btn" onclick="event.stopPropagation();speakText(\''+safeQ+'\')"><span class="voice-icon">🔊</span><span class="voice-label">Replay</span></button><div class="voice-hint">🎯 Listen & pick the right answer</div></div>'+optionsHtml;
    document.querySelectorAll('.quiz-option-text.hidden-answer').forEach(function(span,i){
      var txt=typeof fronts[i]==='object'?(fronts[i].text||''):fronts[i];
      span.setAttribute('data-text',txt);
    });
    document.getElementById('cardBack').innerHTML=renderContent(card.back);
    const hint=document.querySelector('.flashcard-hint');
    if(hint)hint.style.display='none';
    window._quizAnswered=false;
    setTimeout(function(){speakText(questionText);},300);
  } else if(isDialogue){
    // Dialogue mode: auto-play all fronts sequentially, voice-only (hidden text)
    const el=document.getElementById('cardFront');
    const dlgDriveId=extractDriveId(card.driveUrl);
    const dlgYtId=extractYtId(card.youtubeUrl);
    const hasVideo=dlgDriveId||dlgYtId;
    let ytBtnHtml=hasVideo?'<button class="yt-video-btn dialogue-yt-toggle" onclick="event.stopPropagation();toggleDialogueVideo()" style="margin-top:8px">🎬 Watch video</button>':'';
    el.innerHTML='<div class="voice-card"><button class="voice-play-btn dialogue-main-speaker" onclick="event.stopPropagation();replayDialogue()"><span class="voice-icon">🔊</span><span class="voice-label">Playing...</span></button><div class="voice-hint">🎧 Listen to the dialogue</div>'+ytBtnHtml+'</div><div class="front-counter">1 / '+fronts.length+'</div>';
    document.getElementById('cardBack').innerHTML='';
    window._dialoguePlaying=true;
    window._dialogueVoiceMap={};
    function playDialogueLine(idx){
      if(idx>=fronts.length){
        window._dialoguePlaying=false;
        const btn=el.querySelector('.dialogue-main-speaker .voice-label');
        if(btn)btn.textContent='Replay';
        el.querySelector('.front-counter').textContent=fronts.length+' / '+fronts.length;
        const hint=document.querySelector('.flashcard-hint');
        if(hint){hint.style.display='';hint.textContent='Tap to see transcript';}
        window._cardFrontIdx=fronts.length;
        return;
      }
      window._cardFrontIdx=idx;
      el.querySelector('.front-counter').textContent=(idx+1)+' / '+fronts.length;
      const lineText=getDialogueText(fronts[idx]);
      const lineSpeaker=getDialogueSpeaker(fronts[idx]);
      const lineVoice=lineSpeaker&&window._dialogueVoiceMap[lineSpeaker];
      if(lineVoice){speakTextAs(lineText,lineVoice);}else{speakText(lineText);}
      // Wait for audio to end then play next with delay
      function waitAndNext(){
        if(currentAudio&&!currentAudio.ended&&!currentAudio.paused){
          currentAudio.onended=function(){window._dialogueTimer=setTimeout(()=>playDialogueLine(idx+1),20);};
        } else if('speechSynthesis' in window&&speechSynthesis.speaking){
          const check=setInterval(()=>{if(!speechSynthesis.speaking){clearInterval(check);window._dialogueTimer=setTimeout(()=>playDialogueLine(idx+1),20);}},50);
        } else {
          window._dialogueTimer=setTimeout(()=>playDialogueLine(idx+1),100);
        }
      }
      setTimeout(waitAndNext,20);
    }
    assignDialogueVoices(fronts).then(m=>{
      window._dialogueVoiceMap=m;
      setTimeout(()=>playDialogueLine(0),100);
    });
  } else if(isVoice){
    const safeText=esc(card.front).replace(/'/g,"\\'").replace(/\n/g,' ');
    const modeHint=card.displayMode==='voice-repeat'?'🔁 Listen and repeat the sentence':card.displayMode==='voice-translate'?'🌐 Listen and translate the sentence':'🎧 Listen and answer the question';
    document.getElementById('cardFront').innerHTML='<div class="voice-card"><button class="voice-play-btn" onclick="event.stopPropagation();speakText(\''+safeText+'\')"><span class="voice-icon">🔊</span><span class="voice-label">Replay</span></button><div class="voice-hint">'+modeHint+'</div></div>';
    document.getElementById('cardBack').innerHTML=renderContent(card.back);
    const backFace=document.querySelector('.flashcard-face.back');
    const oldBtn=backFace.querySelector('.voice-mini-btn');if(oldBtn)oldBtn.remove();
    const miniBtn=document.createElement('button');miniBtn.className='voice-mini-btn';miniBtn.textContent='🔊';miniBtn.title='Replay';
    miniBtn.onclick=function(e){e.stopPropagation();speakText(card.front);};backFace.appendChild(miniBtn);
    setTimeout(()=>speakText(card.front),300);
  } else {
    document.getElementById('cardFront').innerHTML=renderContent(card.front);
    document.getElementById('cardBack').innerHTML=renderContent(card.back);
    const backFace=document.querySelector('.flashcard-face.back');
    const oldBtn=backFace.querySelector('.voice-mini-btn');if(oldBtn)oldBtn.remove();
    const miniBtn=document.createElement('button');miniBtn.className='voice-mini-btn';miniBtn.textContent='🔊';miniBtn.title='Read answer';
    miniBtn.onclick=function(e){e.stopPropagation();speakText(card.back);};backFace.appendChild(miniBtn);
  }

  // YouTube handled in flipCard (outside card layout)
  destroyYtPlayer();
  const backFaceEl=document.querySelector('.flashcard-face.back');
  backFaceEl.classList.remove('has-video');
  const oldYtBtn=backFaceEl.querySelector('.yt-video-btn');if(oldYtBtn)oldYtBtn.remove();
  const oldYtWrap=backFaceEl.querySelector('.yt-card-wrap');if(oldYtWrap)oldYtWrap.remove();
  const hasCardVideo=extractDriveId(card.driveUrl)||extractYtId(card.youtubeUrl);

  // Dictionary & Cake buttons
  const oldLinkBtns=backFaceEl.querySelector('.card-link-btns');if(oldLinkBtns)oldLinkBtns.remove();
  {
    const frontText=(card.front||'').replace(/<[^>]*>/g,'').trim();
    if(frontText||card.cakeUrl){
      const linkWrap=document.createElement('div');linkWrap.className='card-link-btns';linkWrap.style.cssText='display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;z-index:2;position:relative;justify-content:center';
      linkWrap.onclick=function(ev){ev.stopPropagation();};
      if(frontText){
        const dictBtn=document.createElement('button');dictBtn.className='yt-video-btn';
        dictBtn.innerHTML='📖 Dictionary';
        dictBtn.onclick=function(){window.open('https://dictionary.cambridge.org/dictionary/english/'+encodeURIComponent(frontText.toLowerCase()),'_blank');};
        linkWrap.appendChild(dictBtn);
      }
      if(card.cakeUrl){
        const cakeBtn=document.createElement('button');cakeBtn.className='yt-video-btn';
        cakeBtn.innerHTML='🍰 Cake';
        cakeBtn.onclick=function(){window.open(card.cakeUrl,'_blank');};
        linkWrap.appendChild(cakeBtn);
      }
      backFaceEl.insertBefore(linkWrap,backFaceEl.firstChild);
    }
  }

  // Definition button
  const oldDefBtn=backFaceEl.querySelector('.definition-wrap');if(oldDefBtn)oldDefBtn.remove();
  if(card.definition){
    const defWrap=document.createElement('div');defWrap.className='definition-wrap';defWrap.style.cssText='margin-top:10px;text-align:center;z-index:2;position:relative';
    defWrap.onclick=function(ev){ev.stopPropagation();};
    const defBtn=document.createElement('button');defBtn.className='yt-video-btn';defBtn.innerHTML='📝 Definition';
    const defContent=document.createElement('div');defContent.style.cssText='display:none;margin-top:8px;padding:10px 14px;border-radius:var(--r-sm);background:var(--surface-2,rgba(255,255,255,0.08));color:var(--ink);font-size:14px;text-align:left;line-height:1.5;white-space:pre-wrap';
    defContent.innerHTML=renderContent(card.definition);
    defBtn.onclick=function(){
      if(defContent.style.display==='none'){defContent.style.display='block';defBtn.innerHTML='📝 Hide';}
      else{defContent.style.display='none';defBtn.innerHTML='📝 Definition';}
    };
    defWrap.appendChild(defBtn);defWrap.appendChild(defContent);
    backFaceEl.appendChild(defWrap);
  }

  document.getElementById('cardTags').innerHTML=(card.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join('');

  document.getElementById('intAgain').textContent=getIntervalText(card,0);
  document.getElementById('intHard').textContent=getIntervalText(card,1);
  document.getElementById('intGood').textContent=getIntervalText(card,2);
  document.getElementById('intEasy').textContent=getIntervalText(card,3);

  // Per-card review mode
  reviewMode=card.reviewMode||'flip';
  document.getElementById('modeFlip').classList.toggle('active',reviewMode==='flip');
  document.getElementById('modeType').classList.toggle('active',reviewMode==='type');

  const hint=document.querySelector('.flashcard-hint');
  const typeWrap=document.getElementById('typeAnswerWrap'),btnCheck=document.getElementById('btnCheckAnswer'),btnNext=document.getElementById('btnNextCard'),typeInput=document.getElementById('typeAnswerInput'),typeResult=document.getElementById('typeAnswerResult');
  if(reviewMode==='type'){
    document.getElementById('flashcard').onclick=null;
    if(hint)hint.style.display='none';
    typeWrap.style.display='block';btnCheck.style.display='block';btnNext.style.display='none';
    typeInput.value='';typeInput.className='type-answer-input';typeResult.className='type-answer-result';typeResult.style.display='none';
    setTimeout(()=>typeInput.focus(),100);
  } else {
    document.getElementById('flashcard').onclick=flipCard;
    if(hint){hint.style.display='';hint.textContent=isDialogue?'Listening... tap to skip':'Tap to see answer · Space';}
    typeWrap.style.display='none';btnCheck.style.display='none';btnNext.style.display='none';
  }
  updateReviewProgress();
}

let currentAudio=null;
const EDGE_TTS_API='https://edge-tts-api-gold.vercel.app/api/tts';
const LOCALE_FLAGS={'en-US':'🇺🇸 US','en-GB':'🇬🇧 UK','en-AU':'🇦🇺 Australia','en-CA':'🇨🇦 Canada','en-IN':'🇮🇳 India','en-IE':'🇮🇪 Ireland','en-NZ':'🇳🇿 New Zealand','en-SG':'🇸🇬 Singapore','en-ZA':'🇿🇦 South Africa','en-PH':'🇵🇭 Philippines','en-HK':'🇭🇰 Hong Kong','en-KE':'🇰🇪 Kenya','en-NG':'🇳🇬 Nigeria','en-TZ':'🇹🇿 Tanzania'};
let edgeVoicesCache=null;
const VOICE_OPTIONS={
  edge:[],
  'google-translate':[
    {id:'en-US',name:'American English 🇺🇸'},
    {id:'en-GB',name:'British English 🇬🇧'},
    {id:'en-AU',name:'Australian English 🇦🇺'},
    {id:'en-IN',name:'Indian English 🇮🇳'}
  ],
  browser:[]
};
async function loadEdgeVoices(){
  if(edgeVoicesCache)return edgeVoicesCache;
  try{
    const r=await fetch('https://edge-tts-api-gold.vercel.app/api/voices?lang=en');
    const voices=await r.json();
    edgeVoicesCache=voices.filter(v=>!v.id.includes('Multilingual')).map(v=>{
      const name=v.id.split('-').pop().replace('Neural','');
      const locale=v.id.split('-').slice(0,2).join('-');
      const flag=LOCALE_FLAGS[locale]||locale;
      const gender=v.gender==='Female'?'Female':'Male';
      return{id:v.id,name:name+' — '+gender+' '+flag};
    });
    edgeVoicesCache.sort((a,b)=>{
      const order=['en-US','en-GB','en-AU','en-CA','en-IN'];
      const la=a.id.split('-').slice(0,2).join('-'),lb=b.id.split('-').slice(0,2).join('-');
      const ia=order.indexOf(la),ib=order.indexOf(lb);
      return(ia===-1?99:ia)-(ib===-1?99:ib)||a.name.localeCompare(b.name);
    });
    VOICE_OPTIONS.edge=edgeVoicesCache;
    return edgeVoicesCache;
  }catch(e){return[];}
}

function updateVoiceList(){
  const provider=document.getElementById('voiceProviderSelect').value;
  const sel=document.getElementById('voiceIdSelect');
  sel.innerHTML='';
  if(provider==='browser'){sel.style.display='none';return;}
  sel.style.display='';
  const renderOpts=(opts)=>{
    sel.innerHTML='';
    opts.forEach(v=>{const o=document.createElement('option');o.value=v.id;o.textContent=v.name;sel.appendChild(o);});
    const saved=db.settings.voiceProvider===provider?db.settings.voiceId:null;
    if(saved&&opts.find(v=>v.id===saved))sel.value=saved;
  };
  if(provider==='edge'){
    sel.innerHTML='<option>Loading voices...</option>';
    loadEdgeVoices().then(voices=>{
      if(voices.length)renderOpts(voices);
      else{sel.innerHTML='<option value="en-US-JennyNeural">Jenny — Female 🇺🇸 US</option>';}
    });
    return;
  }
  renderOpts(VOICE_OPTIONS[provider]||[]);
}

function edgeTTS(text,voiceId){
  const encoded=encodeURIComponent(text.substring(0,1000));
  const voice=voiceId||'en-US-JennyNeural';
  const url=EDGE_TTS_API+'?text='+encoded+'&voice='+voice;
  return new Audio(url);
}

function googleTranslateTTS(text,lang){
  const encoded=encodeURIComponent(text.substring(0,200));
  const url='https://translate.google.com/translate_tts?ie=UTF-8&tl='+(lang||'en-US').split('-')[0]+'&client=tw-ob&q='+encoded;
  return new Audio(url);
}

function speakText(text){
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  const btn=document.querySelector('.voice-play-btn');
  if(btn)btn.classList.add('speaking');
  const done=()=>{if(btn)btn.classList.remove('speaking');};
  let provider=db.settings.voiceProvider||'edge';
  let voiceId=db.settings.voiceId||'en-US-JennyNeural';
  if(!['edge','google-translate','browser'].includes(provider))provider='edge';
  if((db.settings.randomVoice!==false)&&provider==='edge'&&edgeVoicesCache&&edgeVoicesCache.length>1){
    let rv;do{rv=edgeVoicesCache[Math.floor(Math.random()*edgeVoicesCache.length)];}while(rv.id===window._lastRandomVoice&&edgeVoicesCache.length>1);
    voiceId=rv.id;window._lastRandomVoice=rv.id;
  }
  if(provider==='browser'){speakFallback(text);return;}
  if(provider==='google-translate'){
    try{
      const audio=googleTranslateTTS(text,voiceId);
      currentAudio=audio;audio.playbackRate=db.settings.speechRate||1;
      audio.onended=done;audio.onerror=()=>{done();speakFallback(text);};
      audio.play().catch(()=>{done();speakFallback(text);});
    }catch(e){done();speakFallback(text);}
    return;
  }
  if(provider==='edge'){
    try{
      const audio=edgeTTS(text,voiceId);
      currentAudio=audio;audio.playbackRate=db.settings.speechRate||1;
      audio.onended=done;audio.onerror=()=>{done();speakFallback(text);};
      audio.play().catch(()=>{done();speakFallback(text);});
    }catch(e){done();speakFallback(text);}
    return;
  }
  speakFallback(text);
}

function speakTextAs(text,forceVoiceId){
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  const btn=document.querySelector('.voice-play-btn');
  if(btn)btn.classList.add('speaking');
  const done=()=>{if(btn)btn.classList.remove('speaking');};
  let provider=db.settings.voiceProvider||'edge';
  if(!['edge','google-translate','browser'].includes(provider))provider='edge';
  if(provider==='browser'){speakFallback(text);return;}
  if(provider==='google-translate'){
    try{const audio=googleTranslateTTS(text,forceVoiceId);currentAudio=audio;audio.playbackRate=db.settings.speechRate||1;audio.onended=done;audio.onerror=()=>{done();speakFallback(text);};audio.play().catch(()=>{done();speakFallback(text);});}catch(e){done();speakFallback(text);}
    return;
  }
  try{const audio=edgeTTS(text,forceVoiceId);currentAudio=audio;audio.playbackRate=db.settings.speechRate||1;audio.onended=done;audio.onerror=()=>{done();speakFallback(text);};audio.play().catch(()=>{done();speakFallback(text);});}catch(e){done();speakFallback(text);}
}

async function assignDialogueVoices(fronts){
  if(!edgeVoicesCache)await loadEdgeVoices();
  const map={};
  const voices=(edgeVoicesCache&&edgeVoicesCache.length>1)?edgeVoicesCache.slice():[];
  const used=[];
  const defaultVoice=db.settings.voiceId||'en-US-JennyNeural';
  fronts.forEach(f=>{
    const spk=typeof f==='object'?f.speaker:'';
    if(!spk||map[spk])return;
    const available=voices.filter(v=>used.indexOf(v.id)===-1);
    if(available.length>0){
      const pick=available[Math.floor(Math.random()*available.length)];
      map[spk]=pick.id;
      used.push(pick.id);
    } else {
      map[spk]=defaultVoice;
    }
  });
  return map;
}

function getDialogueText(f){var t=typeof f==='object'?f.text:f;if(t){t=t.replace(/^[A-Z]\s*(?:\([^)]*\))?\s*[:：]\s*/,'');var ex=extractTrans(t);t=ex.text;}return t;}
function getDialogueSpeaker(f){return typeof f==='object'?(f.speaker||''):'';}

function testVoice(){
  const text=document.getElementById('voiceTestInput').value.trim();
  if(!text){toast('Enter a sentence to preview');return;}
  const provider=document.getElementById('voiceProviderSelect').value;
  const voiceId=document.getElementById('voiceIdSelect').value;
  const status=document.getElementById('voiceTestStatus');
  const btn=document.getElementById('testVoiceBtn');
  btn.disabled=true;btn.textContent='⏳ Loading...';
  status.textContent='Generating voice...';
  if(provider==='browser'){
    if(!('speechSynthesis' in window)){status.textContent='Browser not supported';btn.disabled=false;btn.textContent='▶ Preview';return;}
    const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=parseFloat(document.getElementById('speechRateInput').value)||1;
    const voices=speechSynthesis.getVoices();
    const preferred=voices.find(v=>v.name.includes('Google US English'))||voices.find(v=>v.lang.startsWith('en'));
    if(preferred)u.voice=preferred;
    u.onend=()=>{status.textContent='✅ Done';btn.disabled=false;btn.textContent='▶ Preview';};
    speechSynthesis.speak(u);status.textContent='🔊 Playing...';btn.disabled=false;btn.textContent='▶ Preview';
    return;
  }
  if(provider==='google-translate'){
    try{
      const audio=googleTranslateTTS(text,voiceId);
      if(currentAudio)currentAudio.pause();
      currentAudio=audio;audio.playbackRate=parseFloat(document.getElementById('speechRateInput').value)||1;
      audio.onended=()=>{status.textContent='✅ Done';};
      audio.onerror=()=>{status.textContent='❌ Error — try Edge TTS or Browser';btn.disabled=false;btn.textContent='▶ Preview';};
      status.textContent='🔊 Playing...';
      audio.play().catch(()=>{status.textContent='❌ Google blocked — try Edge TTS';btn.disabled=false;btn.textContent='▶ Preview';});
      btn.disabled=false;btn.textContent='▶ Preview';
    }catch(e){status.textContent='❌ Error';btn.disabled=false;btn.textContent='▶ Preview';}
    return;
  }
  if(provider==='edge'){
    try{
      const audio=edgeTTS(text,voiceId);
      if(currentAudio)currentAudio.pause();
      currentAudio=audio;audio.playbackRate=parseFloat(document.getElementById('speechRateInput').value)||1;
      audio.onended=()=>{status.textContent='✅ Done';};
      audio.onerror=()=>{status.textContent='❌ Error — try Google Translate';btn.disabled=false;btn.textContent='▶ Preview';};
      status.textContent='🔊 Playing...';
      audio.play().catch(()=>{status.textContent='❌ Playback error';btn.disabled=false;btn.textContent='▶ Preview';});
      btn.disabled=false;btn.textContent='▶ Preview';
    }catch(e){status.textContent='❌ Error';btn.disabled=false;btn.textContent='▶ Preview';}
    return;
  }
  status.textContent='❌ Provider not supported';btn.disabled=false;btn.textContent='▶ Preview';
}
var _speechRates=[0.5,0.75,1,1.25,1.5,2];
function cycleSpeechRate(){
  var cur=db.settings.speechRate||1;
  var idx=_speechRates.indexOf(cur);
  idx=(idx+1)%_speechRates.length;
  db.settings.speechRate=_speechRates[idx];
  saveLocal();
  var btn=document.getElementById('speedBtn');
  if(btn)btn.textContent='🔊 '+_speechRates[idx]+'x';
  toast('Speed: '+_speechRates[idx]+'x');
}
function initSpeedBtn(){
  var btn=document.getElementById('speedBtn');
  if(btn)btn.textContent='🔊 '+(db.settings.speechRate||1)+'x';
}

function speakFallback(text){
  if(!('speechSynthesis' in window))return;
  const u=new SpeechSynthesisUtterance(text);
  u.lang='en-US';u.rate=db.settings.speechRate||1;u.pitch=1;
  const voices=speechSynthesis.getVoices();
  const preferred=voices.find(v=>v.name.includes('Google US English'))||voices.find(v=>v.name.includes('Google UK English'))||voices.find(v=>v.lang.startsWith('en')&&v.localService===false)||voices.find(v=>v.lang.startsWith('en'));
  if(preferred)u.voice=preferred;
  const btn=document.querySelector('.voice-play-btn');
  if(btn)btn.classList.add('speaking');
  u.onend=()=>{if(btn)btn.classList.remove('speaking');};
  u.onerror=()=>{if(btn)btn.classList.remove('speaking');};
  speechSynthesis.speak(u);
}
if('speechSynthesis' in window)speechSynthesis.getVoices();

function renderContent(text){
  let html=esc(text);
  html=html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1">');
  html=html.replace(/\[\.\.\.]/g,'<span class="cloze-blank">[...]</span>');
  return html;
}

function replayDialogue(){
  const fronts=window._cardFronts||[];
  if(fronts.length<2)return;
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(window._dialogueTimer){clearTimeout(window._dialogueTimer);window._dialogueTimer=null;}
  window._dialoguePlaying=true;
  const el=document.getElementById('cardFront');
  const btn=el?el.querySelector('.dialogue-main-speaker .voice-label'):null;
  if(btn)btn.textContent='Playing...';
  // Restart YouTube video from start
  const card=reviewQueue[reviewIndex];
  const ytWrap=document.querySelector('.dialogue-yt-wrap');
  if(ytWrap&&card){
    const ve=buildVideoEmbed(card);
    if(ve){ytWrap.innerHTML='';ytWrap.appendChild(ve);}
  }
  function playLine(idx){
    if(idx>=fronts.length){
      window._dialoguePlaying=false;
      if(btn)btn.textContent='Replay';
      return;
    }
    const counter=el?el.querySelector('.front-counter'):null;
    if(counter)counter.textContent=(idx+1)+' / '+fronts.length;
    const lt=getDialogueText(fronts[idx]),ls=getDialogueSpeaker(fronts[idx]),lv=ls&&window._dialogueVoiceMap?window._dialogueVoiceMap[ls]:null;
    if(lv){speakTextAs(lt,lv);}else{speakText(lt);}
    function waitNext(){
      if(currentAudio&&!currentAudio.ended&&!currentAudio.paused){
        currentAudio.onended=function(){window._dialogueTimer=setTimeout(()=>playLine(idx+1),20);};
      } else if('speechSynthesis' in window&&speechSynthesis.speaking){
        const chk=setInterval(()=>{if(!speechSynthesis.speaking){clearInterval(chk);window._dialogueTimer=setTimeout(()=>playLine(idx+1),20);}},50);
      } else {
        window._dialogueTimer=setTimeout(()=>playLine(idx+1),100);
      }
    }
    setTimeout(waitNext,20);
  }
  playLine(0);
}
function flipCard(){
  if(reviewMode==='type')return;
  var curCard=reviewQueue[reviewIndex];
  if(curCard&&curCard.displayMode==='quiz'&&(curCard.fronts&&curCard.fronts.length>1))return;
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(window._dialogueTimer){clearTimeout(window._dialogueTimer);window._dialogueTimer=null;}
  const fc=document.getElementById('flashcard');
  const fronts=window._cardFronts||[];
  // Dialogue mode
  if(fronts.length>1&&!fc.classList.contains('flipped')){
    window._dialoguePlaying=false;
    if(!window._dialogueShown){
      window._dialogueShown=true;
      const el=document.getElementById('cardFront');
      const card=reviewQueue[reviewIndex];
      const driveId2=extractDriveId(card.driveUrl);
      const ytId=extractYtId(card.youtubeUrl);
      const hasVid=driveId2||ytId;
      let transcriptHtml='<div class="dialogue-list front-transition">';
      const vMap=window._dialogueVoiceMap||{};
      fronts.forEach(function(f,i){
        const rawTxt=typeof f==='object'?f.text:f;
        const exRaw=extractTrans(rawTxt||'');
        const txt=getDialogueText(f);
        const spk=getDialogueSpeaker(f);
        const trans=(typeof f==='object'&&f.trans)?f.trans:exRaw.trans;
        const safe=esc(txt).replace(/'/g,"\\'").replace(/\n/g,' ');
        const vid=spk&&vMap[spk]?vMap[spk]:'';
        const speakFn=vid?'speakTextAs(\''+safe+'\',\''+vid+'\')':'speakText(\''+safe+'\')';
        const spkLabel=spk?'<span class="dialogue-speaker">'+esc(spk)+'</span>':'';
        const transBtn=trans?'<button class="dialogue-trans-btn" onclick="event.stopPropagation();toggleDialogueTrans(this)" title="Dịch">🇻🇳</button>':'';
        const transDiv=trans?'<div class="dialogue-trans">'+esc(trans)+'</div>':'';
        transcriptHtml+='<div class="dialogue-line-wrap"><div class="dialogue-line'+(i%2===1?' alt':'')+'" onclick="event.stopPropagation();toggleDialogueText(this)"><button class="dialogue-speak-btn" onclick="event.stopPropagation();'+speakFn+'" title="Play">🔊</button>'+spkLabel+'<div class="dialogue-text hidden-text">'+renderContent(txt)+'</div>'+transBtn+'<button class="dialogue-eye-btn" onclick="event.stopPropagation();toggleDialogueText(this.closest(\'.dialogue-line\'))" title="Show/Hide">👁</button></div>'+transDiv+'</div>';
      });
      transcriptHtml+='</div>';
      el.innerHTML=transcriptHtml;
      fc.classList.add('dialogue-mode');
      // YouTube outside the card
      const oldOuter=document.querySelector('.dialogue-outer-layout');
      if(oldOuter){
        const ytOuter=oldOuter.querySelector('.dialogue-yt-outer');
        if(ytOuter)ytOuter.remove();
        oldOuter.replaceWith(fc);
      }
      // Action buttons above the card
      const oldActBar=document.querySelector('.dialogue-action-bar');if(oldActBar)oldActBar.remove();
      const actBar=document.createElement('div');actBar.className='dialogue-action-bar';
      actBar.style.cssText='display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;justify-content:center';
      actBar.onclick=function(e){e.stopPropagation();};
      var _actHtml='<button class="btn btn-ghost btn-sm" onclick="var w=document.querySelector(\'.dialogue-yt-wrap\');if(w){w.innerHTML=\'\';var e=buildVideoEmbed(reviewQueue[reviewIndex]);if(e)w.appendChild(e);}">🔄 Replay</button><button class="btn btn-ghost btn-sm" onclick="toggleAllDialogueText()">Show / Hide all</button><button class="btn btn-ghost btn-sm" onclick="flipCard()">↩ Flip back</button>';
      var _ft=(card.front||'').replace(/<[^>]*>/g,'').trim();
      if(_ft)_actHtml+='<button class="btn btn-ghost btn-sm" onclick="window.open(\'https://dictionary.cambridge.org/dictionary/english/'+encodeURIComponent(_ft.toLowerCase())+'\',\'_blank\')">📖 Dictionary</button>';
      if(card.cakeUrl)_actHtml+='<button class="btn btn-ghost btn-sm" onclick="window.open(\''+card.cakeUrl.replace(/'/g,"\\'")+'\',\'_blank\')">🍰 Cake</button>';
      _actHtml+='<button class="btn btn-ghost btn-sm" onclick="startDictation()">✍️ Dictation</button>';
      _actHtml+='<button class="btn btn-ghost btn-sm" style="background:var(--green);color:#fff;font-weight:700" onclick="answerCard(2)">Next ▶</button>';
      actBar.innerHTML=_actHtml;
      fc.parentNode.insertBefore(actBar,fc);
      if(hasVid){
        const wrapper=document.createElement('div');
        wrapper.className='dialogue-outer-layout';
        actBar.parentNode.insertBefore(wrapper,actBar);
        const ytDiv=document.createElement('div');
        ytDiv.className='dialogue-yt-outer';
        ytDiv.innerHTML='<div class="dialogue-yt-wrap"></div>';
        ytDiv.onclick=function(e){e.stopPropagation();};
        ytDiv.querySelector('.dialogue-yt-wrap').appendChild(buildVideoEmbed(card));
        wrapper.appendChild(ytDiv);
        const rightCol=document.createElement('div');
        rightCol.className='dialogue-right-col';
        rightCol.appendChild(actBar);
        rightCol.appendChild(fc);
        wrapper.appendChild(rightCol);
      }
      const hint=document.querySelector('.flashcard-hint');
      if(hint)hint.style.display='none';
      if(hasVid)document.getElementById('reviewActions').style.display='none';
      else document.getElementById('reviewActions').style.display='flex';
      return;
    }
    // Already shown transcript — toggle back to voice question
    window._dialogueShown=false;
    fc.classList.remove('dialogue-mode');
    const el2=document.getElementById('cardFront');
    const cardFlip=reviewQueue[reviewIndex];
    const hasVid2=extractDriveId(cardFlip.driveUrl)||extractYtId(cardFlip.youtubeUrl);
    let ytBtn2=hasVid2?'<button class="yt-video-btn dialogue-yt-toggle" onclick="event.stopPropagation();toggleDialogueVideo()" style="margin-top:8px">🎬 Watch video</button>':'';
    el2.innerHTML='<div class="voice-card"><button class="voice-play-btn dialogue-main-speaker" onclick="event.stopPropagation();replayDialogue()"><span class="voice-icon">🔊</span><span class="voice-label">Replay</span></button><div class="voice-hint">🎧 Listen to the dialogue</div>'+ytBtn2+'</div><div class="front-counter">'+fronts.length+' / '+fronts.length+'</div>';
    cleanupDialogueLayout();
    document.getElementById('reviewActions').style.display='none';
    const hint2=document.querySelector('.flashcard-hint');
    if(hint2){hint2.style.display='';hint2.textContent='Tap to see transcript';}
    return;
  }
  if(fc.classList.contains('flipped')){
    fc.classList.remove('flipped');
    fc.classList.remove('dialogue-mode');
    cleanupDialogueLayout();
    document.getElementById('reviewActions').style.display='none';
  } else {
    fc.classList.add('flipped');
    const card=reviewQueue[reviewIndex];
    const vidEmbed=buildVideoEmbed(card);
    if(vidEmbed){
      document.getElementById('reviewActions').style.display='none';
      fc.classList.add('dialogue-mode');
      const backFaceEl=fc.querySelector('.flashcard-face.back');
      const oldBtn=backFaceEl.querySelector('.yt-video-btn');if(oldBtn)oldBtn.remove();
      const oldWrap=backFaceEl.querySelector('.yt-card-wrap');if(oldWrap)oldWrap.remove();
      const oldBtnRow=backFaceEl.querySelector('.card-link-btns');if(oldBtnRow)oldBtnRow.remove();
      cleanupDialogueLayout();
      const wrapper=document.createElement('div');
      wrapper.className='dialogue-outer-layout';
      fc.parentNode.insertBefore(wrapper,fc);
      const ytDiv=document.createElement('div');
      ytDiv.className='dialogue-yt-outer';
      ytDiv.innerHTML='<div class="dialogue-yt-wrap"></div>';
      ytDiv.onclick=function(e){e.stopPropagation();};
      ytDiv.querySelector('.dialogue-yt-wrap').appendChild(vidEmbed);
      wrapper.appendChild(ytDiv);
      wrapper.appendChild(fc);
      const ft=(card.front||'').replace(/<[^>]*>/g,'').trim();
      let extraBtns='<div class="card-link-btns-outer" style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;justify-content:center" onclick="event.stopPropagation()">';
      extraBtns+='<button class="yt-video-btn" onclick="event.stopPropagation();var w=document.querySelector(\'.dialogue-yt-wrap\');if(w){w.innerHTML=\'\';var e=buildVideoEmbed(reviewQueue[reviewIndex]);if(e)w.appendChild(e);}">🔄 Replay</button>';
      if(ft)extraBtns+='<button class="yt-video-btn" onclick="window.open(\'https://dictionary.cambridge.org/dictionary/english/'+encodeURIComponent(ft.toLowerCase())+'\',\'_blank\')">📖 Dictionary</button>';
      if(card.cakeUrl)extraBtns+='<button class="yt-video-btn" onclick="window.open(\''+card.cakeUrl+'\',\'_blank\')">🍰 Cake</button>';
      extraBtns+='<button class="yt-video-btn" style="background:var(--green);color:#fff;font-weight:700" onclick="answerCard(2)">Next ▶</button>';
      extraBtns+='</div>';
      backFaceEl.insertAdjacentHTML('afterbegin',extraBtns);
    } else {
      document.getElementById('reviewActions').style.display='flex';
    }
  }
}
function toggleDialogueText(lineEl){
  const txt=lineEl.querySelector('.dialogue-text');
  if(txt)txt.classList.toggle('hidden-text');
}
function toggleDialogueTrans(btn){
  const wrap=btn.closest('.dialogue-line-wrap');
  if(!wrap)return;
  const trans=wrap.querySelector('.dialogue-trans');
  if(trans)trans.classList.toggle('show');
}
function toggleAllDialogueText(){
  const texts=document.querySelectorAll('.dialogue-text');
  const anyHidden=Array.from(texts).some(t=>t.classList.contains('hidden-text'));
  texts.forEach(t=>{if(anyHidden)t.classList.remove('hidden-text');else t.classList.add('hidden-text');});
}
function startDictation(){
  if(window._dictationMode){exitDictation();return;}
  var card=reviewQueue[reviewIndex];
  var fronts=window._cardFronts||[];
  if(fronts.length<2)return;
  window._dictationMode=true;
  var vMap=window._dialogueVoiceMap||{};
  var fc=document.getElementById('flashcard');
  var el=document.getElementById('cardFront');
  var html='<div class="dictation-wrap" onclick="event.stopPropagation()">';
  html+='<div style="text-align:center;font-size:16px;font-weight:600;color:var(--primary);margin-bottom:4px">✍️ Dictation Mode</div>';
  fronts.forEach(function(f,i){
    var txt=getDialogueText(f);
    var spk=getDialogueSpeaker(f);
    var safe=esc(txt).replace(/'/g,"\\'").replace(/\n/g,' ');
    var vid=spk&&vMap[spk]?vMap[spk]:'';
    var speakFn=vid?'speakTextAs(\''+safe+'\',\''+vid+'\')':'speakText(\''+safe+'\')';
    var spkLabel=spk?'<span class="dialogue-speaker">'+esc(spk)+'</span>':'';
    html+='<div class="dictation-line" data-answer="'+esc(txt).replace(/"/g,'&quot;')+'">';
    html+='<div class="dictation-top">'+spkLabel;
    html+='<button class="dialogue-speak-btn" onclick="event.stopPropagation();'+speakFn+'" title="Play">🔊</button>';
    html+='<input class="dictation-input" placeholder="Type what you hear..." data-idx="'+i+'" autocomplete="off" spellcheck="false" onkeydown="if(event.key===\'Enter\'){event.stopPropagation();checkDictationLine(this);var nxt=this.closest(\'.dictation-line\').nextElementSibling;if(nxt){var ni=nxt.querySelector(\'.dictation-input\');if(ni)ni.focus();}}">';
    html+='<button class="dictation-check-btn" onclick="event.stopPropagation();checkDictationLine(this)">Check</button>';
    html+='</div>';
    html+='<div class="dictation-answer" id="dictAns'+i+'">'+renderContent(txt)+'</div>';
    html+='</div>';
  });
  html+='<div class="dictation-score" id="dictationScore"></div>';
  html+='<div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();checkAllDictation()">Check All</button><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();showAllDictation()">Show All</button><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();exitDictation()">Exit</button></div>';
  html+='</div>';
  el.innerHTML=html;
  setTimeout(function(){var first=el.querySelector('.dictation-input');if(first)first.focus();},100);
}
function normDictation(s){return s.replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim().toLowerCase();}
function checkDictationLine(btn){
  var line=btn.closest('.dictation-line');
  var input=line.querySelector('.dictation-input');
  var ans=line.getAttribute('data-answer');
  var ansEl=line.querySelector('.dictation-answer');
  var userVal=normDictation(input.value);
  var correct=normDictation(ans);
  if(userVal===correct){input.className='dictation-input correct';ansEl.className='dictation-answer show';}
  else{input.className='dictation-input wrong';ansEl.className='dictation-answer show';}
}
function checkAllDictation(){
  var lines=document.querySelectorAll('.dictation-line');
  var total=lines.length,right=0;
  lines.forEach(function(line){
    var input=line.querySelector('.dictation-input');
    var ans=line.getAttribute('data-answer');
    var ansEl=line.querySelector('.dictation-answer');
    var userVal=normDictation(input.value);
    var correct=normDictation(ans);
    if(userVal===correct){input.className='dictation-input correct';right++;}
    else{input.className='dictation-input wrong';}
    ansEl.className='dictation-answer show';
  });
  var scoreEl=document.getElementById('dictationScore');
  if(scoreEl)scoreEl.textContent=right+' / '+total+' correct';
}
function showAllDictation(){
  document.querySelectorAll('.dictation-answer').forEach(function(el){el.className='dictation-answer show';});
}
function exitDictation(){
  window._dictationMode=false;
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  window._dialogueShown=false;
  flipCard();
}
function toggleDialogueVideo(){
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(window._dialogueTimer){clearTimeout(window._dialogueTimer);window._dialogueTimer=null;}
  window._dialoguePlaying=false;
  const fc=document.getElementById('flashcard');
  const card=reviewQueue[reviewIndex];
  const embed=buildVideoEmbed(card);
  if(!embed)return;
  const existing=document.querySelector('.dialogue-outer-layout');
  if(existing){
    const ytOuter=existing.querySelector('.dialogue-yt-outer');
    if(ytOuter){destroyYtPlayer();ytOuter.remove();}
    existing.replaceWith(fc);
    fc.classList.remove('dialogue-mode');
    fc.style.maxWidth='';
    const btn=fc.querySelector('.dialogue-yt-toggle');
    if(btn)btn.textContent='🎬 Watch video';
    return;
  }
  fc.classList.add('dialogue-mode');
  fc.style.maxWidth='400px';
  const wrapper=document.createElement('div');
  wrapper.className='dialogue-outer-layout';
  fc.parentNode.insertBefore(wrapper,fc);
  const ytDiv=document.createElement('div');
  ytDiv.className='dialogue-yt-outer';
  ytDiv.innerHTML='<div class="dialogue-yt-wrap" style="width:100%;aspect-ratio:16/9;background:#000;border-radius:var(--r-xl);overflow:hidden"></div>';
  ytDiv.onclick=function(e){e.stopPropagation();};
  ytDiv.querySelector('.dialogue-yt-wrap').appendChild(embed);
  wrapper.appendChild(ytDiv);
  wrapper.appendChild(fc);
  const btn=fc.querySelector('.dialogue-yt-toggle');
  if(btn)btn.textContent='✕ Hide video';
}
function showDialogueAnswer(){
  const fc=document.getElementById('flashcard');
  const card=reviewQueue[reviewIndex];
  if(card.back){
    document.getElementById('cardBack').innerHTML=renderContent(card.back);
    fc.classList.add('flipped');
  }
  document.getElementById('reviewActions').style.display='flex';
}

function normalize(s){return s.trim().toLowerCase().replace(/\s+/g,' ');}

function checkTypedAnswer(){
  const card=reviewQueue[reviewIndex];const typed=document.getElementById('typeAnswerInput').value;
  const correct=normalize(card.back)===normalize(typed);
  const input=document.getElementById('typeAnswerInput'),result=document.getElementById('typeAnswerResult');
  document.getElementById('flashcard').classList.add('flipped');
  if(correct){
    input.className='type-answer-input correct';result.className='type-answer-result correct';
    result.textContent='✓ Correct!';result.style.display='block';
    answerCard(2);setTimeout(()=>showCurrentCard(),1200);
  } else {
    input.className='type-answer-input wrong';result.className='type-answer-result wrong';
    result.innerHTML='✗ Wrong — Answer: <strong>'+esc(card.back)+'</strong>';result.style.display='block';
    document.getElementById('btnCheckAnswer').style.display='none';document.getElementById('btnNextCard').style.display='block';
  }
}
function nextAfterType(){answerCard(0);showCurrentCard();}

// ===== STREAK + XP SYSTEM =====
let streak=0,bestStreak=0,sessionXp=0,sessionCorrect=0,sessionTotal=0;

function getMultiplier(){
  if(streak>=20)return 10;
  if(streak>=10)return 5;
  if(streak>=5)return 3;
  if(streak>=3)return 2;
  return 1;
}

function getXpForQuality(q){
  if(q===3)return 15;
  if(q===2)return 10;
  if(q===1)return 5;
  return 0;
}

function updateStreakUI(){
  const fire=document.getElementById('streakFire');
  const cnt=document.getElementById('streakCount');
  const mult=document.getElementById('streakMultiplier');
  const bar=document.getElementById('streakBar');
  const m=getMultiplier();

  cnt.textContent=streak;
  document.getElementById('sessionXp').textContent=sessionXp;
  mult.textContent='x'+m;
  mult.className='streak-multiplier'+(m>=10?' x10':m>=5?' x5':m>=3?' x3':m>=2?' x2':'');

  if(streak>=20){fire.className='streak-fire blazing';fire.textContent='💎';cnt.className='streak-count blazing';bar.className='streak-bar legendary';}
  else if(streak>=10){fire.className='streak-fire blazing';fire.textContent='🔥';cnt.className='streak-count blazing';bar.className='streak-bar on-fire';}
  else if(streak>=5){fire.className='streak-fire active';fire.textContent='🔥';cnt.className='streak-count active';bar.className='streak-bar on-fire';}
  else if(streak>=1){fire.className='streak-fire active';fire.textContent='🔥';cnt.className='streak-count active';bar.className='streak-bar';}
  else{fire.className='streak-fire';fire.textContent='🔥';cnt.className='streak-count';bar.className='streak-bar';}
}

function showXpFloat(xp,el){
  const f=document.createElement('div');
  f.className='xp-float';
  f.style.color=xp>=30?'var(--pink)':xp>=15?'var(--orange)':'var(--green)';
  f.textContent='+'+xp+' XP';
  const rect=el?el.getBoundingClientRect():{left:window.innerWidth/2,top:window.innerHeight/2};
  f.style.left=(rect.left+rect.width/2-30)+'px';
  f.style.top=(rect.top-10)+'px';
  document.body.appendChild(f);
  setTimeout(()=>f.remove(),1000);
}

const streakMilestones=[
  {at:3,emoji:'⚡',text:'Combo x2!',sub:'XP doubled'},
  {at:5,emoji:'🔥',text:'On Fire!',sub:'XP x3'},
  {at:10,emoji:'💥',text:'UNSTOPPABLE!',sub:'XP x5'},
  {at:20,emoji:'💎',text:'LEGENDARY!',sub:'XP x10'},
  {at:50,emoji:'👑',text:'GODLIKE!',sub:'Unstoppable'},
  {at:100,emoji:'🏆',text:'ULTIMATE!',sub:'Super memory'}
];

function showStreakMilestone(s){
  const ms=streakMilestones.find(m=>m.at===s);
  if(!ms)return;
  const popup=document.getElementById('streakPopup');
  popup.innerHTML='<div class="streak-popup-inner"><div class="streak-popup-emoji">'+ms.emoji+'</div><div class="streak-popup-text">'+ms.text+'</div><div class="streak-popup-sub">'+s+' streak · '+ms.sub+'</div></div>';
  popup.className='streak-popup show';
  setTimeout(()=>{popup.className='streak-popup';},1200);
}

function resetStreak(){streak=0;updateStreakUI();}

function quizSelect(btn){
  if(window._quizAnswered)return;
  window._quizAnswered=true;
  var option=btn.closest('.quiz-option');
  var answer=(option.getAttribute('data-answer')||'').trim();
  var card=reviewQueue[reviewIndex];
  var correct=(card.back||'').trim();
  var isCorrect=answer.toLowerCase()===correct.toLowerCase();
  btn.classList.add('selected');
  document.querySelectorAll('.quiz-option-text').forEach(function(s){s.classList.remove('hidden-answer');s.textContent=s.getAttribute('data-text');});
  document.querySelectorAll('.quiz-option').forEach(function(opt){
    var a=(opt.getAttribute('data-answer')||'').trim();
    if(a.toLowerCase()===correct.toLowerCase())opt.classList.add('correct');
    else if(opt===option&&!isCorrect)opt.classList.add('wrong');
  });
  var result=document.getElementById('cardQuizResult');
  if(result){
    result.className='quiz-result '+(isCorrect?'correct-result':'wrong-result');
    result.textContent=isCorrect?'✓ Correct!':'✗ Wrong — answer: '+correct;
  }
  document.getElementById('reviewActions').style.display='flex';
  if(isCorrect){speakTTS('Correct!',null);}
}

function answerCard(quality){
  stopAllAudio();
  const card=reviewQueue[reviewIndex];
  const deck=db.decks[currentDeckId];
  const realCard=deck.cards.find(c=>c.id===card.id);
  if(realCard){
    undoStack.push({cardId:card.id,prev:JSON.parse(JSON.stringify(realCard)),index:reviewIndex,prevStreak:streak,prevXp:sessionXp,prevCorrect:sessionCorrect});
    sm2(realCard,quality);Object.assign(card,realCard);
  }
  addReviewLog({date:Date.now(),deckId:currentDeckId,cardId:card.id,quality});
  saveDeckData(currentDeckId,deck);

  sessionTotal++;
  if(quality>=2){
    streak++;sessionCorrect++;
    if(streak>bestStreak)bestStreak=streak;
    const baseXp=getXpForQuality(quality);
    const mult=getMultiplier();
    const xp=baseXp*mult;
    sessionXp+=xp;
    updateStreakUI();
    showXpFloat(xp,document.getElementById('streakXp'));
    if(streakMilestones.find(m=>m.at===streak))showStreakMilestone(streak);
  } else {
    streak=0;
    updateStreakUI();
  }

  // Save daily streak to db
  const today=new Date().toISOString().slice(0,10);
  if(!db.settings.streakDays)db.settings.streakDays={};
  db.settings.streakDays[today]=(db.settings.streakDays[today]||0)+1;
  if(!db.settings.totalXp)db.settings.totalXp=0;
  db.settings.totalXp+=getXpForQuality(quality)*getMultiplier();
  saveLocal();
  if(currentUser)userDoc().set({settings:{totalXp:db.settings.totalXp,streakDays:db.settings.streakDays,dailyGoal:db.settings.dailyGoal||20}},{merge:true}).catch(console.error);

  if(quality===0){const ri=Math.min(reviewQueue.length,reviewIndex+3+Math.floor(Math.random()*3));reviewQueue.splice(ri,0,card);}
  reviewIndex++;
  if(reviewMode==='flip')showCurrentCard();
}

function undoAnswer(){
  if(undoStack.length===0)return;
  const last=undoStack.pop();
  const deck=db.decks[currentDeckId];
  const realCard=deck.cards.find(c=>c.id===last.cardId);
  if(realCard)Object.assign(realCard,last.prev);
  reviewIndex=last.index;
  if(last.prevStreak!==undefined){streak=last.prevStreak;sessionXp=last.prevXp;sessionCorrect=last.prevCorrect;sessionTotal--;updateStreakUI();}
  saveDeckData(currentDeckId,deck);showCurrentCard();toast('Undone');
}

function updateReviewProgress(){
  const done=Math.min(reviewIndex,reviewQueue.length);
  const pct=reviewQueue.length>0?(done/reviewQueue.length*100):100;
  document.getElementById('reviewProgressFill').style.width=pct+'%';
  const rem=reviewQueue.slice(reviewIndex);
  document.getElementById('cntNew').textContent=rem.filter(c=>c.status==='new').length+' new';
  document.getElementById('cntLearn').textContent=rem.filter(c=>c.status==='learning').length+' learning';
  document.getElementById('cntDue').textContent=rem.filter(c=>c.status==='review').length+' review';
}

// ===== CUSTOM STUDY =====
let customStudyDeckId=null;
function openCustomStudyForDeck(id){customStudyDeckId=id;document.getElementById('customStudyModal').classList.add('active');}
function closeCustomStudy(){document.getElementById('customStudyModal').classList.remove('active');}
var _cfEl=document.getElementById('customFilter');
if(_cfEl)_cfEl.addEventListener('change',function(){
  document.getElementById('customTagGroup').style.display=document.getElementById('customFilter').value==='tag'?'block':'none';
});

function startCustomStudy(){
  var filter=document.getElementById('customFilter').value;
  var limit=parseInt(document.getElementById('customLimit').value)||50;
  var order=document.getElementById('customOrder').value;
  var deckId=customStudyDeckId;
  var tag='';
  if(filter==='tag') tag=document.getElementById('customTagInput').value.trim().toLowerCase();
  location.href=_basePath+deckId+'/review?mode=custom&filter='+filter+'&limit='+limit+'&order='+order+'&tag='+encodeURIComponent(tag);
}

function renderStreakWidget(){
  const s=calcStreak();const xp=db.settings.totalXp||0;
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today=new Date();const todayDay=today.getDay();
  const reviewDays=new Set();db.reviewLog.forEach(r=>reviewDays.add(new Date(r.date).toDateString()));
  let weekHTML='';
  for(let i=0;i<7;i++){
    const d=new Date(today);d.setDate(d.getDate()-(todayDay-i));
    const isActive=reviewDays.has(d.toDateString());
    const isToday=d.toDateString()===today.toDateString();
    weekHTML+='<div class="streak-day'+(isActive?' active':'')+(isToday?' today':'')+'"><span class="streak-day-name">'+dayNames[i]+'</span><div class="streak-day-dot"></div></div>';
  }
  document.getElementById('streakWidget').innerHTML=
    '<div class="streak-widget">'+
    '<div class="streak-widget-top">'+
    '<div class="streak-widget-fire">🔥</div>'+
    '<div class="streak-widget-info"><div class="streak-widget-days">'+s+' days</div><div class="streak-widget-label">'+(s>0?'Streak going — keep it up!':'Review today to start a streak!')+'</div></div>'+
    '<div class="streak-widget-xp"><div class="streak-widget-xp-val">'+xp+'</div><div class="streak-widget-xp-label">Total XP</div></div>'+
    '</div>'+
    '<div class="streak-widget-week">'+weekHTML+'</div>'+
    '</div>';
}

// ===== SETTINGS =====
function openSettings(){
  document.getElementById('dailyGoalInput').value=db.settings.dailyGoal||20;
  document.getElementById('leechThreshold').value=db.settings.leechThreshold||8;
  document.getElementById('speechRateInput').value=db.settings.speechRate||1;
  document.getElementById('speechRateLabel').textContent=(db.settings.speechRate||1)+'x';
  const vpSel=document.getElementById('voiceProviderSelect');
  const savedProvider=db.settings.voiceProvider||'edge';
  const validProviders=[...vpSel.options].map(o=>o.value);
  vpSel.value=validProviders.includes(savedProvider)?savedProvider:'edge';
  updateVoiceList();
  if(db.settings.voiceId)document.getElementById('voiceIdSelect').value=db.settings.voiceId;
  document.getElementById('randomVoiceToggle').checked=db.settings.randomVoice!==false;
  document.getElementById('voiceTestStatus').textContent='';
  if(isAdmin){document.getElementById('aiKeyGroup').style.display='block';fetchGeminiConfig().then(function(k){document.getElementById('geminiKeyInput').value=k;});}
  else{document.getElementById('aiKeyGroup').style.display='none';}
  document.getElementById('settingsModal').classList.add('active');
}
function closeSettings(){document.getElementById('settingsModal').classList.remove('active');}
function saveSettings(){
  db.settings.dailyGoal=parseInt(document.getElementById('dailyGoalInput').value)||20;
  db.settings.leechThreshold=parseInt(document.getElementById('leechThreshold').value)||8;
  db.settings.speechRate=parseFloat(document.getElementById('speechRateInput').value)||1;
  db.settings.voiceProvider=document.getElementById('voiceProviderSelect').value;
  db.settings.voiceId=document.getElementById('voiceIdSelect').value;
  db.settings.randomVoice=document.getElementById('randomVoiceToggle').checked;
  if(isAdmin){var nk=document.getElementById('geminiKeyInput').value.trim();if(nk)saveGeminiConfig(nk).then(function(){toast('AI key saved');}).catch(function(e){toast('Error: '+e.message);});}
  saveLocal();closeSettings();renderDecks();toast('Settings saved');
}

// ===== ADD CHAT =====
function openChatAddModal(){
  if(!requireAuth())return;
  document.getElementById('chatInput').value='';
  document.getElementById('chatCardName').value='';
  document.getElementById('chatYtUrl').value='';
  document.getElementById('chatYtStart').value='';
  document.getElementById('chatYtEnd').value='';
  document.getElementById('chatTags').value='';
  document.getElementById('chatAddModal').classList.add('active');
}
function closeChatAdd(){document.getElementById('chatAddModal').classList.remove('active');}
function extractTrans(text){
  var m=text.match(/\s*\(([^)]*[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ][^)]*)\)\s*$/i);
  if(m)return{text:text.slice(0,text.lastIndexOf('('+m[1]+')')).trim(),trans:'('+m[1]+')'};
  return{text:text,trans:''};
}
function parseChatLines(text){
  var lines=text.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
  var result=[];
  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    if(line.startsWith('(')){
      if(result.length>0&&!result[result.length-1].trans){result[result.length-1].trans=line;}
      continue;
    }
    var m=line.match(/^([A-Za-z0-9_]+)\s*(?:\([^)]*\))?\s*[:：]\s*(.+)$/);
    var parsed=m?{speaker:m[1],text:m[2].trim(),trans:''}:{speaker:'',text:line,trans:''};
    var ex=extractTrans(parsed.text);
    parsed.text=ex.text;
    if(ex.trans)parsed.trans=ex.trans;
    result.push(parsed);
  }
  return result;
}
function saveChatCard(){
  var text=document.getElementById('chatInput').value.trim();
  if(!text){toast('Paste a conversation first');return;}
  var parsed=parseChatLines(text);
  if(parsed.length<2){toast('Need at least 2 lines');return;}
  var cardName=document.getElementById('chatCardName').value.trim()||'Chat';
  var ytUrl=document.getElementById('chatYtUrl').value.trim();
  var ytStart=parseFloat(document.getElementById('chatYtStart').value)||null;
  var ytEnd=parseFloat(document.getElementById('chatYtEnd').value)||null;
  var tags=document.getElementById('chatTags').value.split(',').map(function(t){return t.trim();}).filter(function(t){return t;});
  var fronts=parsed.map(function(p){var o={speaker:p.speaker,text:p.text};if(p.trans)o.trans=p.trans;return o;});
  var card=newCardData();
  card.cardName=cardName;
  card.front=fronts[0].text;
  card.fronts=fronts;
  card.back='';
  card.type='basic';
  card.reviewMode='flip';
  card.displayMode='voice';
  card.youtubeUrl=ytUrl;
  card.ytStart=ytStart;
  card.ytEnd=ytEnd;
  card.tags=tags;
  var deck=db.decks[currentDeckId];
  if(!deck){toast('No deck selected');return;}
  deck.cards.push(card);
  saveDeckData(currentDeckId,deck);
  closeChatAdd();renderCardBrowser();renderDecks();
  toast('Chat card added ('+parsed.length+' lines)');
}

// ===== AI PRACTICE =====
function isVietnamese(t){return /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(t);}
function addEnglishText(text,words,sentences,idioms,backText){
  if(!text||isVietnamese(text))return;
  var hasSpace=text.indexOf(' ')>-1;
  if(hasSpace&&text.length>40)sentences.push(text);
  else if(hasSpace&&(text.toLowerCase().indexOf('idiom')>-1||(backText||'').toLowerCase().indexOf('idiom')>-1||text.split(' ').length>=3))idioms.push(text);
  else words.push(text);
}
function collectAllVocab(){
  var words=[],sentences=[],idioms=[];
  Object.values(db.decks).forEach(function(deck){
    (deck.cards||[]).forEach(function(card){
      if(!card.reps&&!card.interval)return;
      var front=(card.front||'').replace(/<[^>]*>/g,'').trim();
      var back=(card.back||'').replace(/<[^>]*>/g,'').trim();
      var name=(card.cardName||'').trim();
      addEnglishText(name||front,words,sentences,idioms,back);
      addEnglishText(back,words,sentences,idioms,'');
      if(card.fronts&&card.fronts.length>1){
        card.fronts.forEach(function(f){
          var t=typeof f==='object'?f.text:f;
          if(t)addEnglishText(t.replace(/<[^>]*>/g,'').trim(),words,sentences,idioms,'');
        });
      }
    });
  });
  return{words:[...new Set(words)],sentences:[...new Set(sentences)],idioms:[...new Set(idioms)]};
}
async function fetchGeminiConfig(){try{var doc=await firestore.collection('siteConfig').doc('ai').get();return doc.exists?doc.data().key||'':'';}catch(e){return '';}}
function saveGeminiConfig(val){return firestore.collection('siteConfig').doc('ai').set({key:val});}
function buildAIPrompt(){
  var v=collectAllVocab();
  var all=[].concat(v.words,v.idioms,v.sentences);
  for(var i=all.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=all[i];all[i]=all[j];all[j]=t;}
  var pick=all.slice(0,50);
  var p='You are an English conversation partner. Create a LONG, DETAILED natural daily conversation between 2 people (A and B) using ALL the vocabulary below.\n\n';
  p+='RULES:\n- IGNORE any Vietnamese words in the list below, only use ENGLISH words/phrases\n- Use EVERY English word/phrase at least once naturally in the conversation\n- At least 25-30 exchanges (long conversation)\n- Topics: daily life, work, school, hobbies, travel, food, relationships\n- Vietnamese translation for each line in parentheses\n- At the end, list any words NOT used\n- Intermediate English level\n- FORMAT each line as "A: text" or "B: text" — use ONLY the letters A and B as speaker labels, do NOT add names like "A (Jake)" or "B (Gina)"\n\n';
  p+='VOCABULARY ('+pick.length+' random from '+all.length+' total):\n'+pick.join(', ')+'\n\n';
  p+='Generate a long, detailed conversation now.';
  return p;
}
async function callGemini(key,prompt){
  var models=['gemini-2.5-flash','gemini-3.6-flash'];
  var body=JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.9,maxOutputTokens:8192}});
  var lastErr='';
  for(var m of models){
    try{
      var resp=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent?key='+key,{
        method:'POST',headers:{'Content-Type':'application/json'},body:body
      });
      var data=await resp.json();
      if(resp.ok&&data.candidates?.[0]?.content?.parts?.[0]?.text)return data.candidates[0].content.parts[0].text;
      lastErr=m+': '+(data.error?.message||'HTTP '+resp.status);
    }catch(e){lastErr=m+': '+e.message;}
  }
  throw new Error(lastErr||'All models failed');
}
async function generateAIConversation(){
  var key=await fetchGeminiConfig();
  if(!key){toast('Admin has not set up AI key yet. Go to Settings to add Gemini API key.');return;}
  var btn=document.getElementById('aiGenBtn');
  btn.disabled=true;btn.textContent='Generating...';
  document.getElementById('aiLoading').style.display='block';
  document.getElementById('aiResult').style.display='none';
  document.getElementById('aiError').style.display='none';
  try{
    var text=await callGemini(key,buildAIPrompt());
    document.getElementById('aiResult').textContent=text;
    document.getElementById('aiResult').style.display='block';
  }catch(e){
    document.getElementById('aiError').textContent='Error: '+e.message;
    document.getElementById('aiError').style.display='block';
  }
  document.getElementById('aiLoading').style.display='none';
  btn.disabled=false;btn.textContent='✨ Generate';
}
function openTutorial(){
  var ov=document.getElementById('tutorialOverlay');
  ov.style.display='flex';
  document.getElementById('tutorialFrame').src=_basePath+'tutorial.html';
}
function closeTutorial(){
  var ov=document.getElementById('tutorialOverlay');
  ov.style.display='none';
  document.getElementById('tutorialFrame').src='';
}

function openAIPrompt(){
  document.getElementById('aiPromptModal').classList.add('active');
  document.getElementById('aiResult').style.display='none';
  document.getElementById('aiError').style.display='none';
  document.getElementById('aiLoading').style.display='none';
}
function closeAIPrompt(){document.getElementById('aiPromptModal').classList.remove('active');}
function copyAIPromptText(){
  var p=buildAIPrompt();
  navigator.clipboard.writeText(p).then(function(){toast('Prompt copied! Paste into ChatGPT / Claude');}).catch(function(){toast('Copy failed');});
}
function copyAIResult(){
  var text=document.getElementById('aiResult').textContent;
  if(!text){toast('Nothing to copy');return;}
  navigator.clipboard.writeText(text).then(function(){toast('Copied!');}).catch(function(){toast('Copy failed');});
}

// ===== STATS =====
function calcStreak(){
  const days=new Set();db.reviewLog.forEach(r=>days.add(new Date(r.date).toDateString()));
  let streak=0;const d=new Date();while(days.has(d.toDateString())){streak++;d.setDate(d.getDate()-1);}return streak;
}

function renderStats(){
  const deckIds=Object.keys(db.decks);
  let totalCards=0,newCards=0,learningCards=0,reviewCards=0,matureCards=0,suspendedCards=0,leechCards=0;
  deckIds.forEach(id=>{getDeckCards(id).forEach(c=>{
    totalCards++;if(c.suspended)suspendedCards++;
    if(c.status==='new')newCards++;else if(c.status==='learning')learningCards++;
    else{reviewCards++;if(c.interval>=21)matureCards++;}
    if(c.leech)leechCards++;
  });});
  const todayReviews=db.reviewLog.filter(r=>new Date(r.date).toDateString()===new Date().toDateString()).length;

  document.getElementById('detailedStats').innerHTML=`
    <div class="stat-card"><div class="stat-icon">📇</div><div class="stat-value">${totalCards}</div><div class="stat-label">TOTAL</div></div>
    <div class="stat-card"><div class="stat-icon">🔥</div><div class="stat-value">${calcStreak()}</div><div class="stat-label">Streak</div></div>
    <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-value">${todayReviews}</div><div class="stat-label">Reviewed today</div></div>
    <div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-value">${matureCards}</div><div class="stat-label">Mastered</div></div>
    <div class="stat-card"><div class="stat-icon">⏸</div><div class="stat-value">${suspendedCards}</div><div class="stat-label">Suspended</div></div>
    <div class="stat-card"><div class="stat-icon">⚠️</div><div class="stat-value">${leechCards}</div><div class="stat-label">Leech</div></div>`;

  let hmHTML='<div class="heatmap">';
  for(let i=29;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toDateString();
    const count=db.reviewLog.filter(r=>new Date(r.date).toDateString()===ds).length;
    const level=count===0?0:count<=5?1:count<=15?2:count<=30?3:4;
    hmHTML+=`<div class="heatmap-day" data-count="${level}" title="${d.toLocaleDateString('en')}: ${count} reviews"></div>`;}
  document.getElementById('heatmapContainer').innerHTML=hmHTML+'</div>';

  const total=totalCards||1;
  document.getElementById('statusChart').innerHTML=`
    <div class="status-bar"><div style="width:${newCards/total*100}%;background:var(--blue)"></div><div style="width:${learningCards/total*100}%;background:var(--orange)"></div><div style="width:${(reviewCards-matureCards)/total*100}%;background:var(--green)"></div><div style="width:${matureCards/total*100}%;background:var(--primary)"></div></div>
    <div class="status-legend"><span><span class="dot" style="background:var(--blue)"></span>New: ${newCards}</span><span><span class="dot" style="background:var(--orange)"></span>Learning: ${learningCards}</span><span><span class="dot" style="background:var(--green)"></span>Review: ${reviewCards-matureCards}</span><span><span class="dot" style="background:var(--primary)"></span>Mastered: ${matureCards}</span></div>`;
}

// ===== THEME =====
const _themes=['auto','dark','ocean','rose','forest','sunset'];
const _themeIcons={'auto':'🌙','dark':'☀️','ocean':'🌊','rose':'🌸','forest':'🌲','sunset':'🌅'};
function toggleTheme(){
  const html=document.documentElement;
  const cur=localStorage.getItem('flashmind_theme')||'auto';
  const idx=_themes.indexOf(cur);
  const next=_themes[(idx+1)%_themes.length];
  if(next==='auto'){html.removeAttribute('data-theme');}
  else{html.setAttribute('data-theme',next);}
  localStorage.setItem('flashmind_theme',next);
  document.getElementById('navTheme').textContent=_themeIcons[next]||'🎨';
}
try{const _t=localStorage.getItem('flashmind_theme')||'auto';if(_t!=='auto'){document.documentElement.setAttribute('data-theme',_t);document.getElementById('navTheme').textContent=_themeIcons[_t]||'🎨';}}catch(e){}

// ===== KEYBOARD =====
document.addEventListener('keydown',e=>{
  var vr=document.getElementById('viewReview');
  if(vr&&vr.classList.contains('active')){
    if(e.target.id==='typeAnswerInput'&&e.key==='Enter'){e.preventDefault();
      const bc=document.getElementById('btnCheckAnswer'),bn=document.getElementById('btnNextCard');
      if(bc.style.display!=='none')checkTypedAnswer();else if(bn.style.display!=='none')nextAfterType();return;}
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
    if(e.code==='Space'){e.preventDefault();flipCard();}
    if(e.key==='z'&&(e.ctrlKey||e.metaKey)){e.preventDefault();undoAnswer();}
    if(document.getElementById('reviewActions').style.display==='flex'){
      if(e.key==='1')answerCard(0);if(e.key==='2')answerCard(1);if(e.key==='3')answerCard(2);if(e.key==='4')answerCard(3);
    }
  }
});

// ===== HELPERS =====
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function formatDue(ts){const diff=ts-Date.now();if(diff<=0)return'Now';const m=Math.round(diff/60000);if(m<60)return m+' min';const h=Math.round(m/60);if(h<24)return h+' hours';const d=Math.round(h/24);if(d<30)return d+' days';return Math.round(d/30)+' months';}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2500);}

function initParticles(){}
function init3DTilt(){}
function animateCountUp(){}

// ===== QUIZ =====
let quizCards=[],quizIndex=0,quizCorrect=0,quizAnswered=false;
function renderQuizSetup(){
  const sel=document.getElementById('quizDeckSelect');
  sel.innerHTML='<option value="__all">All decks</option>';
  Object.entries(db.decks).forEach(([id,d])=>{
    const cards=getAllCardsRecursive(id);
    if(cards.length>=4)sel.innerHTML+='<option value="'+id+'">'+esc(d.name)+' ('+cards.length+')</option>';
  });
  document.getElementById('quizSetup').style.display='';
  document.getElementById('quizArea').style.display='none';
}
function getAllQuizCards(){
  const deckId=document.getElementById('quizDeckSelect').value;
  let cards=[];
  if(deckId==='__all'){Object.keys(db.decks).forEach(id=>{cards=cards.concat(getDeckCards(id).map(c=>Object.assign({_deckId:id},c)));});}
  else{cards=getAllCardsRecursive(deckId).map(c=>Object.assign({_deckId:deckId},c));}
  return cards.filter(c=>c.front&&c.back);
}
function getCardGroup(card){
  const m=card.displayMode||'voice';
  if(m==='text')return 'text';
  return 'listen';
}
function startQuiz(){
  const allCards=getAllQuizCards();
  if(allCards.length<4){toast('Need at least 4 cards');return;}
  const count=Math.min(parseInt(document.getElementById('quizCount').value)||10,allCards.length);
  const groups={};
  allCards.forEach(c=>{const g=getCardGroup(c);if(!groups[g])groups[g]=[];groups[g].push(c);});
  const validGroups=Object.entries(groups).filter(([,cards])=>cards.length>=4);
  if(validGroups.length===0){toast('Need at least 4 cards in the same mode');return;}
  quizCards=[];quizIndex=0;quizCorrect=0;
  for(let i=0;i<count&&i<200;i++){
    const[gName,gCards]=validGroups[Math.floor(Math.random()*validGroups.length)];
    const shuffled=[...gCards].sort(()=>Math.random()-.5);
    const correct=shuffled[0];
    const wrongs=shuffled.slice(1,4);
    const options=[correct,...wrongs].sort(()=>Math.random()-.5);
    const correctIdx=options.indexOf(correct);
    quizCards.push({card:correct,options,correctIdx,group:gName});
  }
  document.getElementById('quizSetup').style.display='none';
  document.getElementById('quizArea').style.display='';
  document.getElementById('quizResult').style.display='none';
  showQuizQuestion();
}
function showQuizQuestion(){
  if(quizIndex>=quizCards.length){showQuizResult();return;}
  quizAnswered=false;
  const q=quizCards[quizIndex];
  const card=q.card;
  document.getElementById('quizProgress').textContent='Question '+(quizIndex+1)+' / '+quizCards.length;
  const contentEl=document.getElementById('quizQuestionContent');
  const voiceBtnEl=document.getElementById('quizVoiceBtn');
  if(q.group==='listen'){
    contentEl.innerHTML='🔊 Listen and choose the correct answer';
    voiceBtnEl.innerHTML='<button class="btn btn-primary" onclick="quizSpeak()" style="font-size:18px;padding:12px 30px">🔊 Play</button>';
    setTimeout(()=>quizSpeak(),300);
  } else {
    contentEl.textContent=card.front.replace(/<[^>]*>/g,'');
    voiceBtnEl.innerHTML='';
  }
  const optWrap=document.getElementById('quizOptions');
  optWrap.innerHTML=q.options.map((o,i)=>'<button class="quiz-option" onclick="quizAnswer('+i+')" id="quizOpt'+i+'" style="padding:14px 20px;border-radius:var(--r-md);background:var(--glass);border:1px solid var(--glass-border);color:#fff;font-size:15px;cursor:pointer;text-align:left;transition:.2s">'+esc(o.back.replace(/<[^>]*>/g,''))+'</button>').join('');
}
function quizSpeak(){
  const q=quizCards[quizIndex];
  if(q)speakText(q.card.front.replace(/<[^>]*>/g,''));
}
function quizAnswer(idx){
  if(quizAnswered)return;
  quizAnswered=true;
  const q=quizCards[quizIndex];
  const correct=q.correctIdx;
  document.getElementById('quizOpt'+correct).style.background='rgba(34,197,94,.3)';
  document.getElementById('quizOpt'+correct).style.borderColor='#22c55e';
  if(idx===correct){
    quizCorrect++;
  } else {
    document.getElementById('quizOpt'+idx).style.background='rgba(239,68,68,.3)';
    document.getElementById('quizOpt'+idx).style.borderColor='#ef4444';
  }
  setTimeout(()=>{quizIndex++;showQuizQuestion();},1200);
}
function showQuizResult(){
  document.getElementById('quizOptions').innerHTML='';
  document.getElementById('quizQuestionContent').innerHTML='';
  document.getElementById('quizVoiceBtn').innerHTML='';
  document.getElementById('quizProgress').textContent='';
  const pct=Math.round(quizCorrect/quizCards.length*100);
  document.getElementById('quizScore').textContent=quizCorrect+' / '+quizCards.length+' ('+pct+'%)';
  document.getElementById('quizSummary').textContent=pct>=80?'Excellent! Keep it up!':pct>=60?'Good job! Practice more!':'Keep studying, you can do it!';
  document.getElementById('quizResult').style.display='';
}

// ===== ADMIN =====
let isAdmin=localStorage.getItem('flashmind_admin')==='true';
function updateAdminUI(){var ap=document.getElementById('adminPushBtn');if(ap)ap.style.display=isAdmin?'block':'none';var ub=document.getElementById('btnUploadAudio');if(ub)ub.style.display=isAdmin?'inline-block':'none';var ak=document.getElementById('aiKeyGroup');if(ak)ak.style.display=isAdmin?'block':'none';}

var AUDIO_WORKER='https://flashmind-audio.yosua-4131.workers.dev';
function getAdminKey(){var k=localStorage.getItem('flashmind_admin_key');if(!k){k=prompt('Enter admin key for audio upload:');if(k)localStorage.setItem('flashmind_admin_key',k);}return k;}
function showUploadProgress(pct,name){
  var bar=document.getElementById('uploadProgressBar');
  if(!bar){
    bar=document.createElement('div');bar.id='uploadProgressBar';
    bar.style.cssText='position:fixed;top:0;left:0;width:100%;z-index:99999;background:rgba(0,0,0,0.7);padding:8px 16px;color:#fff;font-size:14px;display:flex;align-items:center;gap:10px';
    bar.innerHTML='<span id="uploadProgressText"></span><div style="flex:1;height:8px;background:#333;border-radius:4px;overflow:hidden"><div id="uploadProgressFill" style="height:100%;background:#4ade80;border-radius:4px;transition:width 0.2s"></div></div><span id="uploadProgressPct"></span>';
    document.body.appendChild(bar);
  }
  bar.style.display='flex';
  document.getElementById('uploadProgressText').textContent=name;
  document.getElementById('uploadProgressFill').style.width=pct+'%';
  document.getElementById('uploadProgressPct').textContent=Math.round(pct)+'%';
  if(pct>=100)setTimeout(function(){bar.style.display='none';},1500);
}
async function uploadAudioFile(){
  var key=getAdminKey();if(!key){toast('Admin key required');return;}
  var input=document.createElement('input');input.type='file';input.accept='audio/*,.mp3,.m4a,.wav,.ogg';
  input.onchange=function(){
    var file=input.files[0];if(!file)return;
    var name=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    var xhr=new XMLHttpRequest();
    xhr.upload.onprogress=function(e){if(e.lengthComputable)showUploadProgress(e.loaded/e.total*100,name);};
    xhr.onload=function(){
      if(xhr.status===200||xhr.status===201){
        try{var d=JSON.parse(xhr.responseText);document.getElementById('cardDriveUrl').value=d.url;showUploadProgress(100,name);toast('Uploaded!');}
        catch(e){toast('Upload error');}
      }else if(xhr.status===401){localStorage.removeItem('flashmind_admin_key');toast('Wrong admin key');showUploadProgress(0,'');}
      else{toast('Upload failed: '+xhr.status);showUploadProgress(0,'');}
    };
    xhr.onerror=function(){toast('Upload error');showUploadProgress(0,'');};
    xhr.open('PUT',AUDIO_WORKER+'/'+encodeURIComponent(name));
    xhr.setRequestHeader('Content-Type',file.type||'audio/mpeg');
    xhr.setRequestHeader('X-Admin-Key',key);
    showUploadProgress(0,name);
    xhr.send(file);
  };
  input.click();
}
function openAdminModal(){
  if(!requireAuth())return;
  toggleUserMenu();
  if(isAdmin){toast('You are already admin');updateAdminUI();return;}
  document.getElementById('adminPassInput').value='';
  document.getElementById('adminError').style.display='none';
  document.getElementById('adminModal').classList.add('active');
  setTimeout(()=>document.getElementById('adminPassInput').focus(),100);
}
function closeAdminModal(){document.getElementById('adminModal').classList.remove('active');}
function verifyAdminPass(){
  const pass=document.getElementById('adminPassInput').value;
  if(pass==='Neednottoknow0510'){
    isAdmin=true;localStorage.setItem('flashmind_admin','true');
    closeAdminModal();updateAdminUI();toast('Admin unlocked!');
  } else {
    document.getElementById('adminError').textContent='Wrong password';
    document.getElementById('adminError').style.display='block';
  }
}
async function pushDecksToAll(){
  if(!isAdmin||!currentUser){toast('Admin access required');return;}
  toggleUserMenu();
  const deckKeys=Object.keys(db.decks);
  if(deckKeys.length===0){toast('No decks to push');return;}
  if(!confirm('Push all your decks ('+deckKeys.length+') to every user?'))return;
  try{
    const batch=firestore.batch();
    const sharedRef=firestore.collection('sharedDecks');
    const existing=await sharedRef.get();
    existing.forEach(d=>batch.delete(d.ref));
    for(const[id,deck] of Object.entries(db.decks)){
      batch.set(sharedRef.doc(id),Object.assign({},deck,{sharedBy:currentUser.uid,sharedAt:Date.now()}));
    }
    await batch.commit();
    toast('Pushed '+deckKeys.length+' decks to all users!');
  }catch(e){console.error(e);toast('Push failed: '+e.message);}
}
async function loadSharedDecks(){
  try{
    const snap=await firestore.collection('sharedDecks').get();
    if(snap.empty)return;
    // Remove old shared decks from user
    const sharedIds=new Set();
    snap.forEach(d=>sharedIds.add(d.id));
    for(const id of Object.keys(db.decks)){
      if(db.decks[id]._shared&&!sharedIds.has(id)){delete db.decks[id];deleteDeckData(id);}
    }
    // Add/replace with admin's version
    let count=0;
    for(const doc of snap.docs){
      const id=doc.id;
      const data=doc.data();
      delete data.sharedBy;delete data.sharedAt;
      data._shared=true;
      db.decks[id]=data;
      saveDeckData(id,data);
      count++;
    }
    if(count>0){saveLocal();renderCurrentView();}
  }catch(e){console.error('[SharedDecks] error:',e.code,e.message);}
}
updateAdminUI();

// ===== INIT =====
loadLocal();
if(typeof pageRender==='function') pageRender();
