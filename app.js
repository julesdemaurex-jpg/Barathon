// ================================================================
// Barathon des Gobelets — app.js
// ================================================================
//
// ⚠️  CONFIGURATION À MODIFIER ABSOLUMENT
//    Va dans Supabase > Settings > API
//    Copie-colle les 2 valeurs ci-dessous :
//
//    1. Project URL   → dans SUPABASE_URL
//    2. anon/public  → dans SUPABASE_ANON_KEY
//
// ================================================================
const SUPABASE_URL = 'https://dorrbczimlxywprqrugb.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvcnJiY3ppbWx4eXdwcnFydWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NTM4NzYsImV4cCI6MjEwMDAyOTg3Nn0.P1HUloUS5iwjeFQqQv2gUBSA6aCszUGmxCbBCFKDHH0';

// ================================================================
// ÉTAT GLOBAL
// ================================================================
let supabaseClient = null;          // ← CRUCIAL : on nomme "supabaseClient"
let bars = [];                       // liste des noms de bars
let visits = {};                     // { 'Prenom': ['bar1', 'bar2'], … }
let currentUser = null;              // prénom de l'utilisateur courant
let isAdmin = false;                 // mode admin actif ?

// ================================================================
// CONNEXION SUPABASE (CRÉER LE CLIENT UNE SEULE FOIS)
// ================================================================
function initSupabase() {
    if (supabaseClient) return supabaseClient;
    // Le CDN Supabase expose une variable globale "supabase"
    // On crée notre propre client nommé supabaseClient pour éviter tout conflit
    if (typeof supabase === 'undefined') {
        console.warn('⚠ Supabase CDN non chargé — mode démo activé');
        return null;
    }
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ supabaseClient initialisé');
    return supabaseClient;
}

// ================================================================
// CHARGER LES DONNÉES DEPUIS SUPABASE
// ================================================================
async function loadData() {
    const client = initSupabase();
    if (!client) {
        loadDemoData();
        return;
    }

    // --- Bars ---
    const { data: barsData, error: barsErr } = await client
        .from('bars')
        .select('*')
        .order('name', { ascending: true });

    if (barsErr || !barsData) {
        console.error('Erreur chargement bars:', barsErr);
        loadDemoData();
        return;
    }
    bars = barsData.map(b => b.name);

    // --- Visits ---
    const { data: visitsData } = await client
        .from('visits')
        .select('*');

    visits = {};
    if (visitsData) {
        visitsData.forEach(v => {
            if (!visits[v.user_name]) visits[v.user_name] = [];
            if (!visits[v.user_name].includes(v.bar_name)) {
                visits[v.user_name].push(v.bar_name);
            }
        });
    }

    updateUI();
}

// ================================================================
// DONNÉES DE DÉMO (quand Supabase non configuré)
// ================================================================
function loadDemoData() {
    bars = [
        'Le Petit Bar',
        'Le Bar du Coin',
        'Le Zinc',
        'La Cave',
        'Le Central',
        'Le Melting Potes'
    ];
    visits = {
        'Alice': ['Le Petit Bar', 'Le Bar du Coin'],
        'Bob':   ['Le Zinc', 'La Cave', 'Le Central'],
        'Clara': ['Le Zinc']
    };
    console.log('📦 Mode démo actif — configure Supabase pour les données réelles');
    updateUI();
}

// ================================================================
// TEMPS RÉEL — mise à jour auto via Supabase Realtime
// ================================================================
function setupRealtime() {
    const client = supabaseClient;
    if (!client) return;

    client
        .channel('barathon_realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'bars'
        }, () => loadData())
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'visits'
        }, () => loadData())
        .subscribe(status => {
            if (status === 'SUBSCRIBED') console.log('🔔 Realtime actif');
        });
}

// ================================================================
// INITIALISATION AU CHARGEMENT DE LA PAGE
// ================================================================
async function init() {
    console.log('🚀 Barathon en cours de chargement…');
    await loadData();
    setupRealtime();
    setupNavigation();
    setupEventListeners();

    // Rétablir le prénom sauvegardé
    const savedName = localStorage.getItem('barathon_username');
    if (savedName) {
        currentUser = savedName;
        document.getElementById('nameModal').classList.add('hidden');
        updateUserDisplay();
    } else {
        document.getElementById('nameModal').classList.remove('hidden');
        document.getElementById('userName').focus();
    }
    updateUI();
}

// ================================================================
// MODAL DU PRÉNOM
// ================================================================
function closeNameModal(name) {
    name = (name || '').trim();
    if (!name) {
        showToast('Entre un prénom pour continuer', 'error');
        return;
    }
    if (name.length < 2) {
        showToast('Le prénom doit faire au moins 2 caractères', 'error');
        return;
    }
    currentUser = name;
    localStorage.setItem('barathon_username', currentUser);
    document.getElementById('nameModal').classList.add('hidden');
    updateUserDisplay();
    showToast(`Bienvenue ${currentUser} ! 🍻`);
    updateUI();
}

function resetUser() {
    if (!confirm('Changer de prénom ?')) return;
    localStorage.removeItem('barathon_username');
    currentUser = null;
    document.getElementById('nameModal').classList.remove('hidden');
    document.getElementById('userName').value = '';
    document.getElementById('userName').focus();
    updateUserDisplay();
    updateUI();
}

function updateUserDisplay() {
    const el = document.getElementById('currentUser');
    if (el) el.textContent = currentUser ? `👤 ${currentUser}` : '';
}

// ================================================================
// COCHER / DÉCOCHER UN BAR
// ================================================================
async function toggleBar(barName) {
    if (!currentUser) {
        showToast('Entre ton prénom d\'abord !', 'info');
        document.getElementById('nameModal').classList.remove('hidden');
        document.getElementById('userName').focus();
        return;
    }

    const client = supabaseClient;
    if (!client) {
        // Mode démo : modification locale
        if (!visits[currentUser]) visits[currentUser] = [];
        const idx = visits[currentUser].indexOf(barName);
        if (idx > -1) {
            visits[currentUser].splice(idx, 1);
            showToast(`${barName} decoche`);
        } else {
            visits[currentUser].push(barName);
            showToast(`${barName} coche ✅`);
        }
        updateUI();
        return;
    }

    // Vérifier si déjà visité
    const { data: existing } = await client
        .from('visits')
        .select('*')
        .eq('user_name', currentUser)
        .eq('bar_name', barName);

    if (existing && existing.length > 0) {
        // Décocher — supprimer la visite
        await client
            .from('visits')
            .delete()
            .eq('user_name', currentUser)
            .eq('bar_name', barName);
        showToast(`${barName} decoche`);
    } else {
        // Cocher — ajouter la visite
        await client
            .from('visits')
            .insert({ user_name: currentUser, bar_name: barName });
        showToast(`${barName} coche ✅`);
    }

    await loadData();
}

// ================================================================
// ADMIN : CONNEXION
// ================================================================
async function adminLogin() {
    const pw = document.getElementById('adminPassword').value;
    if (!pw) {
        showToast('Entre le mot de passe', 'error');
        return;
    }

    const client = supabaseClient;
    if (!client) {
        // Mode démo : mot de passe codé en dur
        if (pw === 'barathon2024') {
            isAdmin = true;
            document.getElementById('adminLogin').classList.add('hidden');
            document.getElementById('adminPanel').classList.remove('hidden');
            showToast('Connecté en mode admin ✅');
            await loadAdminPanel();
        } else {
            showToast('Mot de passe incorrect', 'error');
        }
        return;
    }

    // Mode production : lire le mot de passe dans la config
    const { data: cfg } = await client
        .from('admin_config')
        .select('password')
        .limit(1);

    if (cfg && cfg.length > 0 && cfg[0].password === pw) {
        isAdmin = true;
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');
        showToast('Connecté en mode admin ✅');
        await loadAdminPanel();
    } else {
        showToast('Mot de passe incorrect', 'error');
    }
}

function logoutAdmin() {
    isAdmin = false;
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('adminLogin').classList.remove('hidden');
    document.getElementById('adminPassword').value = '';
    showToast('Déconnecté 🔒');
}

// ================================================================
// ADMIN : CHARGER LE PANEL
// ================================================================
async function loadAdminPanel() {
    const client = supabaseClient;
    const usersListEl = document.getElementById('usersList');
    const deleteSelect = document.getElementById('deleteBarSelect');

    if (!usersListEl || !deleteSelect) return;

    // --- Utilisateurs ---
    let users = [];
    if (client) {
        const { data } = await client.from('visits').select('user_name');
        if (data) {
            const seen = new Set();
            data.forEach(v => seen.add(v.user_name));
            users = [...seen].sort();
        }
    } else {
        users = Object.keys(visits).sort();
    }

    if (users.length === 0) {
        usersListEl.innerHTML = '<p class="empty">Aucun utilisateur pour le moment</p>';
    } else {
        usersListEl.innerHTML = users.map(u => `
            <div class="user-row">
                <span>👤 ${u}</span>
                <button class="btn-danger btn-sm" onclick="deleteUser('${u}')">Supprimer</button>
            </div>
        `).join('');
    }

    // --- Select de suppression de bar ---
    if (bars.length === 0) {
        deleteSelect.innerHTML = '<option value="">Aucun bar</option>';
    } else {
        deleteSelect.innerHTML = '<option value="">Choisir un bar…</option>' +
            bars.map(b => `<option value="${b}">${b}</option>`).join('');
    }
}

// ================================================================
// ADMIN : AJOUTER UN BAR
// ================================================================
async function addBar() {
    const nameInput = document.getElementById('newBarName');
    if (!nameInput) return;
    const name = (nameInput.value || '').trim();

    if (!name) {
        showToast('Donne un nom au bar', 'error');
        return;
    }
    if (bars.includes(name)) {
        showToast('Ce bar existe déjà', 'error');
        return;
    }

    const client = supabaseClient;
    if (!client) {
        bars.push(name);
        bars.sort();
        nameInput.value = '';
        updateUI();
        showToast(`${name} ajoute ✅`);
        return;
    }

    const { error } = await client
        .from('bars')
        .insert({ name });

    if (error) {
        console.error(error);
        showToast('Erreur lors de l\'ajout', 'error');
    } else {
        nameInput.value = '';
        await loadData();
        showToast(`${name} ajoute ✅`);
    }
}

// ================================================================
// ADMIN : SUPPRIMER UN BAR
// ================================================================
async function deleteBar() {
    const select = document.getElementById('deleteBarSelect');
    if (!select) return;
    const name = select.value;

    if (!name) {
        showToast('Choisis un bar a supprimer', 'error');
        return;
    }
    if (!confirm(`Supprimer "${name}" ?`)) return;

    const client = supabaseClient;
    if (!client) {
        bars = bars.filter(b => b !== name);
        select.value = '';
        updateUI();
        showToast(`${name} supprime 🗑️`);
        return;
    }

    // Supprimer le bar ET toutes ses visites
    await client.from('visits').delete().eq('bar_name', name);
    const { error } = await client.from('bars').delete().eq('name', name);

    if (error) {
        console.error(error);
        showToast('Erreur lors de la suppression', 'error');
    } else {
        select.value = '';
        await loadData();
        showToast(`${name} supprime 🗑️`);
    }
}

// ================================================================
// ADMIN : SUPPRIMER UN UTILISATEUR
// ================================================================
async function deleteUser(userName) {
    if (!confirm(`Supprimer "${userName}" et toutes ses visites ?`)) return;

    const client = supabaseClient;
    if (!client) {
        delete visits[userName];
        await loadAdminPanel();
        updateUI();
        showToast(`${userName} supprime 🗑️`);
        return;
    }

    await client.from('visits').delete().eq('user_name', userName);

    if (client) {
        // Supprimer aussi de la config users si besoin
    }

    await loadData();
    await loadAdminPanel();
    showToast(`${userName} supprime 🗑️`);
}

// ================================================================
// ADMIN : CHANGER LE MOT DE PASSE
// ================================================================
async function changePassword() {
    const input = document.getElementById('newPassword');
    if (!input) return;
    const newPw = (input.value || '').trim();

    if (!newPw || newPw.length < 4) {
        showToast('Le mot de passe doit faire au moins 4 caractères', 'error');
        return;
    }

    const client = supabaseClient;
    if (!client) {
        showToast('Fonction non disponible en mode démo', 'error');
        return;
    }

    // Met à jour ou insère le mot de passe dans admin_config
    const { error } = await client
        .from('admin_config')
        .upsert({ id: 1, password: newPw });

    if (error) {
        console.error(error);
        showToast('Erreur lors du changement', 'error');
    } else {
        input.value = '';
        showToast('Mot de passe modifié ✅');
    }
}

// ================================================================
// MISE À JOUR DE L'INTERFACE
// ================================================================
function updateUI() {
    updateChecklist();
    updateProgress();
    updateOverview();
    if (isAdmin) loadAdminPanel();
}

function updateChecklist() {
    const container = document.getElementById('checklist');
    if (!container) return;

    if (bars.length === 0) {
        container.innerHTML = '<p class="empty">Aucun bar — l\'admin doit en ajouter</p>';
        return;
    }

    container.innerHTML = bars.map(barName => {
        const visited = currentUser && visits[currentUser] && visits[currentUser].includes(barName);
        const checkmark = visited ? '✅' : '⬜';
        return `
            <div class="bar-item ${visited ? 'checked' : ''}"
                 onclick="toggleBar('${barName.replace(/'/g, "\\'")}')">
                <div class="bar-item-inner">
                    <span class="bar-name">${barName}</span>
                    <span class="bar-check">${checkmark}</span>
                </div>
            </div>
        `;
    }).join('');
}

function updateProgress() {
    const countEl = document.getElementById('progressCount');
    const barEl   = document.getElementById('progressBar');
    const pctEl   = document.getElementById('progressPercent');

    if (!countEl || !barEl || !pctEl) return;

    const total = bars.length;
    const done  = (currentUser && visits[currentUser]) ? visits[currentUser].length : 0;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

    countEl.textContent = `${done} / ${total}`;
    barEl.style.width = `${pct}%`;
    pctEl.textContent = `${pct}%`;
}

function updateOverview() {
    const container = document.getElementById('overview');
    if (!container) return;

    const allUsers = Object.keys(visits);
    if (allUsers.length === 0) {
        container.innerHTML = '<p class="empty">Aucun participant pour le moment — sois le premier !</p>';
        return;
    }

    // Classer par nombre de bars visités (desc)
    allUsers.sort((a, b) => (visits[b] || []).length - (visits[a] || []).length);

    const medals = ['🥇', '🥈', '🥉'];

    container.innerHTML = allUsers.map((user, i) => {
        const visited = visits[user] || [];
        const rank = medals[i] || `#${i + 1}`;
        return `
            <div class="participant-card">
                <div class="participant-rank">${rank}</div>
                <div>
                    <div class="participant-name">👤 ${user}</div>
                    <div class="participant-bars">${visited.length} bar${visited.length !== 1 ? 's' : ''} visités</div>
                    <div class="participant-tags">${visited.join(', ') || 'aucun bar'}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// NAVIGATION
// ================================================================
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Onglet actif
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Vue active
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            const viewId = btn.dataset.view + '-view';
            const viewEl = document.getElementById(viewId);
            if (viewEl) viewEl.classList.add('active');
        });
    });
}

// ================================================================
// TOAST (notifications)
// ================================================================
let toastTimer = null;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ================================================================
// TOUS LES ÉVÉNEMENTS DOM
// ================================================================
function setupEventListeners() {
    // Lancer l'app
    init();

    // Modal prénom
    document.getElementById('startBtn')?.addEventListener('click', () => {
        const name = document.getElementById('userName').value;
        closeNameModal(name);
    });

    document.getElementById('userName')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const name = document.getElementById('userName').value;
            closeNameModal(name);
        }
    });

    // Reset prénom
    document.getElementById('resetBtn')?.addEventListener('click', resetUser);

    // Admin : login
    document.getElementById('adminLoginBtn')?.addEventListener('click', adminLogin);
    document.getElementById('adminPassword')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') adminLogin();
    });

    // Admin : ajout bar
    document.getElementById('addBarBtn')?.addEventListener('click', addBar);
    document.getElementById('newBarName')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addBar();
    });

    // Admin : suppression bar
    document.getElementById('deleteBarBtn')?.addEventListener('click', deleteBar);

    // Admin : changement mot de passe
    document.getElementById('changePasswordBtn')?.addEventListener('click', changePassword);

    // Admin : déconnexion
    document.getElementById('logoutBtn')?.addEventListener('click', logoutAdmin);
}

// ================================================================
// LANCEMENT
// ================================================================
document.addEventListener('DOMContentLoaded', setupEventListeners);
