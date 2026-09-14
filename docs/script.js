const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('#site-nav');

menuButton?.addEventListener('click', () => {
  const open = navigation.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});

navigation?.addEventListener('click', () => {
  navigation.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
});

document.querySelector('.copy-demo')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText('shopping-v1-k3m7q2fz@mail.example.com');
    button.textContent = 'copied!';
    window.setTimeout(() => { button.textContent = 'copy'; }, 1500);
  } catch {
    button.textContent = 'example';
  }
});
