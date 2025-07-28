// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- DOM Elements ---
const outputArea = document.getElementById('output-area');
const commandInput = document.getElementById('command-input');
const promptEl = document.getElementById('prompt');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');

// --- State ---
let currentUser = 'guest';
let db;
let auth;
let postsCache = []; 
let postsFetched = false;

// --- Static Content ---
const aboutContent = `<h1>About Dotoki's Blog</h1><div class="post-body"><p>Hi there! I am a web developer passionate about creating unique and innovative experiences.</p><p>You can find me on the Github <span class="link" onclick="window.handleCommand('open github')">Dotoki2k</span>.</p></div>`;

// --- Firebase Initialization ---
async function initFirebase() {
    try {
        const app = initializeApp(window.firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        await signInAnonymously(auth);
    } catch (error) {
        if (!error.includes('FirebaseError: Firebase: Error (auth/admin-restricted-operation)')){
            console.error("Firebase initialization failed:", error);
            appendOutput("Lỗi: Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại thông tin cấu hình đã dán.", true);
        }
    }
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', async () => {
    updatePrompt();
    showInitialScreen();
    commandInput.focus();
    await initFirebase();
});

// --- Event Listeners ---
commandInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const command = commandInput.value.trim();
        handleCommand(command);
        commandInput.value = '';
    }
});

searchButton.addEventListener('click', () => triggerSearch());
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') triggerSearch();
});

document.querySelectorAll('.cmd-button').forEach(button => {
    button.addEventListener('click', () => {
        const command = button.dataset.command;
        handleCommand(command);
    });
});

document.body.addEventListener('click', (e) => {
    if (e.target.closest('.cmd-button') || e.target.closest('#search-bar') || e.target.closest('.link') || e.target.closest('.ls-line') || e.target.closest('input')) {
        return;
    }
    if (e.target.closest('#terminal-window')) {
        commandInput.focus();
    }
});

// --- Search Trigger ---
function triggerSearch() {
    const keyword = searchInput.value.trim();
    if (keyword) {
        handleCommand(`search ${keyword}`);
        searchInput.value = '';
    }
}

window.handleCommand = handleCommand;

// --- Core Functions ---
async function handleCommand(command) {
    if (command === '') return;

    const lowerCmd = command.toLowerCase();
    if (lowerCmd === 'clear') {
        resetTerminal();
        return;
    }

    clearScreen();
    echoCommand(command);
    
    const [cmd, ...args] = command.split(' ');
    switch (cmd.toLowerCase()) {
        case 'help': showHelp(); break;
        case 'ls': 
            postsFetched = false;
            await listPosts(); 
            break;
        case 'cat': await readPost(args[0]); break;
        case 'search': await searchPosts(args.join(' ')); break;
        case 'about': appendOutput(aboutContent, true); break;
        case 'login': login(args[0]); break;
        case 'logout': logout(); break;
        case 'open': if (args[0] === 'github') { appendOutput("Opening GitHub profile..."); window.open('https://github.com/dotoki2k', '_blank'); } break;
        default: showError(command); break;
    }
    scrollToBottom();
}

function appendOutput(content, isHTML = false) {
    const line = document.createElement('div');
    if (isHTML) {
        line.innerHTML = content;
    } else {
        line.className = 'output-line';
        line.textContent = content;
    }
    outputArea.appendChild(line);
}

function echoCommand(command) {
    const echoLine = document.createElement('div');
    echoLine.className = 'command-echo';
    echoLine.innerHTML = `<span class="prompt">${promptEl.textContent}</span><span class="command-text">${escapeHtml(command)}</span>`;
    outputArea.appendChild(echoLine);
}

// --- Command Implementations (Multi-post) ---

async function fetchPostsFromFirebase() {
    if (postsFetched) return postsCache;
    if (!db) {
        appendOutput("Lỗi: Cơ sở dữ liệu chưa sẵn sàng.", true);
        return [];
    }
    try {
        const postsCollection = collection(db, 'posts');
        const postSnapshot = await getDocs(postsCollection);
        postsCache = postSnapshot.docs.map(doc => ({ slug: doc.id, ...doc.data() }));
        postsFetched = true;
        if (postsCache.length === 0) {
            appendOutput("Không tìm thấy bài viết nào. Hãy chắc chắn bạn đã tạo collection 'posts' và thêm các document vào đó.", true);
        }
        return postsCache;
    } catch (error) {
        console.error("Error fetching posts:", error);
        appendOutput(`<span class="error">Lỗi khi tải bài viết: ${error.message}</span>`, true);
        return [];
    }
}

function showHelp() {
    const commands = [
        { cmd: "  'help'", desc: "- Hiển thị thông báo này." },
        { cmd: "  'ls'", desc: "- Liệt kê tất cả các bài viết." },
        { cmd: "  'cat <slug>'", desc: "- Đọc một bài viết cụ thể." },
        { cmd: "  'search <keyword>'", desc: "- Tìm kiếm bài viết." },
        { cmd: "  'about'", desc: "- Hiển thị thông tin về tác giả." },
        { cmd: "  'login <username>'", desc: "- Đăng nhập với tên người dùng." },
        { cmd: "  'logout'", desc: "- Đăng xuất." },
        { cmd: "  'clear'", desc: "- Khôi phục màn hình ban đầu." }
    ];

    appendOutput("Available commands:");
    commands.forEach(item => {
        const helpLine = `
            <div class="help-line">
                <span class="help-command">${escapeHtml(item.cmd)}</span>
                <span class="help-description">${escapeHtml(item.desc)}</span>
            </div>
        `;
        appendOutput(helpLine, true);
    });
}

async function listPosts(postList = null) {
    const postsToDisplay = postList || await fetchPostsFromFirebase();
    if (postsToDisplay.length === 0) {
        return;
    }
    
    const header = `
        <div class="ls-line header">
            <span class="ls-slug">SLUG</span>
            <span class="ls-title">TITLE</span>
            <span class="ls-tags">TAGS</span>
            <span class="ls-author">AUTHOR</span>
        </div>
    `;
    appendOutput(header, true);

    postsToDisplay.forEach(post => {
        const tagsString = Array.isArray(post.tags) ? post.tags.map(t => `#${t}`).join(' ') : '';
        const postLine = `
            <div class="ls-line" onclick="window.handleCommand('cat ${post.slug}')" title="Click to read 'cat ${post.slug}'">
                <span class="ls-slug">${escapeHtml(post.slug)}</span>
                <span class="ls-title">${escapeHtml(post.title || 'Untitled')}</span>
                <span class="ls-tags">${escapeHtml(tagsString)}</span>
                <span class="ls-author">${escapeHtml(post.author || 'N/A')}</span>
            </div>
        `;
        appendOutput(postLine, true);
    });
}

async function readPost(slug) {
    if (!slug) { appendOutput("Usage: cat <slug>. Use 'ls' to see available post slugs.", true); return; }
    if (!db) { appendOutput("Lỗi: Cơ sở dữ liệu chưa sẵn sàng.", true); return; }
    try {
        const postRef = doc(db, 'posts', slug);
        const docSnap = await getDoc(postRef);

        if (docSnap.exists()) {
            const post = docSnap.data();
            const tagsHtml = Array.isArray(post.tags) ? post.tags.map(tag => `<span class="tag">#${tag}</span>`).join('') : '';
            let postHTML = `<h1>${post.title || 'Untitled'}</h1>`;
            postHTML += `<div class="post-details">By: ${post.author || 'N/A'} | Date: ${post.date || 'N/A'} | Views: ${post.views || 0}</div>`;
            postHTML += `<div class="post-tags">${tagsHtml}</div>`;
            const bodyHtml = marked.parse(post.body || "");
            postHTML += `<div class="post-body">${bodyHtml}</div>`;
            appendOutput(postHTML, true);
        } else {
            appendOutput(`<span class="error">bash: cat: ${slug}: No such file or directory</span>`, true);
        }
    } catch (error) {
        console.error("Error reading post:", error);
        appendOutput(`<span class="error">Lỗi khi đọc bài viết: ${error.message}</span>`, true);
    }
}

async function searchPosts(keyword) {
    if (!keyword || keyword.trim() === '') {
        appendOutput("Usage: search <keyword>", true);
        return;
    }
    const postList = await fetchPostsFromFirebase();
    const lowerKeyword = keyword.toLowerCase();
    const results = postList.filter(post => 
        (post.title || '').toLowerCase().includes(lowerKeyword) ||
        (post.body || '').toLowerCase().includes(lowerKeyword) ||
        (post.author || '').toLowerCase().includes(lowerKeyword) ||
        (Array.isArray(post.tags) && post.tags.some(tag => tag.toLowerCase().includes(lowerKeyword)))
    );
    
    appendOutput(`Found ${results.length} post(s) for '${keyword}':`);
    if (results.length > 0) {
        listPosts(results);
    }
}

function login(username) {
    if (!username) { appendOutput("Usage: login <username>", true); return; }
    if (currentUser !== 'guest') { appendOutput(`Already logged in as ${currentUser}. Please 'logout' first.`, true); return; }
    currentUser = username;
    updatePrompt();
    appendOutput(`Welcome, ${currentUser}!`, true);
}

function logout() {
    if (currentUser === 'guest') { appendOutput("Not logged in.", true); return; }
    appendOutput(`Goodbye, ${currentUser}!`, true);
    currentUser = 'guest';
    updatePrompt();
}

function clearScreen() { outputArea.innerHTML = ''; }
function showError(command) { appendOutput(`<span class="error">bash: command not found: ${escapeHtml(command)}</span>`, true); }

// --- Utility Functions ---
function updatePrompt() { promptEl.textContent = `${currentUser}@blog:~$`; }
function scrollToBottom() { outputArea.scrollTop = outputArea.scrollHeight; }
function escapeHtml(unsafe) { return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

function showInitialScreen() {
    const welcomeMessage = [
        `Last login: ${new Date().toUTCString()}`,
        "Welcome to My Awesome Blog!",
        "------------------------------------",
        "Type 'help' to see a list of available commands or use the buttons above."
    ];
    welcomeMessage.forEach(line => appendOutput(line));
}

function resetTerminal() {
    clearScreen();
    showInitialScreen();
}
