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

const elementsWithClasses = [
    { selector: '.users__item', className: 'users__item--light', isMultiple: true },
    { selector: '.messages__item', className: 'messages__item--light', isMultiple: true },
    { selector: '.page__settings_user-name', className: 'page__settings_user-name--light' },
    { selector: '.users__logout', className: 'users__logout--light' },
    { selector: '.page__settings-add-operator', className: 'page__settings-add-operator--light' },
    { selector: '.page__settings-operator-role', className: 'page__settings-operator-role--light' },
    { selector: '.users__name', className: 'users__name--light', isMultiple: true },
    { selector: usersAside, className: 'users__light--theme' },
    { selector: searchBar, className: 'users__search--light' },
    { selector: form, className: 'messages__form--light' },
    { selector: messagesContent, className: 'messages--light' },
    { selector: themeToggle, className: 'page__theme--light' },
    { selector: pageMenu, className: 'users__settings-menu--light' },
    { selector: pageSettings, className: 'page__settings--light' }
];

function toggleClasses(isLight) {
    elementsWithClasses.forEach(item => {
        if (item.isMultiple) {
            document.querySelectorAll(item.selector).forEach(el => el.classList.toggle(item.className, isLight));
        } else {
            const element = typeof item.selector === 'string' ? document.querySelector(item.selector) : item.selector;
            if (element) {
                element.classList.toggle(item.className, isLight);
            }
        }
    });
}

themeToggle.addEventListener('click', () => {
    isLight = !isLight;
    toggleClasses(isLight);
    localStorage.setItem('theme', JSON.stringify(isLight));
});

function handleDynamicElements() {
    const dynamicSelectors = [
        { selector: '.messages__item', className: 'messages__item--light', isMultiple: true },
        { selector: '.users__item', className: 'users__item--light', isMultiple: true }
    ];

    dynamicSelectors.forEach(item => {
        if (item.isMultiple) {
            document.querySelectorAll(item.selector).forEach(el => {
                if (isLight) {
                    el.classList.add(item.className);
                } else {
                    el.classList.remove(item.className);
                }
            });
        }
    });
}

setInterval(() => {
    handleDynamicElements();
}, 1000);

window.addEventListener('load', () => {
    toggleClasses(isLight);
});