// I'm a JS magician :)
// === UI FUNCTIONS ===
function changeContent(content) {
    var container = document.getElementsByClassName("container")[0];
    var header = container.children[0];
    if (header.classList.contains("container-row-single")) {
        header.classList.remove("container-row-single");
        header.classList.add("container-row-animation");
    }

    while (container.childElementCount > 1) {
        container.children[1].remove();
    }

    content.forEach(e => {
        container.appendChild(e);
    });
}

function changeForm(buttonText, callback, textPlaceholder, needPin) {
    // We can change Input to textInput with button or only button
    var textInput = document.getElementById("form-text-input");
    var buttonInput = document.getElementById("form-button-input");

    var pinInput = document.getElementById("form-pin-input");
    if (!needPin && pinInput) pinInput.remove();

    if (textPlaceholder == undefined) {
        if (textInput) textInput.remove();
        buttonInput.classList.remove("button-part");
        buttonInput.classList.add("button-full");
    } else {
        if (textInput) {
            textInput.placeholder = textPlaceholder;
            textInput.value = "";
        }         
        buttonInput.classList.remove("button-full");
        buttonInput.classList.add("button-part");
    }

    buttonInput.innerText = buttonText;
    buttonInput.onclick = callback;
}

function error(text) {
    var container = document.getElementsByClassName("container")[0];
    var header = container.children[0];
    header.innerText = text;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

// === API ===

function createUser() {
    // Use to add create new user cookie. Afterwards check Status
    var inputText = document.getElementById("form-text-input");
    var pinText = document.getElementById("form-pin-input");
    var content = new URLSearchParams({'user':inputText.value, 'pin':pinText.value});
    userPin = pinText.value;
    fetch(cur_url + '/new', { method: 'POST', body: content})
    .then(function(response) {
        if (response.status == 200) {
            fireConfetti();
            changePictureTongue();
            emojiRotationAnimation();
            checkStatus();
        }
    });
}

function joinBday() {
    fetch(cur_url + '/add', { method: 'POST' })
    .then(function(response) {
        if (response.status == 200) {
            fireConfetti();
            changePictureTongue();
            emojiRotationAnimation();
            checkStatus();
        }
    });
}

function leaveBday() {
    changePictureSad();
    fetch(cur_url + '/remove', { method: 'POST' })
    .then(function(response) {
        if (response.status == 200) {
            checkStatus();
        }
    });
}

function dec(a, x) {
    let s = Uint8Array.from(atob(a), c => c.charCodeAt(0))
    let r = ""
    for (i=0; i<s.length; i++)
        r += String.fromCharCode(s[i] ^ x.charCodeAt(0));
    return r;
};

function updateBday() {
    fetch(cur_url + '/details')
    .then(res => res.json())
    .then(function(data) {
        var descriptionRow = document.createElement('div');
        descriptionRow.classList.add("container-row");
        var des = escapeHtml(dec(data.description, data.admin)).replaceAll('\n', '<br>');
        descriptionRow.innerHTML = "<u>What is the plan?</u><p>" + des + "</p>";

        var timeRow = document.createElement('div');
        timeRow.classList.add("container-row");
        timeRow.innerHTML = "<u>When?</u><p>" + escapeHtml(data.time) + "</p>";

        var locRow = document.createElement('div');
        locRow.classList.add("container-row");
        locRow.innerHTML = "<u>Where?</u><p>" + escapeHtml(data.loc) + "</p>";

        var namesRow = document.createElement('div');
        var usersDiv = document.createElement('div');
        usersDiv.classList.add("name-field");
        data.guestlist.forEach(user => {
            var div = document.createElement('div');
            if (data.joined.includes(user.name)) {
                div.innerText = escapeHtml(user.name) + " (✓)";
                div.classList.add("accept");
            } else {
                div.innerText = escapeHtml(user.name) + " (?)";
                div.classList.add("maybe");
            }
            if (user.pin != "****")
                div.onclick = () => alert(cur_url + "?name=" + user.name + "&pin=" + user.pin);
            usersDiv.appendChild(div);
        });
        namesRow.classList.add("container-row");
        namesRow.innerHTML = "<u>Who is invited?</u>";
        namesRow.appendChild(usersDiv);

        var logoutRow = document.createElement('div');
        logoutRow.classList.add("container-row");
        var partyId = document.location.pathname.split('/').pop();
        logoutRow.innerHTML = "<p>Logout? Ok... but remember your pin: " + userPin + "</p>"
            + "<form class='container-row-form' method='post' action='" + window.location.pathname + "/updatepw'>"
            + "<input type='text' name='pin' placeholder='New Pin'>"
            + "<button id='form-button-input' class='button-part'>Change</button></form>"
            + "<p><a id='logout' href='/logout?r=" + partyId + "'>Logout</a></p>";
        changeContent([descriptionRow, namesRow, timeRow, locRow, logoutRow]);
    });
}

async function checkStatus() {
    fetch(cur_url + '/state')
    .then(res => res.json())
    .then(function(data) {
        console.log(data)
        let stat = data.status;
        if (stat == "null") {
            changeForm("View", createUser, "Name", true);

            var textInput = document.getElementById("form-text-input");
            var pinInput = document.getElementById("form-pin-input");
            const queryString = window.location.search;
            const urlParams = new URLSearchParams(queryString);
            textInput.value = urlParams.get('name');
            pinInput.value = urlParams.get('pin');
            return;
        }
        if (stat == "unauthorized") {
            error("Sorry, but you are not invited!");
            return;
        }
        if (stat == "invited") {
            changeForm("Click here to join!", joinBday);
            updateBday();
            return;
        }
        if (stat == "joined") {
            changeForm("Sorry, I'm out...", leaveBday);
            updateBday();
            return;
        }
    });
}

// === EMOJI ===

function changePicture(n) {
    var imgs = document.getElementsByClassName("emoji-img"); 
    for(var i = 0; i < imgs.length; i++)
        imgs[i].src = "/static/pirate0" + String(n) + ".png";
}

function changePictureSad() {
    changePicture(3);
    setTimeout(() => changePicture(1), 1500);
}

function changePictureTongue() {
    changePicture(2);
    setTimeout(() => changePicture(1), 700);
}

function emojiIdleAnimation() {
    var emoji = document.getElementsByClassName("z-text")[0];
    emoji.classList.add("animation-idle");
    emoji.classList.remove("animation-rotate")
}

function emojiRotationAnimation() {
    var emoji = document.getElementsByClassName("z-text")[0];
    emoji.classList.add("animation-rotate");
    emoji.classList.remove("animation-idle");

    setTimeout(() => {
        emojiIdleAnimation()
    }, 4000);
}

function fireConfetti() {
    var cCanvas = document.createElement('canvas');
    cCanvas.width =  window.innerWidth;
    cCanvas.height =  window.innerHeight;
    document.body.appendChild(cCanvas);

    var cConfetti = window.confetti.create(cCanvas, {
        resize: true,
        useWorker: true
    });
    cConfetti({
        particleCount: 200,
        spread: 160
    });

    setTimeout(() => {
        cConfetti.reset();
        document.body.removeChild(cCanvas);
    }, 5000);
}

let cur_url = null;
let userPin = null;
// === INIT ===
setTimeout(() => {
    cur_url = window.location.origin + window.location.pathname;
    userPin = document.getElementById("user-pin").value;
    checkStatus();
    emojiIdleAnimation();
}, 0);
