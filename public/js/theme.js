let themeToggle = document.querySelector('.page__theme');
let usersAside = document.querySelector('.users');
let pageSettings = document.querySelector('.page__settings');
let blackLayer = document.querySelector('.messages__black-layer');

let pageMenu = document.querySelector('.users__settings-menu');
let closeButton = document.querySelector('.page__settings--close-button');

let smileContent = document.querySelector('.messages__smile-icons');

let smiles = smileContent.children;

let smilesArr = ['😂', '👍', '😡', '👌', '👋🏻'];

for (let i = 0; i < smiles.length; i++) {
    smiles[i].addEventListener('click', () => {
        messageInput.value += smilesArr[i];
        messageInput.focus();
    });
}

let isLight = JSON.parse(localStorage.getItem('theme'));

let isOpened = false;

pageMenu.addEventListener('click', () => {
    blackLayer.classList.add('messages__black-layer--opened');
    pageSettings.classList.add('page__settings--opened');
});

closeButton.addEventListener('click', () => {
    blackLayer.classList.remove('messages__black-layer--opened');
    pageSettings.classList.remove('page__settings--opened');
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        blackLayer.classList.remove('messages__black-layer--opened');
        pageSettings.classList.remove('page__settings--opened');
    }
});


themeToggle.addEventListener('click', () => {
    if (isLight) {
        usersAside.classList.remove('users__light--theme');
        document.querySelectorAll('.users__item').forEach(el => el.classList.remove('users__item--light'));
        searchBar.classList.remove('users__search--light');
        form.classList.remove('messages__form--light');
        messagesContent.classList.remove('messages--light');
        document.querySelectorAll('.messages__item').forEach(el => el.classList.remove('messages__item--light'));
        themeToggle.classList.remove('page__theme--light');
        pageSettings.classList.remove('page__settings--light');
        pageMenu.classList.remove('users__settings-menu--light');
        document.querySelectorAll('.users__name').forEach(el => el.classList.remove('users__name--light'))
        document.querySelector('.page__settings_user-name').classList.remove('page__settings_user-name--light')
        document.querySelector('.users__logout').classList.remove('users__logout--light')
        isLight = false;
        JSON.stringify(localStorage.setItem('theme', isLight))
    } else {
        usersAside.classList.add('users__light--theme');
        document.querySelectorAll('.users__item').forEach(el => el.classList.add('users__item--light'));
        searchBar.classList.add('users__search--light');
        form.classList.add('messages__form--light');
        messagesContent.classList.add('messages--light');
        document.querySelectorAll('.messages__item').forEach(el => el.classList.add('messages__item--light'));
        themeToggle.classList.add('page__theme--light');
        pageSettings.classList.add('page__settings--light');
        document.querySelector('.page__settings_user-name').classList.add('page__settings_user-name--light')
        document.querySelector('.users__logout').classList.add('users__logout--light');
        pageMenu.classList.add('users__settings-menu--light');
        document.querySelectorAll('.users__name').forEach(el => el.classList.add('users__name--light'))
        isLight = true;
        JSON.stringify(localStorage.setItem('theme', isLight))
    }
});

window.addEventListener('load', () => {
    setTimeout(() => {
        if (isLight) {
            usersAside.classList.add('users__light--theme');
            document.querySelectorAll('.users__item').forEach(el => el.classList.add('users__item--light'));
            searchBar.classList.add('users__search--light');
            form.classList.add('messages__form--light');
            messagesContent.classList.add('messages--light');
            document.querySelectorAll('.messages__item').forEach(el => el.classList.add('messages__item--light'));
            document.querySelector('.page__settings_user-name').classList.add('page__settings_user-name--light')
            themeToggle.classList.add('page__theme--light');
            document.querySelector('.users__logout').classList.add('users__logout--light');
            pageMenu.classList.add('users__settings-menu--light');
            pageSettings.classList.add('page__settings--light');
            document.querySelectorAll('.users__name').forEach(el => el.classList.add('users__name--light'))
        } else {
            usersAside.classList.remove('users__light--theme');
            document.querySelectorAll('.users__item').forEach(el => el.classList.remove('users__item--light'));
            searchBar.classList.remove('users__search--light');
            form.classList.remove('messages__form--light');
            messagesContent.classList.remove('messages--light');
            document.querySelectorAll('.messages__item').forEach(el => el.classList.remove('messages__item--light'));
            document.querySelector('.page__settings_user-name').classList.remove('page__settings_user-name--light')
            pageMenu.classList.remove('users__settings-menu--light');
            document.querySelector('.users__logout').classList.remove('users__logout--light')
            themeToggle.classList.remove('page__theme--light');
            pageSettings.classList.remove('page__settings--light');
            document.querySelectorAll('.users__name').forEach(el => el.classList.remove('users__name--light'))
        }
    }, 100);
});