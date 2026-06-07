// CONFIGURATION 
const API_URL = "https://pratik-event-api.onrender.com";

let currentEventId = null;
let currentEventData = { my_events: [], other_events: [] };

// Infinite Scroll State
let currentOffset = 0;      
let isFetching = false;     
let hasMorePhotos = true;   
const FETCH_LIMIT = 15;     
let scrollObserver = null;  

// DOM ELEMENTS

const navSearch = document.getElementById('navSearch');
const navNotification = document.getElementById('navNotification');
const navAdmin = document.getElementById('navAdmin');
const searchView = document.getElementById('searchView');
const globalSearchBtn = document.getElementById('globalSearchBtn');
const globalSearchInput = document.getElementById('globalSearchInput');
const globalSearchResults = document.getElementById('globalSearchResults');
const navEvents = document.getElementById('navEvents');
const navProfile = document.getElementById('navProfile');
const profileView = document.getElementById('profileView');
const dashboardView = document.getElementById('dashboardView');
const folderView = document.getElementById('folderView');
const backToDashBtn = document.getElementById('backToDashBtn');
const foldersContainer = document.getElementById('foldersContainer');
const currentFolderName = document.getElementById('currentFolderName');
const createEventBtn = document.getElementById('createEventBtn');
const newEventNameInput = document.getElementById('newEventName');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const galleryContainer = document.getElementById('galleryContainer');
const logoutBtn = document.getElementById('logoutBtn');
const saveLinkBtn = document.getElementById('saveLinkBtn');
const linkInput = document.getElementById('linkInput');
const eventSortSelect = document.getElementById('eventSortSelect');

// AUTHENTICATION & NAVIGATION

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('eventhub_token');
        localStorage.removeItem('eventhub_username');
        window.location.href = 'login.html';
    });
}

function hideAllScreens() {
    dashboardView.style.display = "none";
    folderView.style.display = "none";
    profileView.style.display = "none";
}

navEvents.addEventListener('click', (e) => {
    e.preventDefault(); 
    currentEventId = null;
    hideAllScreens();
    dashboardView.style.display = "block";
    
    document.getElementById('globalSearchInput').value = "";
    document.getElementById('globalSearchResults').innerHTML = "";
    loadFolders(); 
});

navSearch.addEventListener('click', (e) => {
    e.preventDefault();
    hideAllScreens();
    dashboardView.style.display = "block"; 
    document.getElementById('globalSearchInput').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

backToDashBtn.addEventListener('click', () => {
    currentEventId = null;
    hideAllScreens();
    dashboardView.style.display = "block";
    document.getElementById('globalSearchResults').innerHTML = "";
});

navAdmin.addEventListener('click', () => navProfile.click());

// PROFILE MANAGEMENT

async function loadNavbarProfile() {
    const token = localStorage.getItem('eventhub_token');
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/users/me/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const stats = await response.json();
            const navUserName = document.getElementById('navUserName');
            if (navUserName) navUserName.innerText = stats.name;
            
            const avatarImg = stats.profile_picture_url || `https://ui-avatars.com/api/?name=${stats.name}&background=random&color=fff`;
            const navUserAvatar = document.getElementById('navUserAvatar');
            if (navUserAvatar) navUserAvatar.src = avatarImg;
        }
    } catch (error) {
        console.error("Failed to load user for navbar:", error);
    }
}

navProfile.addEventListener('click', async (e) => {
    e.preventDefault();
    if (profileView.style.display === "block") {
        navEvents.click(); 
        return; 
    }
    hideAllScreens();
    profileView.style.display = "block";

    const token = localStorage.getItem('eventhub_token'); 

    try {
        const response = await fetch(`${API_URL}/users/me/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const stats = await response.json();
            document.getElementById('statRole').innerText = stats.role;
            document.getElementById('statEmail').innerText = stats.email;
            document.getElementById('statEvents').innerText = stats.events_count;
            document.getElementById('statPhotos').innerText = stats.photos_count;
            document.getElementById('statLikes').innerText = stats.likes_count;

            const avatarImg = stats.profile_picture_url || `https://ui-avatars.com/api/?name=${stats.name}&background=random&color=fff&size=120`;
            const dashboardAvatar = document.getElementById('profileDashboardAvatar');
            if (dashboardAvatar) dashboardAvatar.src = avatarImg;
        }
    } catch (error) {
        console.error("Failed to load profile stats:", error);
    }
});

const profilePicWrapper = document.getElementById('profilePicWrapper');
const profilePicUpload = document.getElementById('profilePicUpload');

if (profilePicWrapper) {
    profilePicWrapper.addEventListener('click', () => profilePicUpload.click());

    profilePicUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const token = localStorage.getItem('eventhub_token');
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch(`${API_URL}/users/me/profile-picture`, {
                method: "POST",
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                document.getElementById('profileDashboardAvatar').src = data.url;
                document.getElementById('navUserAvatar').src = data.url;
            } else {
                alert("Failed to upload profile picture.");
            }
        } catch (error) {
            console.error("Profile upload error:", error);
        }
    });
}

// WEBSOCKET NOTIFICATION ENGINE

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = API_URL.replace(/^https?:\/\//, ''); 
const socket = new WebSocket(`${wsProtocol}//${wsHost}/ws/notifications`);

let latestAlertMessage = "Someone uploaded new media!"; 

socket.onmessage = function(event) {
    latestAlertMessage = event.data; 

    const badge = document.getElementById('notificationBadge');
    if (badge) badge.style.display = 'block';

    const bell = document.getElementById('navNotification');
    if (bell) {
        bell.classList.add('fa-shake');
        setTimeout(() => bell.classList.remove('fa-shake'), 1000);
    }
};

document.getElementById('navNotification').addEventListener('click', () => {
    const badge = document.getElementById('notificationBadge');
    
    if (badge.style.display === 'block') {
        alert("🔔 " + latestAlertMessage); 
        badge.style.display = 'none';
    } else {
        alert("🔔 You have no new notifications.");
    }
});

// EVENT MANAGEMENT

function buildEventCard(event, container, isMine) {
    const folderCard = document.createElement('div');
    folderCard.className = 'event-card'; 
    folderCard.style.position = "relative"; 
    
    const tagColor = isMine ? "var(--primary-accent)" : "#00f2fe";
    const tagBg = isMine ? "rgba(168, 117, 255, 0.15)" : "rgba(0, 242, 254, 0.15)";
    const ownerText = isMine ? "Me" : "Club Member";
    
    const deleteBtnHTML = isMine 
        ? `<div class="delete-folder-btn" style="position: absolute; top: 10px; right: 10px; background: rgba(255, 71, 87, 0.2); color: #ff4757; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; z-index: 10;" title="Delete Event">
               <i class="fa-solid fa-trash"></i>
           </div>` 
        : '';

    folderCard.innerHTML = `
        ${deleteBtnHTML}
        <div class="card-top">
            <span style="font-size: 40px;">🎉</span>
        </div>
        <div class="card-bottom">
            <h3 class="card-title">${event.title}</h3>
            <span class="card-tag" style="color: ${tagColor}; background: ${tagBg};">${event.category || "General"}</span>
            <p class="card-desc">${event.description || "A collection of memories."}</p>
            <div class="card-meta">
                <span style="color: ${tagColor}; font-weight: bold;"><i class="fa-solid fa-location-dot"></i> ${event.location || "Campus"}</span>
                <span>by ${ownerText}</span>
            </div>
        </div>
    `;
    
    if (isMine) {
        const trashBtn = folderCard.querySelector('.delete-folder-btn');
        
        trashBtn.onmouseover = () => { trashBtn.style.background = "#ff4757"; trashBtn.style.color = "white"; };
        trashBtn.onmouseout = () => { trashBtn.style.background = "rgba(255, 71, 87, 0.2)"; trashBtn.style.color = "#ff4757"; };

        trashBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); 
            
            const confirmDel = confirm(`Are you sure you want to permanently delete "${event.title}" and ALL photos inside it?`);
            if (!confirmDel) return;

            const token = localStorage.getItem('eventhub_token');
            try {
                trashBtn.innerHTML = "⏳";
                const response = await fetch(`${API_URL}/events/${event.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    folderCard.remove(); 
                } else {
                    alert("Failed to delete event.");
                    trashBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    folderCard.addEventListener('click', () => openFolder(event.id, event.title));
    container.appendChild(folderCard);
}

function renderSortedEvents() {
    const sortValue = eventSortSelect ? eventSortSelect.value : 'date_new';

    const sortLogic = (a, b) => {
        if (sortValue === 'name_asc') return a.title.localeCompare(b.title);
        if (sortValue === 'name_desc') return b.title.localeCompare(a.title);
        if (sortValue === 'date_new') return new Date(b.created_at || Date.now()) - new Date(a.created_at || Date.now());
        if (sortValue === 'date_old') return new Date(a.created_at || Date.now()) - new Date(b.created_at || Date.now());
    };

    const sortedMyEvents = [...currentEventData.my_events].sort(sortLogic);
    const sortedOtherEvents = [...currentEventData.other_events].sort(sortLogic);

    const myContainer = document.getElementById('myFoldersContainer');
    const otherContainer = document.getElementById('otherFoldersContainer');
    myContainer.innerHTML = "";
    otherContainer.innerHTML = "";

    sortedMyEvents.forEach(event => buildEventCard(event, myContainer, true));
    sortedOtherEvents.forEach(event => buildEventCard(event, otherContainer, false));
}

if (eventSortSelect) {
    eventSortSelect.addEventListener('change', renderSortedEvents);
}

async function loadFolders() {
    const token = localStorage.getItem('eventhub_token'); 
    try {
        const response = await fetch(`${API_URL}/events/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error("Failed to authenticate");
        
        const data = await response.json(); 
        currentEventData = data; 
        renderSortedEvents();

    } catch (error) {
        console.error("Failed to load folders:", error);
    }
}

createEventBtn.addEventListener('click', async () => {
    const title = document.getElementById('newEventName').value.trim();
    const location = document.getElementById('newEventLocation').value.trim(); 
    const date = document.getElementById('newEventDate').value;
    const category = document.getElementById('newEventCategory').value;
    const isPrivateToggle = document.getElementById('eventIsPrivate');
    const isPrivateChecked = isPrivateToggle ? isPrivateToggle.checked : false;

    if (!title) return alert("Please enter an event name!");
    if (!location) return alert("Please enter a location!");
    if (!date) return alert("Please select a date from the calendar!");

    const token = localStorage.getItem('eventhub_token'); 

    try {
        createEventBtn.innerText = "Creating...";
        const response = await fetch(`${API_URL}/events/`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ 
                title: title, 
                description: "Created from Dashboard", 
                date: date,           
                category: category,
                location: location,
                is_private: isPrivateChecked 
            })
        });

        if (response.ok) {
            document.getElementById('newEventName').value = "";
            document.getElementById('newEventLocation').value = "";
            document.getElementById('newEventDate').value = "";
            if (isPrivateToggle) isPrivateToggle.checked = false;
            loadFolders(); 
        } else {
            console.error("Server rejected the request.");
            alert("Failed to create event. Did you miss a required field?");
        }
    } catch (error) {
        alert("Failed to create event. Check your backend connection.");
    } finally {
        createEventBtn.innerText = "+ Create";
    }
});

// MEDIA RENDERING & INTERSECTION OBSERVER

async function openFolder(eventId, eventTitle) {
    currentEventId = eventId; 
    currentFolderName.innerText = eventTitle;
    
    hideAllScreens();
    folderView.style.display = "block";
    galleryContainer.innerHTML = ""; 
    
    currentOffset = 0;
    hasMorePhotos = true;
    isFetching = false;

    const triggerEl = document.getElementById('scrollTrigger');
    if (triggerEl) {
        triggerEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i><p style="margin: 0; font-weight: bold; letter-spacing: 1px; font-size: 14px;">Loading more memories...</p>`;
        triggerEl.style.display = "block";
    }
    
    if (scrollObserver) scrollObserver.disconnect(); 
    
    scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadMorePhotos(); 
        }
    }, { threshold: 0.1 });
    
    if (triggerEl) scrollObserver.observe(triggerEl); 
}

async function loadMorePhotos() {
    if (isFetching || !hasMorePhotos) return; 
    
    isFetching = true;
    const triggerEl = document.getElementById('scrollTrigger');
    triggerEl.style.display = 'block'; 

    try {
        const token = localStorage.getItem('eventhub_token');
        
        const response = await fetch(`${API_URL}/events/${currentEventId}/media?skip=${currentOffset}&limit=${FETCH_LIMIT}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const newPhotos = await response.json();

        if (newPhotos.length < FETCH_LIMIT) {
            hasMorePhotos = false; 
            triggerEl.innerHTML = `<p style="color: #666; font-weight: bold;">You've reached the end of the gallery!</p>`;
        } else {
            currentOffset += FETCH_LIMIT; 
        }

        const gallery = document.getElementById('galleryContainer');
        newPhotos.forEach(photo => renderPhotoCard(photo));

    } catch (error) {
        console.error("Failed to load next batch:", error);
    } finally {
        isFetching = false; 
    }
}

function renderPhotoCard(data) {
    const imageCard = document.createElement('div');
    imageCard.className = "photo-card"; 
    imageCard.style.position = "relative"; 
    
    if (data.file_type === 'video') {
        const videoElement = document.createElement('video');
        videoElement.controls = true;
        videoElement.style.cssText = "width: 100%; height: 200px; object-fit: cover; border-radius: 12px 12px 0 0;";
        videoElement.innerHTML = `<source src="${data.file_url}" type="video/mp4">`;
        imageCard.appendChild(videoElement);
    } 
    else if (data.file_type === 'archive' || data.file_type === 'document') {
        const docElement = document.createElement('div');
        docElement.style.cssText = "background: #2a2a40; height: 200px; display: flex; flex-direction: column; justify-content: center; align-items: center; border-radius: 12px 12px 0 0;";
        docElement.innerHTML = `
            <h3 style="color: white; font-size: 16px;">📁 Document</h3>
            <a href="${data.file_url}" target="_blank" style="background: #00f2fe; color: #1a1a2e; padding: 8px 15px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 10px; position: relative; z-index: 2;">Download</a>
        `;
        imageCard.appendChild(docElement);
    } 
    else if (data.file_type === 'link') {
        const linkElement = document.createElement('div');
        linkElement.style.cssText = "background: #1a1a2e; height: 200px; display: flex; flex-direction: column; justify-content: center; align-items: center; border-radius: 12px 12px 0 0; border: 2px solid #a875ff;";
        linkElement.innerHTML = `
            <h3 style="color: white; font-size: 16px;">🔗 Web Link</h3>
            <p style="color: #a0a0a0; font-size: 12px; margin-top: 5px; text-align: center; padding: 0 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 90%;">${data.file_url}</p>
            <a href="${data.file_url}" target="_blank" style="background: #a875ff; color: white; padding: 8px 15px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 10px; position: relative; z-index: 2;">Open Link</a>
        `;
        imageCard.appendChild(linkElement);
    }
    else {
        const imgElement = document.createElement('img');
        imgElement.src = data.file_url;
        imgElement.style.cssText = "width: 100%; height: 200px; object-fit: cover; border-radius: 12px 12px 0 0; cursor: pointer;";
        imgElement.onerror = () => { 
            imgElement.src = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20300%20200%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%23holder_18e0df%20text%20%7B%20fill%3A%23999%3Bfont-weight%3Anormal%3Bfont-family%3Avar(--bs-font-sans-serif)%2C%20sans-serif%3Bfont-size%3A18pt%20%7D%20%3C%2Fstyle%3E%3C%2Fdefs%3E%3Cg%20id%3D%22holder_18e0df%22%3E%3Crect%20width%3D%22300%22%20height%3D%22200%22%20fill%3D%22%23373940%22%3E%3C%2Frect%3E%3Cg%3E%3Ctext%20x%3D%2290%22%20y%3D%22105%22%3EAWS%20Blocked%20It%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E"; 
        };
        imgElement.addEventListener('click', () => {
            const lightbox = document.getElementById('lightbox');
            const lightboxImg = document.getElementById('lightboxImage');
            lightboxImg.src = data.file_url; 
            lightbox.style.display = "flex"; 
        });
        imageCard.appendChild(imgElement);
    }

    const deleteBtn = document.createElement('i');
    deleteBtn.className = "fa-solid fa-trash";
    deleteBtn.style.cssText = "position: absolute; top: 10px; right: 10px; color: #ff4757; background: rgba(0,0,0,0.6); padding: 10px; border-radius: 50%; cursor: pointer; transition: 0.2s; font-size: 14px; z-index: 10;";
    
    deleteBtn.onmouseover = () => deleteBtn.style.background = "rgba(0,0,0,0.9)";
    deleteBtn.onmouseout = () => deleteBtn.style.background = "rgba(0,0,0,0.6)";

    deleteBtn.addEventListener('click', async () => {
        const confirmDelete = confirm("Are you sure you want to delete this media forever?");
        if (!confirmDelete) return;

        const token = localStorage.getItem('eventhub_token');
        
        try {
            const response = await fetch(`${API_URL}/media/${data.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                imageCard.remove(); 
            } else {
                alert("You do not have permission to delete this file!");
            }
        } catch (error) {
            console.error("Delete failed:", error);
        }
    });

    imageCard.appendChild(deleteBtn);

    const actionBar = document.createElement('div');
    actionBar.style.cssText = "position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.7); padding: 5px 12px; border-radius: 20px; display: flex; gap: 15px; align-items: center; color: white; z-index: 10; font-weight: bold;";

    const likeBtn = document.createElement('div');
    likeBtn.style.cssText = "cursor: pointer; display: flex; gap: 5px; align-items: center; transition: 0.2s;";
    likeBtn.innerHTML = `<i class="fa-solid fa-heart" style="color: #ff4757;"></i> <span class="like-count">${data.likes || 0}</span>`;

    likeBtn.onmouseover = () => likeBtn.style.transform = "scale(1.1)";
    likeBtn.onmouseout = () => likeBtn.style.transform = "scale(1)";

    likeBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); 
        const token = localStorage.getItem('eventhub_token'); 
        try {
            const response = await fetch(`${API_URL}/media/${data.id}/like`, { 
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (response.ok) {
                const result = await response.json();
                likeBtn.querySelector('.like-count').innerText = result.likes;
                likeBtn.style.transform = "scale(1.3)";
                setTimeout(() => likeBtn.style.transform = "scale(1)", 200);
            }
        } catch (error) { console.error(error); }
    });

    const commentBtn = document.createElement('div');
    commentBtn.style.cssText = "cursor: pointer; display: flex; gap: 5px; align-items: center; transition: 0.2s;";
    commentBtn.innerHTML = `<i class="fa-solid fa-comment" style="color: #00f2fe;"></i> <span class="comment-count">${data.comments_count || 0}</span>`;
    
    commentBtn.onmouseover = () => commentBtn.style.transform = "scale(1.1)";
    commentBtn.onmouseout = () => commentBtn.style.transform = "scale(1)";

    const commentSection = document.createElement('div');
    commentSection.style.cssText = "display: none; background: #1a1a2e; padding: 15px; border-top: 1px solid #444; border-radius: 0 0 12px 12px; flex-direction: column; gap: 10px; z-index: 5;";
    
    const commentsList = document.createElement('div');
    commentsList.style.cssText = "max-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: #ccc;";
    
    const commentInputBox = document.createElement('div');
    commentInputBox.style.cssText = "display: flex; gap: 5px;";
    commentInputBox.innerHTML = `
        <input type="text" class="comment-input" placeholder="Add a comment..." style="flex: 1; padding: 8px; border-radius: 5px; border: none; background: rgba(255,255,255,0.1); color: white; outline: none;">
        <button class="post-comment-btn" style="background: #00f2fe; color: #1a1a2e; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">Post</button>
    `;

    commentSection.appendChild(commentsList);
    commentSection.appendChild(commentInputBox);

    function createCommentElement(commentObj) {
        const commentDiv = document.createElement('div');
        commentDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);";
        
        const textSpan = document.createElement('span');
        textSpan.innerHTML = `<strong style="color: #a875ff;">${commentObj.user_name}:</strong> ${commentObj.text}`;
        commentDiv.appendChild(textSpan);

        const deleteBtn = document.createElement('i');
        deleteBtn.className = "fa-solid fa-trash";
        deleteBtn.style.cssText = "color: #ff4757; cursor: pointer; font-size: 12px; opacity: 0.6; transition: 0.2s; padding-left: 10px;";
        
        deleteBtn.onmouseover = () => deleteBtn.style.opacity = "1";
        deleteBtn.onmouseout = () => deleteBtn.style.opacity = "0.6";

        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            const confirmDel = confirm("Delete this comment?");
            if (!confirmDel) return;

            const token = localStorage.getItem('eventhub_token');
            try {
                const res = await fetch(`${API_URL}/comments/${commentObj.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    commentDiv.remove(); 
                    commentBtn.querySelector('.comment-count').innerText = data.comments_count; 
                } else {
                    alert("You can only delete your own comments!"); 
                }
            } catch (err) { console.error(err); }
        };

        commentDiv.appendChild(deleteBtn);
        return commentDiv;
    }

    commentBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (commentSection.style.display === "none") {
            commentSection.style.display = "flex";
            
            const response = await fetch(`${API_URL}/media/${data.id}/comments`);
            if (response.ok) {
                const comments = await response.json();
                commentsList.innerHTML = ""; 
                comments.forEach(c => commentsList.appendChild(createCommentElement(c)));
            }
        } else {
            commentSection.style.display = "none";
        }
    });

    const postBtn = commentInputBox.querySelector('.post-comment-btn');
    const inputField = commentInputBox.querySelector('.comment-input');
    
    postBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = inputField.value.trim();
        if (!text) return;

        const token = localStorage.getItem('eventhub_token');
        postBtn.innerText = "...";
        
        try {
            const response = await fetch(`${API_URL}/media/${data.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ text: text })
            });

            if (response.ok) {
                const newComment = await response.json();
                commentsList.appendChild(createCommentElement(newComment));
                inputField.value = "";
                commentsList.scrollTop = commentsList.scrollHeight;
                
                commentBtn.querySelector('.comment-count').innerText = newComment.comments_count;
                commentBtn.style.transform = "scale(1.3)";
                setTimeout(() => commentBtn.style.transform = "scale(1)", 200);
            } else {
                alert("Please log in to comment!");
            }
        } catch (error) { console.error(error); }
        postBtn.innerText = "Post";
    });

    commentSection.addEventListener('click', (e) => e.stopPropagation());
    commentInputBox.querySelector('.comment-input').addEventListener('click', (e) => e.stopPropagation());

    actionBar.appendChild(likeBtn);
    actionBar.appendChild(commentBtn);

    const downloadBtn = document.createElement('div');
    downloadBtn.style.cssText = "cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; color: #a875ff; padding: 5px;";
    downloadBtn.innerHTML = `<i class="fa-solid fa-download" style="font-size: 18px;"></i>`;

    downloadBtn.onmouseover = () => downloadBtn.style.transform = "scale(1.2)";
    downloadBtn.onmouseout = () => downloadBtn.style.transform = "scale(1)";

    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadBtn.innerHTML = `<i class="fa-solid fa-hourglass-half" style="font-size: 16px;"></i>`; 
        window.location.href = `${API_URL}/media/${data.id}/download`;
        setTimeout(() => {
            downloadBtn.innerHTML = `<i class="fa-solid fa-download" style="font-size: 18px;"></i>`;
        }, 2000);
    });

    actionBar.appendChild(downloadBtn);
    imageCard.appendChild(actionBar);
    imageCard.appendChild(commentSection);

    const tagsContainer = document.createElement('div');
    tagsContainer.className = "tags-container";
    
    let tagsArray = [];
    if (data.ai_smart_tags && data.ai_smart_tags.length > 0) {
        tagsArray = data.ai_smart_tags; 
    } else if (data.ai_tags && data.ai_tags.trim() !== "") {
        tagsArray = data.ai_tags.split(',').map(tag => tag.trim()); 
    }
    if (tagsArray.length === 0) {
        tagsArray = ["Uncategorized"]; 
    }
    
    tagsArray.forEach(tag => {
        if (tag) {
            const tagPill = document.createElement('span');
            tagPill.className = "ai-tag";
            if (tag === "Uncategorized") {
                tagPill.style.background = "rgba(255, 255, 255, 0.1)";
                tagPill.style.color = "#a0a0a0";
            }
            tagPill.innerText = `#${tag.replace('#', '')}`; 
            tagsContainer.appendChild(tagPill);
        }
    });
    
    imageCard.appendChild(tagsContainer);
    
    if (folderView.style.display === "block") {
        galleryContainer.prepend(imageCard);
    } else {
        document.getElementById('globalSearchResults').prepend(imageCard);
    }
}

// FILE UPLOAD HANDLING

const uploadPreviewBox = document.getElementById('uploadPreviewBox');
const previewThumbnail = document.getElementById('previewThumbnail');
const confirmUploadBtn = document.getElementById('confirmUploadBtn');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
let pendingUploadFile = null; 

function handleFileSelection(file) {
    if (!file) return;
    pendingUploadFile = file; 
    previewThumbnail.src = URL.createObjectURL(file); 
    uploadPreviewBox.style.display = "block"; 
    uploadPreviewBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
        handleFileSelection(this.files[0]); 
    }
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => uploadZone.classList.add('drag-active'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => uploadZone.classList.remove('drag-active'), false);
});

uploadZone.addEventListener('drop', (e) => {
    let dt = e.dataTransfer;
    let files = dt.files;
    if (files && files.length > 0) {
        handleFileSelection(files[0]); 
    }
});

if (cancelUploadBtn) {
    cancelUploadBtn.addEventListener('click', () => {
        pendingUploadFile = null;
        previewThumbnail.src = "";
        uploadPreviewBox.style.display = "none";
        fileInput.value = ""; 
    });
}

if (confirmUploadBtn) {
    confirmUploadBtn.addEventListener('click', async () => {
        if (!pendingUploadFile) return;

        const originalText = confirmUploadBtn.innerHTML;
        confirmUploadBtn.innerHTML = "Uploading... ⏳";
        confirmUploadBtn.disabled = true;

        await uploadFileToAPI(pendingUploadFile);

        uploadPreviewBox.style.display = "none";
        pendingUploadFile = null;
        confirmUploadBtn.innerHTML = originalText;
        confirmUploadBtn.disabled = false;
    });
}

async function uploadFileToAPI(file) {
    if (!currentEventId) return alert("Error: No event folder selected!");

    const token = localStorage.getItem('eventhub_token'); 
    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(`${API_URL}/events/${currentEventId}/upload/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await response.json();

        if (data.message && data.message.includes("Duplicate")) {
            alert("This exact file is already in your gallery!");
            return; 
        }

        if (!response.ok) {
            if (response.status === 401) {
                alert("Your session expired. Please log in again!");
                window.location.href = 'login.html';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        renderPhotoCard(data);

    } catch (error) {
        console.error('Upload failed:', error);
        alert("Upload failed. Check console for details.");
    }
}

if (saveLinkBtn) {
    saveLinkBtn.addEventListener('click', async () => {
        if (!currentEventId) return alert("Please open a folder first!");

        const linkUrl = linkInput.value.trim();
        if (!linkUrl) return alert("Please paste a link first!");

        const token = localStorage.getItem('eventhub_token');
        const originalBtnHTML = saveLinkBtn.innerHTML;
        saveLinkBtn.innerHTML = "Saving... ⏳";

        try {
            const response = await fetch(`${API_URL}/events/${currentEventId}/add-link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ url: linkUrl })
            });

            if (response.ok) {
                const data = await response.json();
                renderPhotoCard(data); 
                linkInput.value = "";  
            } else {
                alert("Failed to save link.");
            }
        } catch (error) {
            console.error("Error saving link:", error);
        } finally {
            saveLinkBtn.innerHTML = originalBtnHTML;
        }
    });
}

// SEARCH FILTERS & AI TAGGING

globalSearchBtn.addEventListener('click', async () => {
    const tag = globalSearchInput.value.trim();
    if (!tag) return alert("Please enter a search tag!");

    globalSearchBtn.innerText = "Searching...";
    globalSearchResults.innerHTML = ""; 

    const token = localStorage.getItem('eventhub_token'); 

    try {
        const response = await fetch(`${API_URL}/media/search/tags?tag=${tag}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            
            if (data.results.length === 0) {
                globalSearchResults.innerHTML = `<p style="color: white; width: 100%; text-align: center;">No media found matching "${tag}".</p>`;
            } else {
                data.results.forEach(photo => renderPhotoCard(photo));
            }
        }
    } catch (error) {
        console.error("Search failed:", error);
    } finally {
        globalSearchBtn.innerText = "Search";
    }
});

const aiSearchBar = document.getElementById('aiSearchBar');

if (aiSearchBar) {
    aiSearchBar.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const allPhotoCards = document.querySelectorAll('.photo-card');

        allPhotoCards.forEach(card => {
            const tagsText = card.querySelector('.tags-container').innerText.toLowerCase();
            if (searchTerm === "" || tagsText.includes(searchTerm)) {
                card.style.display = "flex"; 
            } else {
                card.style.display = "none"; 
            }
        });
    });
}

// FACIAL RECOGNITION SEARCH

const findMeBtn = document.getElementById('findMeBtn');
const selfieUpload = document.getElementById('selfieUpload');

if (findMeBtn) {
    findMeBtn.addEventListener('click', () => {
        if (!currentEventId) return alert("Please open a folder first!");
        selfieUpload.click(); 
    });

    selfieUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const token = localStorage.getItem('eventhub_token');
        const formData = new FormData();
        formData.append("file", file);

        const originalText = findMeBtn.innerHTML;
        findMeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scanning Faces...`;
        findMeBtn.disabled = true;

        try {
            const response = await fetch(`${API_URL}/events/${currentEventId}/find-me`, {
                method: "POST",
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                const matchedPhotos = await response.json();
                galleryContainer.innerHTML = ""; 

                if (matchedPhotos.length === 0) {
                    galleryContainer.innerHTML = `<h3 style="color: white; text-align: center; width: 100%; margin-top: 50px;">No matches found in this folder. 😢</h3>`;
                } else {
                    matchedPhotos.forEach(photo => renderPhotoCard(photo));
                }

                const clearBtn = document.createElement('button');
                clearBtn.innerText = "Clear Search & Show All Photos";
                clearBtn.style.cssText = "grid-column: 1 / -1; width: 100%; padding: 15px; margin-bottom: 20px; background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid #444; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s;";
                clearBtn.onmouseover = () => clearBtn.style.background = "rgba(255, 255, 255, 0.2)";
                clearBtn.onmouseout = () => clearBtn.style.background = "rgba(255, 255, 255, 0.1)";
                
                clearBtn.onclick = () => openFolder(currentEventId, currentFolderName.innerText);
                galleryContainer.prepend(clearBtn);

            } else {
                alert("Failed to run facial recognition. Check backend logs.");
            }
        } catch (error) {
            console.error("AI Search Error:", error);
        } finally {
            findMeBtn.innerHTML = originalText;
            findMeBtn.disabled = false;
            selfieUpload.value = ""; 
        }
    });
}

// QR CODE GENERATOR

const shareFolderBtn = document.getElementById('shareFolderBtn');
const qrModal = document.getElementById('qrModal');
const closeQrModal = document.getElementById('closeQrModal');
const qrcodeContainer = document.getElementById('qrcode');

if (shareFolderBtn) {
    shareFolderBtn.addEventListener('click', () => {
        if (!currentEventId) return;

        qrcodeContainer.innerHTML = "";
        const shareUrl = `${window.location.origin}/index.html?folder_id=${currentEventId}`;

        new QRCode(qrcodeContainer, {
            text: shareUrl,
            width: 250,
            height: 250,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        qrModal.style.display = "flex";
    });
}

if (closeQrModal) {
    closeQrModal.addEventListener('click', () => {
        qrModal.style.display = "none";
    });
}

if (qrModal) {
    qrModal.addEventListener('click', (e) => {
        if (e.target.id === 'qrModal') {
            qrModal.style.display = "none";
        }
    });
}

// LIGHTBOX CONTROLS

const lightbox = document.getElementById('lightbox');
const closeLightbox = document.getElementById('closeLightbox');

closeLightbox.addEventListener('click', () => lightbox.style.display = "none");

lightbox.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') lightbox.style.display = "none";
});

// INITIALIZATION

loadNavbarProfile(); 
loadFolders();
