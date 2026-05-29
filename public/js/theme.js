// Settings panel open/close
const pageMenu = document.querySelector('.users__settings-menu');
const pageSettings = document.querySelector('.page__settings');
const closeButton = document.querySelector('.page__settings--close-button');

pageMenu.addEventListener('click', () => {
    pageSettings.classList.add('page__settings--opened');
});

closeButton.addEventListener('click', () => {
    pageSettings.classList.remove('page__settings--opened');
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        pageSettings.classList.remove('page__settings--opened');
    }
});
